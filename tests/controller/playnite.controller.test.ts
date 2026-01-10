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
import {normalizeProviderName, extractStoreUrlFromLinks} from '../../src/modules/games/connectors/playnite/PlayniteProviders';

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

    describe('extractStoreUrlFromLinks', () => {
        test('extracts Steam store URL from links array', () => {
            const links = [
                {name: 'Steam', url: 'https://store.steampowered.com/app/123456'},
                {name: 'Website', url: 'https://example.com'},
            ];
            expect(extractStoreUrlFromLinks(links, 'steam')).toBe('https://store.steampowered.com/app/123456');
        });

        test('extracts Epic store URL from links array', () => {
            const links = [
                {name: 'Epic Games', url: 'https://store.epicgames.com/game/my-game'},
                {name: 'Website', url: 'https://example.com'},
            ];
            expect(extractStoreUrlFromLinks(links, 'epic')).toBe('https://store.epicgames.com/game/my-game');
        });

        test('extracts GOG store URL from links array', () => {
            const links = [
                {name: 'GOG', url: 'https://www.gog.com/game/hades'},
            ];
            expect(extractStoreUrlFromLinks(links, 'gog')).toBe('https://www.gog.com/game/hades');
        });

        test('returns undefined when no matching link found', () => {
            const links = [
                {name: 'Website', url: 'https://example.com'},
            ];
            expect(extractStoreUrlFromLinks(links, 'steam')).toBeUndefined();
        });

        test('returns undefined for unknown provider', () => {
            const links = [
                {name: 'Steam', url: 'https://store.steampowered.com/app/123456'},
            ];
            expect(extractStoreUrlFromLinks(links, 'unknown')).toBeUndefined();
        });

        test('returns undefined when links is undefined', () => {
            expect(extractStoreUrlFromLinks(undefined, 'steam')).toBeUndefined();
        });

        test('returns undefined when links array is empty', () => {
            expect(extractStoreUrlFromLinks([], 'steam')).toBeUndefined();
        });
    });
});
