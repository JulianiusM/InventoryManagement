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
                supportsLocalCouch: false, supportsLocalLAN: false,
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
                supportsLocalCouch: true, supportsLocalLAN: false,
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
                supportsLocalCouch: true, supportsLocalLAN: false,
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
jest.mock('../../src/modules/database/services/ItemService');
jest.mock('../../src/modules/database/services/LoanService');
jest.mock('../../src/modules/database/services/BarcodeService');
jest.mock('../../src/modules/database/services/ExternalAccountService');
jest.mock('../../src/modules/database/services/GameExternalMappingService');
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/PartyService');
jest.mock('../../src/modules/games/GameSyncService');
jest.mock('../../src/modules/database/services/SimilarTitlePairService');
jest.mock('../../src/modules/database/services/SyncJobService');

import * as gameTitleService from '../../src/modules/database/services/GameTitleService';
import * as gameMappingService from '../../src/modules/database/services/GameExternalMappingService';
import * as similarTitlePairService from '../../src/modules/database/services/SimilarTitlePairService';
import * as syncJobService from '../../src/modules/database/services/SyncJobService';
import * as itemService from '../../src/modules/database/services/ItemService';
import * as loanService from '../../src/modules/database/services/LoanService';
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
            setupMock(itemService.getItemById as jest.Mock, null);

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
            // Map copyType to gameCopyType for the new Item-based structure
            const mappedCopy = {
                ...existingCopy,
                gameCopyType: existingCopy.copyType,
            };
            setupMock(itemService.getItemById as jest.Mock, mappedCopy);

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
                gameCopyType: 'physical_copy',
                lendable: true,
                ownerId: TEST_USER_ID,
            };
            const existingLoan = {id: 'uuid-loan-1', status: 'active'};

            setupMock(itemService.getItemById as jest.Mock, existingCopy);
            setupMock(loanService.getActiveLoanByItemId as jest.Mock, existingLoan);

            await verifyThrowsError(
                () => gamesController.lendGameCopy({
                    gameCopyId: 'uuid-copy-1',
                    partyId: 'uuid-party-1',
                }, TEST_USER_ID),
                'already on loan'
            );
        });
    });

    describe('metadata management', () => {
        // Setup mocks specific to metadata management tests
        beforeEach(() => {
            setupMock(gameMappingService.getPendingMappings as jest.Mock, []);
            setupMock(gameTitleService.getAllGameTitles as jest.Mock, []);
            if (similarTitlePairService.getSimilarPairsForDisplay) {
                setupMock(similarTitlePairService.getSimilarPairsForDisplay as jest.Mock, []);
            }
            if (similarTitlePairService.getSimilarPairCount) {
                setupMock(similarTitlePairService.getSimilarPairCount as jest.Mock, 0);
            }
            if (similarTitlePairService.resetSimilarDismissals) {
                setupMock(similarTitlePairService.resetSimilarDismissals as jest.Mock, 0);
            }
            if (syncJobService.createSimilarityAnalysisJob) {
                setupMock(syncJobService.createSimilarityAnalysisJob as jest.Mock, {id: 'job-1'});
            }
            setupMock(gameTitleService.findTitlesMissingMetadata as jest.Mock, []);
            setupMock(gameTitleService.findTitlesWithInvalidPlayerCounts as jest.Mock, []);
            setupMock(gameTitleService.getMetadataIssueCounts as jest.Mock, {
                similarCount: 0,
                missingMetadataCount: 0,
                invalidPlayersCount: 0,
                totalCount: 0,
            });
        });

        describe('getMetadataManagementData', () => {
            test('returns all metadata management data', async () => {
                const result = await gamesController.getMetadataManagementData(TEST_USER_ID);
                
                expect(result).toBeDefined();
                expect(result.counts).toBeDefined();
                expect(result.similarPairs).toBeDefined();
                expect(result.missingMetadata).toBeDefined();
                expect(result.invalidPlayers).toBeDefined();
                expect(result.mappings).toBeDefined();
            });
        });

        describe('dismissTitle', () => {
            test('throws error when title not found', async () => {
                setupMock(gameTitleService.getGameTitleById as jest.Mock, null);

                await verifyThrowsError(
                    () => gamesController.dismissTitle('nonexistent', 'similar', TEST_USER_ID),
                    'not found'
                );
            });

            test('throws error when user does not own title', async () => {
                const otherUserTitle = {
                    id: 'title-1',
                    name: 'Test Game',
                    ownerId: 999, // Different owner
                };
                setupMock(gameTitleService.getGameTitleById as jest.Mock, otherUserTitle);

                await verifyThrowsError(
                    () => gamesController.dismissTitle('title-1', 'similar', TEST_USER_ID),
                    'permission'
                );
            });
        });

        describe('undismissTitle', () => {
            test('throws error when title not found', async () => {
                setupMock(gameTitleService.getGameTitleById as jest.Mock, null);

                await verifyThrowsError(
                    () => gamesController.undismissTitle('nonexistent', 'similar', TEST_USER_ID),
                    'not found'
                );
            });
        });

        describe('resetDismissals', () => {
            test('calls service with correct parameters', async () => {
                setupMock(gameTitleService.resetDismissals as jest.Mock, 5);

                const result = await gamesController.resetDismissals(TEST_USER_ID, 'similar');
                
                expect(result).toBe(5);
                expect(gameTitleService.resetDismissals).toHaveBeenCalledWith(TEST_USER_ID, 'similar');
            });

            test('can reset all dismissals', async () => {
                setupMock(gameTitleService.resetDismissals as jest.Mock, 10);

                const result = await gamesController.resetDismissals(TEST_USER_ID, undefined);
                
                expect(result).toBe(10);
                expect(gameTitleService.resetDismissals).toHaveBeenCalledWith(TEST_USER_ID, undefined);
            });
        });
    });
});
