/**
 * Unit tests for Steam Metadata Provider
 * Tests game search and metadata fetching
 */

import {SteamMetadataProvider} from '../../src/modules/games/metadata/SteamMetadataProvider';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SteamMetadataProvider', () => {
    let provider: SteamMetadataProvider;

    beforeEach(() => {
        jest.clearAllMocks();
        provider = new SteamMetadataProvider();
    });

    describe('manifest', () => {
        test('has correct manifest properties', () => {
            const manifest = provider.getManifest();
            expect(manifest.id).toBe('steam');
            expect(manifest.name).toBe('Steam');
            expect(manifest.requiresApiKey).toBe(false);
        });
    });

    describe('getGameUrl', () => {
        test('returns correct Steam store URL', () => {
            const url = provider.getGameUrl('570');
            expect(url).toBe('https://store.steampowered.com/app/570');
        });
    });

    describe('getGameMetadata', () => {
        const mockAppDetails = {
            '570': {
                success: true,
                data: {
                    type: 'game',
                    name: 'Dota 2',
                    steam_appid: 570,
                    required_age: 0,
                    is_free: true,
                    detailed_description: 'A competitive MOBA game.',
                    short_description: 'The most-played game on Steam.',
                    header_image: 'https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg',
                    developers: ['Valve'],
                    publishers: ['Valve'],
                    platforms: {
                        windows: true,
                        mac: true,
                        linux: true,
                    },
                    categories: [
                        {id: 1, description: 'Multi-player'},
                        {id: 36, description: 'Online PvP'},
                    ],
                    genres: [
                        {id: '1', description: 'Action'},
                        {id: '37', description: 'Free to Play'},
                    ],
                    release_date: {
                        coming_soon: false,
                        date: 'Jul 9, 2013',
                    },
                    metacritic: {
                        score: 90,
                        url: 'https://www.metacritic.com/game/dota-2',
                    },
                },
            },
        };

        test('returns metadata for valid appid', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockAppDetails,
            });

            const result = await provider.getGameMetadata('570');
            
            expect(result).not.toBeNull();
            expect(result!.externalId).toBe('570');
            expect(result!.name).toBe('Dota 2');
            expect(result!.developers).toContain('Valve');
            expect(result!.publishers).toContain('Valve');
            expect(result!.genres).toContain('Action');
            expect(result!.metacriticScore).toBe(90);
            expect(result!.priceInfo?.isFree).toBe(true);
        });

        test('returns null for invalid appid format', async () => {
            const result = await provider.getGameMetadata('invalid');
            expect(result).toBeNull();
        });

        test('returns null when API returns failure', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    '999999999': {
                        success: false,
                    },
                }),
            });

            const result = await provider.getGameMetadata('999999999');
            expect(result).toBeNull();
        });

        test('returns null when fetch fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
            });

            const result = await provider.getGameMetadata('570');
            expect(result).toBeNull();
        });

        test('extracts player info from categories', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockAppDetails,
            });

            const result = await provider.getGameMetadata('570');
            
            expect(result!.playerInfo).toBeDefined();
            expect(result!.playerInfo!.supportsOnline).toBe(true);
        });

        test('builds platforms list correctly', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockAppDetails,
            });

            const result = await provider.getGameMetadata('570');
            
            expect(result!.platforms).toContain('Windows');
            expect(result!.platforms).toContain('macOS');
            expect(result!.platforms).toContain('Linux');
        });
    });

    describe('searchGames', () => {
        test('returns empty array for short query', async () => {
            const result = await provider.searchGames('a');
            expect(result).toEqual([]);
        });

        test('returns empty array when fetch fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
            });

            const result = await provider.searchGames('dota');
            expect(result).toEqual([]);
        });
    });

    describe('getGamesMetadata', () => {
        test('fetches metadata for multiple games', async () => {
            const mockApp1 = {
                '570': {
                    success: true,
                    data: {
                        type: 'game',
                        name: 'Dota 2',
                        steam_appid: 570,
                        required_age: 0,
                        is_free: true,
                    },
                },
            };
            
            const mockApp2 = {
                '730': {
                    success: true,
                    data: {
                        type: 'game',
                        name: 'Counter-Strike 2',
                        steam_appid: 730,
                        required_age: 0,
                        is_free: true,
                    },
                },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApp1,
            });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApp2,
            });

            const results = await provider.getGamesMetadata(['570', '730']);
            
            expect(results).toHaveLength(2);
            expect(results[0].name).toBe('Dota 2');
            expect(results[1].name).toBe('Counter-Strike 2');
        });

        test('skips failed fetches', async () => {
            const mockApp1 = {
                '570': {
                    success: true,
                    data: {
                        type: 'game',
                        name: 'Dota 2',
                        steam_appid: 570,
                        required_age: 0,
                        is_free: true,
                    },
                },
            };

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockApp1,
            });
            mockFetch.mockResolvedValueOnce({
                ok: false,
            });

            const results = await provider.getGamesMetadata(['570', '999']);
            
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('Dota 2');
        });
    });
});
