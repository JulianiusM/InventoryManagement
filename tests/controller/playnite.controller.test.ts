/**
 * Tests for Playnite Import Service
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

// Mock the connector device service - must be before imports
jest.mock('../../src/modules/database/services/ConnectorDeviceService');
jest.mock('../../src/modules/database/services/ExternalLibraryEntryService');
jest.mock('../../src/modules/database/services/GameExternalMappingService');
jest.mock('../../src/modules/database/services/GameTitleService');
jest.mock('../../src/modules/database/services/GameReleaseService');
jest.mock('../../src/modules/database/services/PlatformService');
jest.mock('../../src/modules/database/dataSource', () => ({
    AppDataSource: {
        getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
                update: jest.fn().mockReturnThis(),
                set: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                andWhere: jest.fn().mockReturnThis(),
                execute: jest.fn(),
            }),
        }),
    },
}));

import {validateImportPayload} from '../../src/modules/games/connectors/playnite/PlayniteImportService';
import {normalizeProviderName, generateStoreUrl} from '../../src/modules/games/connectors/playnite/PlayniteProviders';

describe('Playnite Import Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validateImportPayload', () => {
        test.each(validImportPayloads)('validates $description', ({payload}) => {
            const result = validateImportPayload(payload);

            expect(result).toBeDefined();
            expect(result.aggregator).toBe('playnite');
            expect(result.games).toBeDefined();
        });

        test.each(invalidImportPayloads)('rejects $description', ({payload, errorPattern}) => {
            expect(() => validateImportPayload(payload)).toThrow(errorPattern);
        });
    });

    describe('import payload structure', () => {
        test('accepts minimal payload', () => {
            const payload = validImportPayloads[0].payload;
            const result = validateImportPayload(payload);
            expect(result.games).toHaveLength(1);
        });

        test('accepts payload with multiple games', () => {
            const payload = validImportPayloads[1].payload;
            const result = validateImportPayload(payload);
            expect(result.games.length).toBeGreaterThan(1);
        });

        test('rejects wrong aggregator', () => {
            const invalidPayload = {
                aggregator: 'steam',
                exportedAt: '2026-01-08T20:15:00Z',
                plugins: [],
                games: [],
            };
            expect(() => validateImportPayload(invalidPayload)).toThrow(/aggregator/i);
        });

        test('rejects missing games array', () => {
            const invalidPayload = {
                aggregator: 'playnite',
                exportedAt: '2026-01-08T20:15:00Z',
            };
            expect(() => validateImportPayload(invalidPayload)).toThrow(/games/i);
        });
    });
});

describe('Playnite Providers', () => {
    describe('normalizeProviderName', () => {
        test('normalizes Steam plugin ID', () => {
            expect(normalizeProviderName('cb91dfc9-b977-43bf-8e70-55f46e410fab')).toBe('steam');
        });

        test('normalizes Epic plugin ID', () => {
            expect(normalizeProviderName('00000001-ebb2-4ecc-abcb-75c4f5a78e18')).toBe('epic');
        });

        test('normalizes GOG plugin ID', () => {
            expect(normalizeProviderName('aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e')).toBe('gog');
        });

        test('returns unknown for unrecognized plugin ID', () => {
            expect(normalizeProviderName('unknown-plugin-id')).toBe('unknown');
        });
    });

    describe('generateStoreUrl', () => {
        test('generates Steam store URL', () => {
            expect(generateStoreUrl('steam', '123456')).toBe('https://store.steampowered.com/app/123456');
        });

        test('returns undefined for Epic (unreliable URL format)', () => {
            // Epic URLs require slug names, not IDs - use storeUrl from Playnite or metadata providers
            expect(generateStoreUrl('epic', 'my-game')).toBeUndefined();
        });

        test('returns undefined for GOG (unreliable URL format)', () => {
            // GOG URLs require slug names, not IDs - use storeUrl from Playnite or metadata providers
            expect(generateStoreUrl('gog', 'hades')).toBeUndefined();
        });

        test('returns undefined for EA (no public store URL)', () => {
            expect(generateStoreUrl('ea', '12345')).toBeUndefined();
        });

        test('returns undefined for unknown provider', () => {
            expect(generateStoreUrl('unknown', '12345')).toBeUndefined();
        });

        test('returns undefined when gameId is undefined', () => {
            expect(generateStoreUrl('steam', undefined)).toBeUndefined();
        });
    });
});
