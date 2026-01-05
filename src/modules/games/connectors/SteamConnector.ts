/**
 * Steam Connector
 * Production implementation for Steam Web API integration
 * 
 * Features:
 * - Account linking via SteamID64, profile URLs (/profiles/, /id/)
 * - Vanity URL resolution via ResolveVanityURL API
 * - Account validation via GetPlayerSummaries API
 * - Library sync via GetOwnedGames API
 * - Configurable sync options (appinfo, playtime, free games, etc.)
 */

import {BaseConnector, ConnectorManifest, ExternalGame, SyncResult} from './ConnectorInterface';
import {ConnectorCapability} from '../../../types/InventoryEnums';

// Steam Web API base URL
const STEAM_API_BASE = 'https://api.steampowered.com';

// Environment variable for Steam Web API key
const STEAM_API_KEY_ENV = 'STEAM_WEB_API_KEY';

/**
 * Steam connector configuration options
 */
export interface SteamConnectorConfig {
    /** Language for game names (e.g., "en", "de") */
    language?: string;
    /** Include app info (name, icon, logo) in GetOwnedGames */
    includeAppInfo?: boolean;
    /** Include played free games in owned games list */
    includePlayedFreeGames?: boolean;
    /** Include free subscriptions */
    includeFreeSub?: boolean;
    /** Skip unvetted apps */
    skipUnvettedApps?: boolean;
    /** Include extended app info */
    includeExtendedAppInfo?: boolean;
}

const DEFAULT_CONFIG: Required<SteamConnectorConfig> = {
    language: 'en',
    includeAppInfo: true,
    includePlayedFreeGames: false,
    includeFreeSub: false,
    skipUnvettedApps: true,
    includeExtendedAppInfo: false,
};

/**
 * Steam API response types
 */
interface SteamApiResponse<T> {
    response: T;
}

interface ResolveVanityURLResponse {
    success: 1 | 42; // 1 = success, 42 = not found
    steamid?: string;
    message?: string;
}

interface PlayerSummary {
    steamid: string;
    personaname: string;
    profileurl: string;
    avatar: string;
    avatarmedium: string;
    avatarfull: string;
    personastate: number;
    communityvisibilitystate: number; // 1 = private, 3 = public
    profilestate?: number;
    lastlogoff?: number;
    commentpermission?: number;
}

interface GetPlayerSummariesResponse {
    players: PlayerSummary[];
}

interface SteamOwnedGame {
    appid: number;
    name?: string;
    img_icon_url?: string;
    img_logo_url?: string;
    playtime_forever: number;
    playtime_windows_forever?: number;
    playtime_mac_forever?: number;
    playtime_linux_forever?: number;
    rtime_last_played?: number;
    has_community_visible_stats?: boolean;
    content_descriptorids?: number[];
    has_leaderboards?: boolean;
}

interface GetOwnedGamesResponse {
    game_count?: number;
    games?: SteamOwnedGame[];
}

/**
 * Link result containing resolved SteamID and display name
 */
export interface SteamLinkResult {
    steamId: string;
    displayName: string;
    avatarUrl: string;
    profileUrl: string;
    isPublic: boolean;
}

/**
 * Error codes for Steam connector
 */
export class SteamConnectorError extends Error {
    constructor(
        message: string,
        public readonly code: 'API_KEY_INVALID' | 'VANITY_NOT_FOUND' | 'PROFILE_NOT_FOUND' | 'LIBRARY_NOT_VISIBLE' | 'NETWORK_ERROR' | 'INVALID_INPUT'
    ) {
        super(message);
        this.name = 'SteamConnectorError';
    }
}

const STEAM_MANIFEST: ConnectorManifest = {
    id: 'steam',
    name: 'Steam',
    description: 'Connect to Steam to sync your game library. Requires a Steam Web API key configured on the server.',
    provider: 'steam',
    capabilities: [
        ConnectorCapability.LIBRARY_SYNC,
        ConnectorCapability.PLAYTIME_SYNC,
    ],
    version: '1.0.0',
    configSchema: {
        type: 'object',
        properties: {
            steamId: {type: 'string', description: 'Steam User ID (64-bit) or profile URL'},
        },
        required: ['steamId'],
    },
};

export class SteamConnector extends BaseConnector {
    private config: Required<SteamConnectorConfig>;

    constructor(config: SteamConnectorConfig = {}) {
        super(STEAM_MANIFEST);
        this.config = {...DEFAULT_CONFIG, ...config};
    }

    /**
     * Get the Steam Web API key from environment
     */
    private getApiKey(): string {
        const apiKey = process.env[STEAM_API_KEY_ENV];
        if (!apiKey) {
            throw new SteamConnectorError(
                'Steam Web API key not configured. Set STEAM_WEB_API_KEY environment variable.',
                'API_KEY_INVALID'
            );
        }
        return apiKey;
    }

    /**
     * Parse input to extract SteamID64 or vanity URL
     * 
     * Accepts:
     * - SteamID64 (numeric, 17 digits)
     * - https://steamcommunity.com/profiles/<steamid64>/
     * - https://steamcommunity.com/id/<vanity>/
     * - Vanity name directly
     */
    public parseInput(input: string): {type: 'steamid' | 'vanity'; value: string} {
        const trimmed = input.trim();
        
        // Check for SteamID64 (17-digit number)
        if (/^\d{17}$/.test(trimmed)) {
            return {type: 'steamid', value: trimmed};
        }
        
        // Check for profile URL with SteamID64
        const profileMatch = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})\/?/);
        if (profileMatch) {
            return {type: 'steamid', value: profileMatch[1]};
        }
        
        // Check for profile URL with vanity name
        const vanityMatch = trimmed.match(/steamcommunity\.com\/id\/([^\/]+)\/?/);
        if (vanityMatch) {
            return {type: 'vanity', value: vanityMatch[1]};
        }
        
        // Assume it's a vanity name if no match
        if (trimmed.length > 0 && !trimmed.includes('/')) {
            return {type: 'vanity', value: trimmed};
        }
        
        throw new SteamConnectorError(
            'Invalid Steam ID or profile URL. Provide a 17-digit SteamID64, profile URL, or vanity name.',
            'INVALID_INPUT'
        );
    }

    /**
     * Resolve a vanity URL to SteamID64
     */
    public async resolveVanityUrl(vanityUrl: string): Promise<string> {
        const apiKey = this.getApiKey();
        const url = `${STEAM_API_BASE}/ISteamUser/ResolveVanityURL/v1/?key=${encodeURIComponent(apiKey)}&vanityurl=${encodeURIComponent(vanityUrl)}`;
        
        const response = await this.fetchWithRetry(url);
        const data = await response.json() as SteamApiResponse<ResolveVanityURLResponse>;
        
        if (data.response.success !== 1 || !data.response.steamid) {
            throw new SteamConnectorError(
                `Could not resolve vanity URL "${vanityUrl}". Please use a SteamID64 or valid profile URL.`,
                'VANITY_NOT_FOUND'
            );
        }
        
        return data.response.steamid;
    }

    /**
     * Get player summary for validation and display name
     */
    public async getPlayerSummary(steamId: string): Promise<PlayerSummary> {
        const apiKey = this.getApiKey();
        const url = `${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(apiKey)}&steamids=${encodeURIComponent(steamId)}`;
        
        const response = await this.fetchWithRetry(url);
        const data = await response.json() as SteamApiResponse<GetPlayerSummariesResponse>;
        
        if (!data.response.players || data.response.players.length === 0) {
            throw new SteamConnectorError(
                'Steam profile not found. Please verify the SteamID64 or profile URL.',
                'PROFILE_NOT_FOUND'
            );
        }
        
        return data.response.players[0];
    }

    /**
     * Complete account linking - parse input, resolve vanity if needed, validate
     */
    public async completeLink(input: string): Promise<SteamLinkResult> {
        const parsed = this.parseInput(input);
        
        let steamId: string;
        if (parsed.type === 'vanity') {
            steamId = await this.resolveVanityUrl(parsed.value);
        } else {
            steamId = parsed.value;
        }
        
        const summary = await this.getPlayerSummary(steamId);
        
        return {
            steamId: summary.steamid,
            displayName: summary.personaname,
            avatarUrl: summary.avatarfull,
            profileUrl: summary.profileurl,
            isPublic: summary.communityvisibilitystate === 3,
        };
    }

    /**
     * Validate link by checking if account exists and is accessible
     */
    public async validateLink(steamId: string): Promise<{valid: boolean; warning?: string}> {
        try {
            const summary = await this.getPlayerSummary(steamId);
            
            if (summary.communityvisibilitystate !== 3) {
                return {
                    valid: true,
                    warning: 'Steam profile is private. Some features may be limited.',
                };
            }
            
            return {valid: true};
        } catch (error) {
            if (error instanceof SteamConnectorError) {
                return {valid: false, warning: error.message};
            }
            throw error;
        }
    }

    /**
     * Sync game library from Steam
     */
    async syncLibrary(tokenRef: string): Promise<SyncResult> {
        try {
            const apiKey = this.getApiKey();
            
            // tokenRef is expected to be the SteamID64
            if (!tokenRef || !/^\d{17}$/.test(tokenRef)) {
                return {
                    success: false,
                    games: [],
                    error: 'Invalid SteamID64. Please re-link your Steam account.',
                    timestamp: new Date(),
                };
            }
            
            const games = await this.getOwnedGames(apiKey, tokenRef);
            
            if (games.length === 0) {
                // Could be empty library or private
                const summary = await this.getPlayerSummary(tokenRef);
                if (summary.communityvisibilitystate !== 3) {
                    return {
                        success: true,
                        games: [],
                        error: 'Owned games not visible. Check Steam privacy settings to allow "Game details" visibility.',
                        timestamp: new Date(),
                    };
                }
            }
            
            return {
                success: true,
                games,
                timestamp: new Date(),
            };
        } catch (error) {
            if (error instanceof SteamConnectorError) {
                return {
                    success: false,
                    games: [],
                    error: error.message,
                    timestamp: new Date(),
                };
            }
            
            const message = error instanceof Error ? error.message : 'Unknown error during Steam sync';
            return {
                success: false,
                games: [],
                error: message,
                timestamp: new Date(),
            };
        }
    }

    /**
     * Validate credentials by checking if the SteamID64 is valid
     */
    async validateCredentials(tokenRef: string): Promise<boolean> {
        try {
            if (!tokenRef || !/^\d{17}$/.test(tokenRef)) {
                return false;
            }
            
            await this.getPlayerSummary(tokenRef);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get owned games from Steam API
     */
    private async getOwnedGames(apiKey: string, steamId: string): Promise<ExternalGame[]> {
        const params = new URLSearchParams({
            key: apiKey,
            steamid: steamId,
            format: 'json',
        });
        
        // Add configured options
        if (this.config.includeAppInfo) {
            params.append('include_appinfo', '1');
        }
        if (this.config.includePlayedFreeGames) {
            params.append('include_played_free_games', '1');
        }
        if (this.config.includeFreeSub) {
            params.append('include_free_sub', '1');
        }
        if (this.config.skipUnvettedApps) {
            params.append('skip_unvetted_apps', '1');
        }
        if (this.config.includeExtendedAppInfo) {
            params.append('include_extended_appinfo', '1');
        }
        if (this.config.language) {
            params.append('language', this.config.language);
        }
        
        const url = `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?${params.toString()}`;
        
        const response = await this.fetchWithRetry(url);
        const data = await response.json() as SteamApiResponse<GetOwnedGamesResponse>;
        
        if (!data.response.games) {
            return [];
        }
        
        return data.response.games.map((game): ExternalGame => ({
            externalGameId: String(game.appid),
            name: game.name || `Steam App ${game.appid}`,
            playtimeMinutes: game.playtime_forever,
            lastPlayedAt: game.rtime_last_played 
                ? new Date(game.rtime_last_played * 1000) 
                : undefined,
            coverImageUrl: game.appid 
                ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`
                : undefined,
            platform: 'PC',
            rawPayload: {...game}, // Spread creates a plain object copy
        }));
    }

    /**
     * Fetch with retry logic for network resilience
     */
    private async fetchWithRetry(url: string, retries = 3): Promise<Response> {
        let lastError: Error | undefined;
        
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(url);
                
                if (response.status === 401 || response.status === 403) {
                    throw new SteamConnectorError(
                        'Steam API key invalid or blocked. Please check server configuration.',
                        'API_KEY_INVALID'
                    );
                }
                
                if (!response.ok) {
                    throw new Error(`Steam API returned ${response.status}: ${response.statusText}`);
                }
                
                return response;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                
                if (error instanceof SteamConnectorError) {
                    throw error; // Don't retry on auth errors
                }
                
                if (i < retries - 1) {
                    // Exponential backoff
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        }
        
        throw new SteamConnectorError(
            `Network error communicating with Steam API: ${lastError?.message}`,
            'NETWORK_ERROR'
        );
    }
}
