/**
 * Tests for playniteController
 * 
 * Tests Playnite-specific import validation and processing.
 * Device management is now handled via generic push connector APIs.
 */

import {
    validImportPayloads,
    invalidImportPayloads,
    TEST_USER_ID,
    TEST_DEVICE_ID,
} from '../data/controller/playniteData';
import {setupMock} from '../keywords/common/controllerKeywords';

// Mock the import service
jest.mock('../../src/modules/games/PlayniteImportService');

import * as playniteImportService from '../../src/modules/games/PlayniteImportService';
import * as playniteController from '../../src/controller/playniteController';

describe('playniteController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validateImportPayload', () => {
        test.each(validImportPayloads)('validates $description', ({payload}) => {
            const result = playniteController.validateImportPayload(payload);

            expect(result).toBeDefined();
            expect(result.aggregator).toBe('playnite');
            expect(result.games).toBeDefined();
        });

        test.each(invalidImportPayloads)('rejects $description', ({payload, errorPattern}) => {
            expect(() => playniteController.validateImportPayload(payload)).toThrow(errorPattern);
        });
    });

    describe('importPlayniteLibrary', () => {
        test('processes valid import payload', async () => {
            const mockImportResult = {
                deviceId: TEST_DEVICE_ID,
                importedAt: '2026-01-08T20:15:00Z',
                counts: {
                    received: 2,
                    created: 2,
                    updated: 0,
                    unchanged: 0,
                    softRemoved: 0,
                    needsReview: 0,
                },
                warnings: [],
            };
            setupMock(playniteImportService.processPlayniteImport as jest.Mock, mockImportResult);

            const payload = validImportPayloads[1].payload; // Full payload with multiple games
            const result = await playniteController.importPlayniteLibrary(
                TEST_DEVICE_ID,
                TEST_USER_ID,
                payload as any
            );

            expect(result).toBeDefined();
            expect(result.deviceId).toBe(TEST_DEVICE_ID);
            expect(result.counts.received).toBe(2);
            expect(playniteImportService.processPlayniteImport).toHaveBeenCalledWith(
                TEST_DEVICE_ID,
                TEST_USER_ID,
                expect.objectContaining({aggregator: 'playnite'})
            );
        });

        test('includes warnings for missing game IDs', async () => {
            const mockImportResult = {
                deviceId: TEST_DEVICE_ID,
                importedAt: '2026-01-08T20:15:00Z',
                counts: {
                    received: 1,
                    created: 1,
                    updated: 0,
                    unchanged: 0,
                    softRemoved: 0,
                    needsReview: 1,
                },
                warnings: [
                    {code: 'MISSING_ORIGINAL_GAME_ID', count: 1},
                ],
            };
            setupMock(playniteImportService.processPlayniteImport as jest.Mock, mockImportResult);

            const payload = validImportPayloads[2].payload; // Custom game without provider game ID
            const result = await playniteController.importPlayniteLibrary(
                TEST_DEVICE_ID,
                TEST_USER_ID,
                payload as any
            );

            expect(result.warnings).toContainEqual(
                expect.objectContaining({code: 'MISSING_ORIGINAL_GAME_ID'})
            );
        });

        test('rejects invalid payload', async () => {
            const invalidPayload = {aggregator: 'steam'}; // Wrong aggregator

            await expect(
                playniteController.importPlayniteLibrary(TEST_DEVICE_ID, TEST_USER_ID, invalidPayload as any)
            ).rejects.toThrow(/aggregator/i);

            expect(playniteImportService.processPlayniteImport).not.toHaveBeenCalled();
        });
    });
});
