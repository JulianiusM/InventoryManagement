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
import {normalizeProviderName, extractStoreUrlFromLinks, normalizeSourceName} from '../../src/modules/games/connectors/playnite/PlayniteProviders';

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

        test('falls back to Website link when no store link is found for provider', () => {
            const links = [
                {name: 'Website', url: 'https://example.com'},
            ];
            // Should return website as fallback - better than no link at all
            expect(extractStoreUrlFromLinks(links, 'steam')).toBe('https://example.com');
        });

        test('returns undefined for unknown provider but finds store in Website link', () => {
            const links = [
                {name: 'Official Website', url: 'https://store.steampowered.com/app/123456'},
            ];
            // Should find store URL via website fallback
            expect(extractStoreUrlFromLinks(links, 'unknown')).toBe('https://store.steampowered.com/app/123456');
        });

        test('returns undefined when links is undefined', () => {
            expect(extractStoreUrlFromLinks(undefined, 'steam')).toBeUndefined();
        });

        test('returns undefined when links array is empty', () => {
            expect(extractStoreUrlFromLinks([], 'steam')).toBeUndefined();
        });

        test('extracts URL with platform consideration for Nintendo Switch', () => {
            const links = [
                {name: 'Nintendo', url: 'https://www.nintendo.com/games/detail/zelda'},
                {name: 'Website', url: 'https://example.com'},
            ];
            expect(extractStoreUrlFromLinks(links, 'nintendo', 'Nintendo Switch')).toBeDefined();
        });

        test('falls back to Website link that points to a known store', () => {
            const links = [
                {name: 'Official Website', url: 'https://www.gog.com/game/some-game'},
                {name: 'Forum', url: 'https://forum.example.com'},
            ];
            // Should find GOG store URL via website fallback even with unknown provider
            expect(extractStoreUrlFromLinks(links, 'unknown')).toBe('https://www.gog.com/game/some-game');
        });

        test('falls back to Website link when no store URL is found', () => {
            const links = [
                {name: 'Official Website', url: 'https://game-publisher.com/news'},
                {name: 'Forum', url: 'https://forum.example.com'},
            ];
            // Should return official website as fallback (better than no link at all)
            expect(extractStoreUrlFromLinks(links, 'unknown')).toBe('https://game-publisher.com/news');
        });

        test('uses originalProviderName as fallback for store URL matching', () => {
            const links = [
                {name: 'Ubisoft Connect', url: 'https://store.ubi.com/game/my-game'},
                {name: 'Website', url: 'https://example.com'},
            ];
            // Should find store URL using originalProviderName
            expect(extractStoreUrlFromLinks(links, 'unknown', undefined, 'Ubisoft Connect')).toBe('https://store.ubi.com/game/my-game');
        });

        test('finds any store URL in last resort pass', () => {
            const links = [
                {name: 'Homepage', url: 'https://store.steampowered.com/app/123456'},
            ];
            // Even with generic name, should find Steam store URL in last resort pass
            expect(extractStoreUrlFromLinks(links, 'unknown')).toBe('https://store.steampowered.com/app/123456');
        });
    });

    describe('normalizeSourceName', () => {
        test('normalizes Steam variations', () => {
            expect(normalizeSourceName('Steam')).toBe('steam');
            expect(normalizeSourceName('steam store')).toBe('steam');
            expect(normalizeSourceName('STEAM')).toBe('steam');
        });

        test('normalizes EA variations', () => {
            expect(normalizeSourceName('EA App')).toBe('ea');
            expect(normalizeSourceName('Origin')).toBe('ea');
            expect(normalizeSourceName('ea play')).toBe('ea');
            expect(normalizeSourceName('Electronic Arts')).toBe('ea');
        });

        test('normalizes Ubisoft variations', () => {
            expect(normalizeSourceName('Ubisoft Connect')).toBe('ubisoft');
            expect(normalizeSourceName('uplay')).toBe('ubisoft');
            expect(normalizeSourceName('UBI')).toBe('ubisoft');
        });

        test('normalizes Xbox variations', () => {
            expect(normalizeSourceName('Xbox')).toBe('xbox');
            expect(normalizeSourceName('Xbox Game Pass')).toBe('xbox');
            expect(normalizeSourceName('Microsoft Store')).toBe('xbox');
        });

        test('returns unknown for unrecognized source', () => {
            expect(normalizeSourceName('Some Random Store')).toBe('unknown');
            expect(normalizeSourceName('')).toBe('unknown');
        });
    });
});
