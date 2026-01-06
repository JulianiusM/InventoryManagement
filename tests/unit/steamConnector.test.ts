/**
 * Unit tests for Steam Connector
 * Tests input parsing, vanity resolution, and API interactions
 */

import {
    SteamConnector,
    SteamConnectorError,
} from '../../src/modules/games/connectors/SteamConnector';
import {ConnectorCredentials} from '../../src/modules/games/connectors/ConnectorInterface';
import {
    parseInputTestData,
    parseInputInvalidData,
    TEST_STEAM_ID,
    mockPlayerSummaryResponse,
    mockPrivatePlayerSummaryResponse,
    mockEmptyPlayerSummaryResponse,
    mockResolveVanitySuccessResponse,
    mockResolveVanityFailResponse,
    mockOwnedGamesResponse,
    mockEmptyOwnedGamesResponse,
} from '../data/connector/steamData';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('SteamConnector', () => {
    let connector: SteamConnector;
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {...originalEnv, STEAM_WEB_API_KEY: 'test-api-key'};
        connector = new SteamConnector();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('parseInput', () => {
        test.each(parseInputTestData)('$description', ({input, expected}) => {
            const result = connector.parseInput(input);
            expect(result).toEqual(expected);
        });

        test.each(parseInputInvalidData)('$description', ({input, expectedErrorCode}) => {
            expect(() => connector.parseInput(input)).toThrow(SteamConnectorError);
            try {
                connector.parseInput(input);
            } catch (error) {
                expect(error).toBeInstanceOf(SteamConnectorError);
                expect((error as SteamConnectorError).code).toBe(expectedErrorCode);
            }
        });
    });

    describe('resolveVanityUrl', () => {
        test('resolves vanity URL successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResolveVanitySuccessResponse,
            });

            const result = await connector.resolveVanityUrl('gaben');
            expect(result).toBe(TEST_STEAM_ID);
            expect(mockFetch).toHaveBeenCalledTimes(1);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('ResolveVanityURL')
            );
        });

        test('throws error when vanity URL not found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockResolveVanityFailResponse,
            });

            await expect(connector.resolveVanityUrl('nonexistent')).rejects.toThrow(
                expect.objectContaining({
                    name: 'SteamConnectorError',
                    code: 'VANITY_NOT_FOUND',
                })
            );
        });

        test('throws error when API key not configured', async () => {
            delete process.env.STEAM_WEB_API_KEY;
            
            await expect(connector.resolveVanityUrl('gaben')).rejects.toThrow(
                SteamConnectorError
            );
            await expect(connector.resolveVanityUrl('gaben')).rejects.toMatchObject({
                code: 'API_KEY_INVALID',
            });
        });
    });

    describe('getPlayerSummary', () => {
        test('returns player summary successfully', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const result = await connector.getPlayerSummary(TEST_STEAM_ID);
            expect(result.steamid).toBe(TEST_STEAM_ID);
            expect(result.personaname).toBe('Test User');
            expect(result.communityvisibilitystate).toBe(3);
        });

        test('throws error when profile not found', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                status: 200,
                json: async () => mockEmptyPlayerSummaryResponse,
            });

            await expect(connector.getPlayerSummary(TEST_STEAM_ID)).rejects.toThrow(
                expect.objectContaining({
                    name: 'SteamConnectorError',
                    code: 'PROFILE_NOT_FOUND',
                })
            );
        });
    });

    describe('completeLink', () => {
        test('completes link with SteamID64', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const result = await connector.completeLink(TEST_STEAM_ID);
            expect(result.steamId).toBe(TEST_STEAM_ID);
            expect(result.displayName).toBe('Test User');
            expect(result.isPublic).toBe(true);
        });

        test('completes link with vanity URL', async () => {
            // First call: resolve vanity
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockResolveVanitySuccessResponse,
            });
            // Second call: get player summary
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const result = await connector.completeLink('gaben');
            expect(result.steamId).toBe(TEST_STEAM_ID);
            expect(result.displayName).toBe('Test User');
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        test('detects private profile', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPrivatePlayerSummaryResponse,
            });

            const result = await connector.completeLink(TEST_STEAM_ID);
            expect(result.isPublic).toBe(false);
        });
    });

    describe('validateLink', () => {
        test('returns valid for public profile', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const result = await connector.validateLink(TEST_STEAM_ID);
            expect(result.valid).toBe(true);
            expect(result.warning).toBeUndefined();
        });

        test('returns valid with warning for private profile', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPrivatePlayerSummaryResponse,
            });

            const result = await connector.validateLink(TEST_STEAM_ID);
            expect(result.valid).toBe(true);
            expect(result.warning).toBeDefined();
            expect(result.warning).toContain('private');
        });

        test('returns invalid for non-existent profile', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockEmptyPlayerSummaryResponse,
            });

            const result = await connector.validateLink(TEST_STEAM_ID);
            expect(result.valid).toBe(false);
        });
    });

    describe('syncLibrary', () => {
        test('syncs games successfully', async () => {
            // Mock getPlayerSummary call (for visibility check)
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockOwnedGamesResponse,
            });

            const credentials: ConnectorCredentials = {externalUserId: TEST_STEAM_ID};
            const result = await connector.syncLibrary(credentials);
            expect(result.success).toBe(true);
            expect(result.games).toHaveLength(3);
            expect(result.games[0].externalGameId).toBe('570');
            expect(result.games[0].name).toBe('Dota 2');
            expect(result.games[0].playtimeMinutes).toBe(12500);
            expect(result.games[0].platform).toBe('PC');
        });

        test('handles empty game library with warning', async () => {
            // Mock getOwnedGames returning empty
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockEmptyOwnedGamesResponse,
            });
            // Mock getPlayerSummary showing private profile
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPrivatePlayerSummaryResponse,
            });

            const credentials: ConnectorCredentials = {externalUserId: TEST_STEAM_ID};
            const result = await connector.syncLibrary(credentials);
            expect(result.success).toBe(true);
            expect(result.games).toHaveLength(0);
            expect(result.error).toContain('privacy');
        });

        test('returns error for invalid SteamID format', async () => {
            const credentials: ConnectorCredentials = {externalUserId: 'invalid'};
            const result = await connector.syncLibrary(credentials);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid SteamID64');
        });

        test('returns error for empty externalUserId', async () => {
            const credentials: ConnectorCredentials = {externalUserId: ''};
            const result = await connector.syncLibrary(credentials);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid SteamID64');
        });
    });

    describe('validateCredentials', () => {
        test('returns true for valid SteamID', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const credentials: ConnectorCredentials = {externalUserId: TEST_STEAM_ID};
            const result = await connector.validateCredentials(credentials);
            expect(result).toBe(true);
        });

        test('returns false for invalid SteamID format', async () => {
            const credentials: ConnectorCredentials = {externalUserId: 'invalid'};
            const result = await connector.validateCredentials(credentials);
            expect(result).toBe(false);
        });

        test('returns false when API call fails', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockEmptyPlayerSummaryResponse,
            });

            const credentials: ConnectorCredentials = {externalUserId: TEST_STEAM_ID};
            const result = await connector.validateCredentials(credentials);
            expect(result).toBe(false);
        });
    });

    describe('error handling', () => {
        test('handles 401 response as API key error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
            });

            await expect(connector.getPlayerSummary(TEST_STEAM_ID)).rejects.toMatchObject({
                code: 'API_KEY_INVALID',
            });
        });

        test('handles 403 response as API key error', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
            });

            await expect(connector.getPlayerSummary(TEST_STEAM_ID)).rejects.toMatchObject({
                code: 'API_KEY_INVALID',
            });
        });

        test('retries on network error', async () => {
            // First two calls fail, third succeeds
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const result = await connector.getPlayerSummary(TEST_STEAM_ID);
            expect(result.steamid).toBe(TEST_STEAM_ID);
            expect(mockFetch).toHaveBeenCalledTimes(3);
        });

        test('throws network error after max retries', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));

            await expect(connector.getPlayerSummary(TEST_STEAM_ID)).rejects.toMatchObject({
                code: 'NETWORK_ERROR',
            });
        });
    });

    describe('manifest', () => {
        test('has correct manifest properties', () => {
            const manifest = connector.getManifest();
            expect(manifest.id).toBe('steam');
            expect(manifest.provider).toBe('steam');
            expect(manifest.capabilities).toContain('library_sync');
            expect(manifest.capabilities).toContain('playtime_sync');
        });
    });

    describe('configuration', () => {
        test('uses default configuration', () => {
            const defaultConnector = new SteamConnector();
            expect(defaultConnector).toBeDefined();
        });

        test('accepts custom configuration', () => {
            const customConnector = new SteamConnector({
                language: 'de',
                includePlayedFreeGames: true,
            });
            expect(customConnector).toBeDefined();
        });
    });

    describe('credentials format', () => {
        test('accepts credentials with externalUserId only', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockOwnedGamesResponse,
            });

            const credentials: ConnectorCredentials = {externalUserId: TEST_STEAM_ID};
            const result = await connector.syncLibrary(credentials);
            expect(result.success).toBe(true);
        });

        test('accepts credentials with externalUserId and tokenRef', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockOwnedGamesResponse,
            });

            const credentials: ConnectorCredentials = {
                externalUserId: TEST_STEAM_ID,
                tokenRef: 'user-api-key',
            };
            const result = await connector.syncLibrary(credentials);
            expect(result.success).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('key=user-api-key')
            );
        });
    });

    describe('user API key support', () => {
        test('uses user API key when provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            await connector.getPlayerSummary(TEST_STEAM_ID, 'user-provided-key');
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('key=user-provided-key')
            );
        });

        test('falls back to env key when user key not provided', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            await connector.getPlayerSummary(TEST_STEAM_ID);
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('key=test-api-key')
            );
        });

        test('syncLibrary uses user API key from credentials.tokenRef', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockOwnedGamesResponse,
            });

            const credentials: ConnectorCredentials = {
                externalUserId: TEST_STEAM_ID,
                tokenRef: 'user-sync-key',
            };
            await connector.syncLibrary(credentials);
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('key=user-sync-key')
            );
        });

        test('validateCredentials uses user API key from credentials.tokenRef', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockPlayerSummaryResponse,
            });

            const credentials: ConnectorCredentials = {
                externalUserId: TEST_STEAM_ID,
                tokenRef: 'user-validate-key',
            };
            await connector.validateCredentials(credentials);
            
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('key=user-validate-key')
            );
        });
    });
});
