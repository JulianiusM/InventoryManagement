/**
 * IGDB (Internet Game Database) Metadata Provider
 * Fetches game metadata from IGDB API via Twitch authentication
 * 
 * IGDB is the industry standard for video game metadata and is known
 * for providing accurate player count information.
 * 
 * Uses the IGDB API:
 * - https://api.igdb.com/v4/games
 * - https://api.igdb.com/v4/multiplayer_modes
 * 
 * Authentication: Requires Twitch OAuth2 credentials
 * - TWITCH_CLIENT_ID
 * - TWITCH_CLIENT_SECRET
 * 
 * Rate limiting: 4 requests/second (handled by GameSyncService)
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    MetadataProviderCapabilities,
    RateLimitConfig,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {stripHtml, truncateText} from '../../lib/htmlUtils';
import settings from '../../settings';

const IGDB_API_BASE = 'https://api.igdb.com/v4';
const TWITCH_AUTH_URL = 'https://id.twitch.tv/oauth2/token';

// Short description max length
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

// Default max players for splitscreen (IGDB only has boolean flag, no count)
const DEFAULT_SPLITSCREEN_MAX_PLAYERS = 4;

// Cache for OAuth token
let cachedToken: {token: string; expiresAt: number} | null = null;

const IGDB_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'igdb',
    name: 'IGDB',
    description: 'Fetch game metadata from IGDB (Internet Game Database). Known for accurate player count data.',
    version: '1.0.0',
    requiresApiKey: true,
    gameUrlPattern: 'https://www.igdb.com/games/{id}',
};

/**
 * IGDB game response structure
 */
interface IgdbGame {
    id: number;
    name: string;
    slug?: string;
    summary?: string;
    storyline?: string;
    first_release_date?: number; // Unix timestamp
    cover?: {
        id: number;
        image_id: string;
    };
    screenshots?: Array<{
        id: number;
        image_id: string;
    }>;
    videos?: Array<{
        id: number;
        video_id: string;
    }>;
    genres?: Array<{
        id: number;
        name: string;
    }>;
    themes?: Array<{
        id: number;
        name: string;
    }>;
    platforms?: Array<{
        id: number;
        name: string;
        abbreviation?: string;
    }>;
    involved_companies?: Array<{
        id: number;
        company: {
            id: number;
            name: string;
        };
        developer: boolean;
        publisher: boolean;
    }>;
    game_modes?: Array<{
        id: number;
        name: string;
        slug: string;
    }>;
    multiplayer_modes?: Array<{
        id: number;
        campaigncoop?: boolean;
        dropin?: boolean;
        lancoop?: boolean;
        offlinecoop?: boolean;
        offlinecoopmax?: number;
        offlinemax?: number;
        onlinecoop?: boolean;
        onlinecoopmax?: number;
        onlinemax?: number;
        splitscreen?: boolean;
        // Note: splitscreenmax is not a valid IGDB field - splitscreen is boolean only
    }>;
    age_ratings?: Array<{
        id: number;
        category: number; // 1 = ESRB, 2 = PEGI
        rating: number;
    }>;
    aggregated_rating?: number;
    aggregated_rating_count?: number;
    total_rating?: number;
}

export class IgdbMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(IGDB_METADATA_MANIFEST);
    }
    
    /**
     * IGDB capabilities:
     * - Has ACCURATE player counts (best source for multiplayer data)
     * - Does NOT have store URLs
     * - Supports batch requests via `where id = (1,2,3)` syntax
     * - Supports search
     * - Has descriptions and cover images
     */
    getCapabilities(): MetadataProviderCapabilities {
        return {
            hasAccuratePlayerCounts: true, // IGDB is the best source for player counts
            hasStoreUrls: false,
            supportsBatchRequests: true,
            supportsSearch: true,
            hasDescriptions: true,
            hasCoverImages: true,
        };
    }
    
    /**
     * IGDB rate limit configuration
     * IGDB allows 4 requests/second
     */
    getRateLimitConfig(): RateLimitConfig {
        return {
            requestDelayMs: 300, // 300ms between requests (4 req/sec)
            maxBatchSize: 50, // IGDB supports up to 500 IDs per batch
            batchDelayMs: 500, // Small delay between batch requests
            maxGamesPerSync: 1000, // Can handle large libraries
            retryDelayMs: 1000, // Wait 1 second on rate limit
            maxConsecutiveErrors: 5,
        };
    }
    
    /**
     * Get Twitch OAuth2 token for IGDB API
     * Uses settings module for credentials (falls back to env vars)
     */
    private async getAccessToken(): Promise<string | null> {
        const clientId = settings.value.twitchClientId || process.env.TWITCH_CLIENT_ID;
        const clientSecret = settings.value.twitchClientSecret || process.env.TWITCH_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
            console.warn('IGDB: Twitch credentials not configured (twitchClientId, twitchClientSecret in settings)');
            return null;
        }
        
        // Check cached token
        if (cachedToken && Date.now() < cachedToken.expiresAt) {
            return cachedToken.token;
        }
        
        try {
            const response = await fetch(TWITCH_AUTH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    grant_type: 'client_credentials',
                }),
            });
            
            if (!response.ok) {
                console.error(`IGDB: Failed to get OAuth token: ${response.status}`);
                return null;
            }
            
            const data = await response.json() as {access_token: string; expires_in: number};
            
            // Cache token with 10 minute buffer before expiry
            cachedToken = {
                token: data.access_token,
                expiresAt: Date.now() + (data.expires_in - 600) * 1000,
            };
            
            return data.access_token;
        } catch (error) {
            console.error('IGDB: OAuth token fetch error:', error);
            return null;
        }
    }
    
    /**
     * Make IGDB API request
     * NOTE: Rate limiting is handled by GameSyncService, not here.
     */
    private async makeRequest(endpoint: string, body: string): Promise<unknown[] | null> {
        const token = await this.getAccessToken();
        if (!token) return null;
        
        const clientId = settings.value.twitchClientId || process.env.TWITCH_CLIENT_ID;
        if (!clientId) return null;
        
        try {
            // IGDB requires the body to be trimmed - no leading/trailing whitespace
            const trimmedBody = body.trim();
            
            const response = await fetch(`${IGDB_API_BASE}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Client-ID': clientId,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'text/plain',
                },
                body: trimmedBody,
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');
                console.error(`IGDB API error: ${response.status} - ${errorText}`);
                return null;
            }
            
            return await response.json() as unknown[];
        } catch (error) {
            console.error('IGDB API request error:', error);
            return null;
        }
    }
    
    /**
     * Search for games
     */
    async searchGames(query: string, limit = 10, _apiKey?: string): Promise<MetadataSearchResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }
        
        // Escape backslashes first, then double quotes for IGDB query syntax
        const escapedQuery = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const body = `
            search "${escapedQuery}";
            fields id, name, cover.image_id, first_release_date;
            limit ${Math.min(limit, 50)};
        `;
        
        const results = await this.makeRequest('games', body) as IgdbGame[] | null;
        if (!results) return [];
        
        return results.map(game => ({
            externalId: String(game.id),
            name: game.name,
            releaseDate: game.first_release_date 
                ? new Date(game.first_release_date * 1000).toISOString().split('T')[0]
                : undefined,
            coverImageUrl: game.cover?.image_id 
                ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.cover.image_id}.jpg`
                : undefined,
            provider: 'igdb',
        }));
    }
    
    /**
     * Get detailed metadata for a game
     * Note: IGDB multiplayer_modes only has: campaigncoop, dropin, lancoop, offlinecoop, offlinecoopmax,
     * offlinemax, onlinecoop, onlinecoopmax, onlinemax, splitscreen (boolean, no max count)
     */
    async getGameMetadata(externalId: string, _apiKey?: string): Promise<GameMetadata | null> {
        const body = `
            where id = ${externalId};
            fields id, name, slug, summary, storyline, first_release_date,
                   cover.image_id, screenshots.image_id, videos.video_id,
                   genres.name, themes.name, platforms.name, platforms.abbreviation,
                   involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                   game_modes.name, game_modes.slug,
                   multiplayer_modes.campaigncoop, multiplayer_modes.dropin, multiplayer_modes.lancoop,
                   multiplayer_modes.offlinecoop, multiplayer_modes.offlinecoopmax, multiplayer_modes.offlinemax,
                   multiplayer_modes.onlinecoop, multiplayer_modes.onlinecoopmax, multiplayer_modes.onlinemax,
                   multiplayer_modes.splitscreen,
                   age_ratings.category, age_ratings.rating,
                   aggregated_rating, total_rating;
            limit 1;
        `;
        
        const results = await this.makeRequest('games', body) as IgdbGame[] | null;
        if (!results || results.length === 0) return null;
        
        return this.mapToGameMetadata(results[0]);
    }
    
    /**
     * Get metadata for multiple games
     * Note: IGDB multiplayer_modes only has: campaigncoop, dropin, lancoop, offlinecoop, offlinecoopmax,
     * offlinemax, onlinecoop, onlinecoopmax, onlinemax, splitscreen (boolean, no max count)
     */
    async getGamesMetadata(externalIds: string[], _apiKey?: string): Promise<GameMetadata[]> {
        if (externalIds.length === 0) return [];
        
        // IGDB supports batch queries with `where id = (1,2,3)` syntax
        const idList = externalIds.join(',');
        const body = `
            where id = (${idList});
            fields id, name, slug, summary, storyline, first_release_date,
                   cover.image_id, screenshots.image_id, videos.video_id,
                   genres.name, themes.name, platforms.name, platforms.abbreviation,
                   involved_companies.company.name, involved_companies.developer, involved_companies.publisher,
                   game_modes.name, game_modes.slug,
                   multiplayer_modes.campaigncoop, multiplayer_modes.dropin, multiplayer_modes.lancoop,
                   multiplayer_modes.offlinecoop, multiplayer_modes.offlinecoopmax, multiplayer_modes.offlinemax,
                   multiplayer_modes.onlinecoop, multiplayer_modes.onlinecoopmax, multiplayer_modes.onlinemax,
                   multiplayer_modes.splitscreen,
                   age_ratings.category, age_ratings.rating,
                   aggregated_rating, total_rating;
            limit ${Math.min(externalIds.length, 500)};
        `;
        
        const results = await this.makeRequest('games', body) as IgdbGame[] | null;
        if (!results) return [];
        
        return results.map(game => this.mapToGameMetadata(game));
    }
    
    /**
     * Search for game by name (useful for enrichment from Steam games)
     */
    async findByGameName(gameName: string): Promise<GameMetadata | null> {
        const searchResults = await this.searchGames(gameName, 1);
        if (searchResults.length === 0) return null;
        return this.getGameMetadata(searchResults[0].externalId);
    }
    
    /**
     * Get game URL
     */
    getGameUrl(externalId: string): string {
        return `https://www.igdb.com/games/${externalId}`;
    }
    
    /**
     * Map IGDB response to GameMetadata
     * IGDB provides accurate multiplayer_modes with exact player counts
     */
    private mapToGameMetadata(data: IgdbGame): GameMetadata {
        // Extract player info from multiplayer_modes (IGDB's accurate data)
        const playerInfo = this.extractPlayerInfo(data);
        
        // Get developers and publishers from involved_companies
        const developers = data.involved_companies
            ?.filter(c => c.developer)
            .map(c => c.company.name) || [];
        const publishers = data.involved_companies
            ?.filter(c => c.publisher)
            .map(c => c.company.name) || [];
        
        // Build platforms list
        const platforms = data.platforms?.map(p => p.abbreviation || p.name) || [];
        
        // Get genres
        const genres = data.genres?.map(g => g.name) || [];
        
        // Get description
        const description = stripHtml(data.summary || data.storyline || '');
        
        // Get release date
        const releaseDate = data.first_release_date
            ? new Date(data.first_release_date * 1000).toISOString().split('T')[0]
            : undefined;
        
        // Get images
        const coverImageUrl = data.cover?.image_id
            ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${data.cover.image_id}.jpg`
            : undefined;
        
        const headerImageUrl = data.cover?.image_id
            ? `https://images.igdb.com/igdb/image/upload/t_720p/${data.cover.image_id}.jpg`
            : undefined;
        
        const screenshots = data.screenshots?.map(s =>
            `https://images.igdb.com/igdb/image/upload/t_screenshot_big/${s.image_id}.jpg`
        );
        
        const videos = data.videos?.map(v =>
            `https://www.youtube.com/watch?v=${v.video_id}`
        );
        
        // Get age rating (prefer ESRB)
        let ageRating: string | undefined;
        const esrbRating = data.age_ratings?.find(r => r.category === 1);
        if (esrbRating) {
            ageRating = this.mapEsrbRating(esrbRating.rating);
        }
        
        return {
            externalId: String(data.id),
            name: data.name,
            description: description || undefined,
            shortDescription: description ? truncateText(description, MAX_SHORT_DESCRIPTION_LENGTH) : undefined,
            coverImageUrl,
            headerImageUrl,
            screenshots,
            videos,
            genres,
            developers,
            publishers,
            releaseDate,
            platforms,
            metacriticScore: data.aggregated_rating 
                ? Math.round(data.aggregated_rating) 
                : (data.total_rating ? Math.round(data.total_rating) : undefined),
            ageRating,
            playerInfo,
            rawPayload: {...data},
        };
    }
    
    /**
     * Extract accurate player info from IGDB multiplayer_modes
     * IGDB provides exact player counts, not estimates
     */
    private extractPlayerInfo(data: IgdbGame): GameMetadata['playerInfo'] {
        const gameModes = data.game_modes || [];
        const multiplayerModes = data.multiplayer_modes || [];
        
        // Check for single-player
        const isSinglePlayer = gameModes.some(m => m.slug === 'single-player');
        
        // Check for multiplayer modes
        const isMultiplayer = gameModes.some(m => 
            m.slug === 'multiplayer' || 
            m.slug === 'co-operative' || 
            m.slug === 'split-screen'
        );
        const isMMO = gameModes.some(m => m.slug === 'massively-multiplayer-online-mmo');
        
        // Extract actual player counts from multiplayer_modes
        let onlineMaxPlayers: number | undefined;
        let localMaxPlayers: number | undefined;
        let overallMaxPlayers: number | undefined;
        let supportsOnline = false;
        let supportsLocal = false;
        
        for (const mode of multiplayerModes) {
            // Online modes
            if (mode.onlinemax !== undefined && mode.onlinemax > 0) {
                supportsOnline = true;
                onlineMaxPlayers = Math.max(onlineMaxPlayers || 0, mode.onlinemax);
            }
            if (mode.onlinecoopmax !== undefined && mode.onlinecoopmax > 0) {
                supportsOnline = true;
                onlineMaxPlayers = Math.max(onlineMaxPlayers || 0, mode.onlinecoopmax);
            }
            
            // Local/offline modes
            if (mode.offlinemax !== undefined && mode.offlinemax > 0) {
                supportsLocal = true;
                localMaxPlayers = Math.max(localMaxPlayers || 0, mode.offlinemax);
            }
            if (mode.offlinecoopmax !== undefined && mode.offlinecoopmax > 0) {
                supportsLocal = true;
                localMaxPlayers = Math.max(localMaxPlayers || 0, mode.offlinecoopmax);
            }
            // Splitscreen is boolean in IGDB (no max count) - use default constant
            if (mode.splitscreen) {
                supportsLocal = true;
                // Use offlinemax if available, otherwise use default splitscreen max
                if (localMaxPlayers === undefined || localMaxPlayers < DEFAULT_SPLITSCREEN_MAX_PLAYERS) {
                    localMaxPlayers = DEFAULT_SPLITSCREEN_MAX_PLAYERS;
                }
            }
            
            // LAN modes count as both
            if (mode.lancoop) {
                supportsLocal = true;
            }
        }
        
        // Determine overall max players
        if (onlineMaxPlayers !== undefined && localMaxPlayers !== undefined) {
            overallMaxPlayers = Math.max(onlineMaxPlayers, localMaxPlayers);
        } else if (onlineMaxPlayers !== undefined) {
            overallMaxPlayers = onlineMaxPlayers;
        } else if (localMaxPlayers !== undefined) {
            overallMaxPlayers = localMaxPlayers;
        } else if (!isMultiplayer && isSinglePlayer) {
            overallMaxPlayers = 1;
        } else if (isMMO) {
            // MMOs typically have very high player counts but we don't know exact
            supportsOnline = true;
            // Don't set a specific number since we don't know - leave undefined
        }
        
        // Determine minimum players: games that support any mode start at 1 player
        const overallMinPlayers = this.calculateMinPlayers(isSinglePlayer, overallMaxPlayers);
        
        return {
            overallMinPlayers,
            overallMaxPlayers,
            supportsOnline,
            supportsLocal,
            onlineMaxPlayers: supportsOnline ? onlineMaxPlayers : undefined,
            localMaxPlayers: supportsLocal ? localMaxPlayers : undefined,
        };
    }
    
    /**
     * Calculate minimum players based on game modes
     * Games that support single-player or have any max players defined start at 1
     */
    private calculateMinPlayers(isSinglePlayer: boolean, overallMaxPlayers: number | undefined): number | undefined {
        if (isSinglePlayer) {
            return 1;
        }
        if (overallMaxPlayers !== undefined && overallMaxPlayers > 0) {
            return 1;
        }
        return undefined;
    }
    
    /**
     * Map ESRB rating ID to string
     */
    private mapEsrbRating(rating: number): string {
        const ratings: Record<number, string> = {
            6: 'RP', // Rating Pending
            7: 'EC', // Early Childhood
            8: 'E',  // Everyone
            9: 'E10+', // Everyone 10+
            10: 'T', // Teen
            11: 'M', // Mature
            12: 'AO', // Adults Only
        };
        return ratings[rating];
    }
}
