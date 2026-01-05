/**
 * Tests for gamesController and GameValidationService
 */

import {
    validPlayerProfileData,
    invalidPlayerProfileData,
    createGameTitleData,
    createGameTitleErrorData,
    lendGameCopyErrorData,
    TEST_USER_ID,
} from '../data/controller/gamesData';
import {setupMock, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Test the validation service directly (no mocks needed)
import {
    validatePlayerProfile,
    getEffectivePlayerCounts,
    PlayerProfileValidationError,
} from '../../src/modules/database/services/GameValidationService';

describe('GameValidationService', () => {
    describe('validatePlayerProfile', () => {
        test.each(validPlayerProfileData)('validates $description', ({profile}) => {
            // Should not throw
            expect(() => validatePlayerProfile(profile)).not.toThrow();
        });

        test.each(invalidPlayerProfileData)('rejects $description', ({profile, expectedError}) => {
            expect(() => validatePlayerProfile(profile)).toThrow(expectedError);
        });
    });

    describe('getEffectivePlayerCounts', () => {
        test('returns null for unsupported mode', () => {
            const profile = {
                overallMinPlayers: 1,
                overallMaxPlayers: 4,
                supportsOnline: false,
                supportsLocal: false,
                supportsPhysical: false,
            };
            expect(getEffectivePlayerCounts(profile, 'online')).toBeNull();
            expect(getEffectivePlayerCounts(profile, 'local')).toBeNull();
            expect(getEffectivePlayerCounts(profile, 'physical')).toBeNull();
        });

        test('falls back to overall when mode-specific not provided', () => {
            const profile = {
                overallMinPlayers: 1,
                overallMaxPlayers: 8,
                supportsOnline: true,
                supportsLocal: true,
                supportsPhysical: false,
            };
            expect(getEffectivePlayerCounts(profile, 'online')).toEqual({min: 1, max: 8});
            expect(getEffectivePlayerCounts(profile, 'local')).toEqual({min: 1, max: 8});
        });

        test('uses mode-specific values when provided', () => {
            const profile = {
                overallMinPlayers: 1,
                overallMaxPlayers: 16,
                supportsOnline: true,
                supportsLocal: true,
                supportsPhysical: true,
                onlineMinPlayers: 2,
                onlineMaxPlayers: 16,
                localMinPlayers: 1,
                localMaxPlayers: 4,
                physicalMinPlayers: 3,
                physicalMaxPlayers: 10,
            };
            expect(getEffectivePlayerCounts(profile, 'online')).toEqual({min: 2, max: 16});
            expect(getEffectivePlayerCounts(profile, 'local')).toEqual({min: 1, max: 4});
            expect(getEffectivePlayerCounts(profile, 'physical')).toEqual({min: 3, max: 10});
        });
    });
});

// Mock the services for controller tests
jest.mock('../../src/modules/database/services/GameTitleService');
jest.mock('../../src/modules/database/services/GameReleaseService');
jest.mock('../../src/modules/database/services/GameCopyService');
jest.mock('../../src/modules/database/services/GameCopyLoanService');
jest.mock('../../src/modules/database/services/GameCopyBarcodeService');
jest.mock('../../src/modules/database/services/ExternalAccountService');
jest.mock('../../src/modules/database/services/GameExternalMappingService');
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/PartyService');
jest.mock('../../src/modules/games/GameSyncService');

import * as gameTitleService from '../../src/modules/database/services/GameTitleService';
import * as gameCopyService from '../../src/modules/database/services/GameCopyService';
import * as gameCopyLoanService from '../../src/modules/database/services/GameCopyLoanService';
import * as gamesController from '../../src/controller/gamesController';

describe('gamesController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createGameTitle', () => {
        test.each(createGameTitleData)('$description', async ({input, ownerId}) => {
            const mockCreatedTitle = {id: 'uuid-1', ...input, ownerId};
            setupMock(gameTitleService.createGameTitle as jest.Mock, mockCreatedTitle);

            const result = await gamesController.createGameTitle(input, ownerId);

            expect(result).toBeDefined();
            expect(result.id).toBe('uuid-1');
            expect(gameTitleService.createGameTitle).toHaveBeenCalled();
        });

        test.each(createGameTitleErrorData)('$description', async ({input, ownerId, errorMessage}) => {
            await verifyThrowsError(
                () => gamesController.createGameTitle(input as Parameters<typeof gamesController.createGameTitle>[0], ownerId),
                errorMessage
            );
        });
    });

    describe('lendGameCopy', () => {
        test('throws error when copy not found', async () => {
            setupMock(gameCopyService.getGameCopyById as jest.Mock, null);

            await verifyThrowsError(
                () => gamesController.lendGameCopy({
                    gameCopyId: 'uuid-999',
                    partyId: 'uuid-party-1',
                }, TEST_USER_ID),
                'Game copy not found'
            );
        });

        test.each(lendGameCopyErrorData)('$description', async ({
            gameCopyId,
            partyId,
            existingCopy,
            ownerId,
            errorMessage
        }) => {
            setupMock(gameCopyService.getGameCopyById as jest.Mock, existingCopy);

            await verifyThrowsError(
                () => gamesController.lendGameCopy({
                    gameCopyId,
                    partyId,
                }, ownerId),
                errorMessage
            );
        });

        test('throws error when copy is already on loan', async () => {
            const existingCopy = {
                id: 'uuid-copy-1',
                copyType: 'physical_copy',
                lendable: true,
                ownerId: TEST_USER_ID,
            };
            const existingLoan = {id: 'uuid-loan-1', status: 'active'};

            setupMock(gameCopyService.getGameCopyById as jest.Mock, existingCopy);
            setupMock(gameCopyLoanService.getActiveLoanByGameCopyId as jest.Mock, existingLoan);

            await verifyThrowsError(
                () => gamesController.lendGameCopy({
                    gameCopyId: 'uuid-copy-1',
                    partyId: 'uuid-party-1',
                }, TEST_USER_ID),
                'already on loan'
            );
        });
    });
});
