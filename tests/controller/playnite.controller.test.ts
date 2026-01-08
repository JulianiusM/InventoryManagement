/**
 * Tests for playniteController
 */

import {
    validImportPayloads,
    invalidImportPayloads,
    registerDeviceData,
    registerDeviceErrorData,
    TEST_USER_ID,
    TEST_DEVICE_ID,
} from '../data/controller/playniteData';
import {setupMock, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Mock the services
jest.mock('../../src/modules/database/services/PlayniteDeviceService');
jest.mock('../../src/modules/games/PlayniteImportService');

import * as playniteDeviceService from '../../src/modules/database/services/PlayniteDeviceService';
import * as playniteImportService from '../../src/modules/games/PlayniteImportService';
import * as playniteController from '../../src/controller/playniteController';

describe('playniteController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('registerDevice', () => {
        test.each(registerDeviceData)('$description', async ({deviceName, userId}) => {
            const mockResult = {
                deviceId: TEST_DEVICE_ID,
                token: 'mock-token-12345',
            };
            setupMock(playniteDeviceService.createDevice as jest.Mock, mockResult);

            const result = await playniteController.registerDevice(deviceName, userId);

            expect(result).toBeDefined();
            expect(result.deviceId).toBe(TEST_DEVICE_ID);
            expect(result.token).toBe('mock-token-12345');
            expect(playniteDeviceService.createDevice).toHaveBeenCalledWith(userId, deviceName.trim());
        });

        test.each(registerDeviceErrorData)('$description', async ({deviceName, userId, errorPattern}) => {
            await verifyThrowsError(
                () => playniteController.registerDevice(deviceName, userId as number),
                errorPattern
            );
        });
    });

    describe('listDevices', () => {
        test('returns list of devices for user', async () => {
            const mockDevices = [
                {
                    id: TEST_DEVICE_ID,
                    name: 'Gaming PC',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: new Date('2026-01-05'),
                    lastImportAt: new Date('2026-01-05'),
                    revokedAt: null,
                    userId: TEST_USER_ID,
                },
            ];
            setupMock(playniteDeviceService.getDevicesByUserId as jest.Mock, mockDevices);

            const result = await playniteController.listDevices(TEST_USER_ID);

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe(TEST_DEVICE_ID);
            expect(result[0].status).toBe('active');
        });

        test('marks revoked devices correctly', async () => {
            const mockDevices = [
                {
                    id: TEST_DEVICE_ID,
                    name: 'Old PC',
                    createdAt: new Date('2026-01-01'),
                    lastSeenAt: null,
                    lastImportAt: null,
                    revokedAt: new Date('2026-01-03'),
                    userId: TEST_USER_ID,
                },
            ];
            setupMock(playniteDeviceService.getDevicesByUserId as jest.Mock, mockDevices);

            const result = await playniteController.listDevices(TEST_USER_ID);

            expect(result[0].status).toBe('revoked');
        });

        test('requires authentication', async () => {
            await verifyThrowsError(
                () => playniteController.listDevices(undefined as unknown as number),
                /authentication required/i
            );
        });
    });

    describe('revokeDevice', () => {
        test('revokes device owned by user', async () => {
            const mockDevice = {
                id: TEST_DEVICE_ID,
                userId: TEST_USER_ID,
                name: 'Gaming PC',
            };
            setupMock(playniteDeviceService.getDeviceById as jest.Mock, mockDevice);
            setupMock(playniteDeviceService.revokeDevice as jest.Mock, undefined);

            await playniteController.revokeDevice(TEST_DEVICE_ID, TEST_USER_ID);

            expect(playniteDeviceService.revokeDevice).toHaveBeenCalledWith(TEST_DEVICE_ID);
        });

        test('throws error for non-existent device', async () => {
            setupMock(playniteDeviceService.getDeviceById as jest.Mock, null);

            await verifyThrowsError(
                () => playniteController.revokeDevice('non-existent', TEST_USER_ID),
                /device not found/i
            );
        });

        test('throws error when user does not own device', async () => {
            const mockDevice = {
                id: TEST_DEVICE_ID,
                userId: 999, // Different user
                name: 'Other PC',
            };
            setupMock(playniteDeviceService.getDeviceById as jest.Mock, mockDevice);

            await verifyThrowsError(
                () => playniteController.revokeDevice(TEST_DEVICE_ID, TEST_USER_ID),
                /permission/i
            );
        });
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

            expect(result.warnings).toHaveLength(1);
            expect(result.warnings[0].code).toBe('MISSING_ORIGINAL_GAME_ID');
            expect(result.counts.needsReview).toBe(1);
        });
    });

    describe('verifyDeviceToken', () => {
        test('returns device info for valid token', async () => {
            const mockDevice = {
                id: TEST_DEVICE_ID,
                userId: TEST_USER_ID,
                name: 'Gaming PC',
            };
            setupMock(playniteDeviceService.verifyTokenByToken as jest.Mock, mockDevice);

            const result = await playniteController.verifyDeviceToken('valid-token');

            expect(result).toBeDefined();
            expect(result!.deviceId).toBe(TEST_DEVICE_ID);
            expect(result!.userId).toBe(TEST_USER_ID);
            expect(result!.deviceName).toBe('Gaming PC');
        });

        test('returns null for invalid token', async () => {
            setupMock(playniteDeviceService.verifyTokenByToken as jest.Mock, null);

            const result = await playniteController.verifyDeviceToken('invalid-token');

            expect(result).toBeNull();
        });

        test('returns null for empty token', async () => {
            const result = await playniteController.verifyDeviceToken('');

            expect(result).toBeNull();
            expect(playniteDeviceService.verifyTokenByToken).not.toHaveBeenCalled();
        });
    });
});
