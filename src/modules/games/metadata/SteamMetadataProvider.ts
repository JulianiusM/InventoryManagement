/**
 * Steam Metadata Provider
 * Fetches game metadata from Steam Store API
 * 
 * Uses the Steam Store API (not Web API) for app details:
 * - https://store.steampowered.com/api/appdetails?appids=<appid>
 * 
 * Note: This API is public and doesn't require an API key,
 * but user-provided keys can be used for extended functionality.
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {stripHtml, truncateText} from '../../lib/htmlUtils';
import settings from '../../settings';

const STEAM_STORE_API_BASE = 'https://store.steampowered.com/api';
const STEAM_SEARCH_URL = 'https://store.steampowered.com/search/suggest';

// Rate limiting configuration - Steam API is strict about rate limits
// Using conservative values to avoid being banned for large datasets
const BATCH_SIZE = 5; // Moderate batch size
const DELAY_BETWEEN_BATCHES_MS = 1500; // 1.5 seconds between batches
const DELAY_BETWEEN_INDIVIDUAL_MS = 400; // 400ms between individual requests
const MAX_GAMES_TO_FETCH = 500; // Increased limit for metadata fetches
const RATE_LIMIT_RETRY_DELAY_MS = 5000; // Wait 5 seconds on rate limit before retry

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

/**
 * Steam app details response structure
 */
interface SteamAppDetailsResponse {
    [appId: string]: {
        success: boolean;
        data?: SteamAppDetails;
    };
}

interface SteamAppDetails {
    type: string;
    name: string;
    steam_appid: number;
    required_age: number | string;
    is_free: boolean;
    detailed_description?: string;
    about_the_game?: string;
    short_description?: string;
    supported_languages?: string;
    header_image?: string;
    capsule_image?: string;
    capsule_imagev5?: string;
    website?: string;
    developers?: string[];
    publishers?: string[];
    price_overview?: {
        currency: string;
        initial: number;
        final: number;
        discount_percent: number;
        initial_formatted: string;
        final_formatted: string;
    };
    platforms?: {
        windows: boolean;
        mac: boolean;
        linux: boolean;
    };
    metacritic?: {
        score: number;
        url: string;
    };
    categories?: Array<{id: number; description: string}>;
    genres?: Array<{id: string; description: string}>;
    screenshots?: Array<{id: number; path_thumbnail: string; path_full: string}>;
    movies?: Array<{id: number; name: string; thumbnail: string; webm?: {480: string; max: string}}>;
    release_date?: {
        coming_soon: boolean;
        date: string;
    };
    content_descriptors?: {
        ids: number[];
        notes?: string;
    };
}

const STEAM_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'steam',
    name: 'Steam',
    description: 'Fetch game metadata from Steam Store. Works with Steam AppIDs.',
    version: '1.0.0',
    requiresApiKey: false, // Store API is public
    gameUrlPattern: 'https://store.steampowered.com/app/{id}',
};

export class SteamMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(STEAM_METADATA_MANIFEST);
    }

    /**
     * Get the Steam Web API key if available
     * Uses settings module (falls back to env var)
     */
    private getApiKey(userApiKey?: string): string | undefined {
        return userApiKey || settings.value.steamWebApiKey || process.env.STEAM_WEB_API_KEY;
    }

    /**
     * Search for games on Steam
     * Uses Steam's search suggest endpoint
     */
    async searchGames(query: string, limit = 10, _apiKey?: string): Promise<MetadataSearchResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }
        
        const params = new URLSearchParams({
            term: query.trim(),
            f: 'games',
            cc: 'US',
            l: 'english',
        });
        
        const url = `${STEAM_SEARCH_URL}?${params.toString()}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Accept': 'text/html',
                },
            });
            
            if (!response.ok) {
                return [];
            }
            
            const html = await response.text();
            
            // Parse the HTML response to extract game info
            // Steam returns HTML with data-ds-appid attributes
            const results: MetadataSearchResult[] = [];
            const appIdMatches = html.matchAll(/data-ds-appid="(\d+)"[^>]*>.*?<div class="match_name"[^>]*>([^<]+)<\/div>/gs);
            
            for (const match of appIdMatches) {
                if (results.length >= limit) break;
                
                results.push({
                    externalId: match[1],
                    name: this.decodeHtmlEntities(match[2].trim()),
                    coverImageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${match[1]}/header.jpg`,
                    provider: 'steam',
                });
            }
            
            // Fallback: If structured parsing didn't find results, try extracting just AppIDs
            // Note: Steam's HTML structure may change; this extracts data-ds-appid attributes
            // The name will show as placeholder until enriched via getGameMetadata()
            if (results.length === 0) {
                const simpleMatches = html.matchAll(/data-ds-appid="(\d+)"/g);
                const seenIds = new Set<string>();
                
                for (const match of simpleMatches) {
                    if (results.length >= limit) break;
                    if (seenIds.has(match[1])) continue;
                    seenIds.add(match[1]);
                    
                    results.push({
                        externalId: match[1],
                        name: `Steam App ${match[1]}`, // Placeholder - call getGameMetadata() for full details
                        coverImageUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${match[1]}/header.jpg`,
                        provider: 'steam',
                    });
                }
            }
            
            return results;
        } catch {
            // Search failures are non-critical - return empty results
            // Could be network issues, Steam API changes, or rate limiting
            return [];
        }
    }

    /**
     * Get detailed metadata for a Steam game
     * Returns GameMetadata on success, null on permanent failure (game not found, invalid ID),
     * or throws Error on transient failure (network error, rate limit) that should be retried
     */
    async getGameMetadata(externalId: string, _apiKey?: string): Promise<GameMetadata | null> {
        // Validate AppID format - this is a permanent failure, don't retry
        if (!/^\d+$/.test(externalId)) {
            return null;
        }
        
        const url = `${STEAM_STORE_API_BASE}/appdetails?appids=${externalId}`;
        
        const response = await fetch(url);
        
        // Rate limit or server error - throw to trigger retry
        if (response.status === 429 || response.status >= 500) {
            throw new Error(`Steam API error ${response.status} - transient, will retry`);
        }
        
        // Other error (4xx) - permanent failure, don't retry
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json() as SteamAppDetailsResponse;
        const appData = data[externalId];
        
        // Game not found or not available - permanent failure
        if (!appData?.success || !appData.data) {
            return null;
        }
        
        return this.mapToGameMetadata(appData.data);
    }

    /**
     * Get metadata for multiple games
     * Steam API only allows single appid per request, so we batch with rate limiting
     * 
     * Improvements:
     * - Wait and retry on rate limit (429) instead of skipping
     * - Higher limits for large libraries
     * - Better error handling
     */
    async getGamesMetadata(externalIds: string[], apiKey?: string): Promise<GameMetadata[]> {
        const results: GameMetadata[] = [];
        
        // Higher limit for large libraries
        const idsToFetch = externalIds.slice(0, MAX_GAMES_TO_FETCH);
        if (externalIds.length > MAX_GAMES_TO_FETCH) {
            console.log(`Steam metadata: limiting fetch to ${MAX_GAMES_TO_FETCH} of ${externalIds.length} games to avoid rate limits`);
        }
        
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 5;
        
        // Steam rate limits: fetch in small batches with longer delays
        for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
            const batch = idsToFetch.slice(i, i + BATCH_SIZE);
            
            // Stop if too many consecutive errors (likely banned)
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.log(`Steam metadata: ${MAX_CONSECUTIVE_ERRORS} consecutive errors, stopping`);
                break;
            }
            
            // Fetch batch one by one with small delays to be extra safe
            for (const id of batch) {
                const result = await this.getGameMetadataWithRetry(id, apiKey);
                if (result) {
                    results.push(result);
                    consecutiveErrors = 0;
                } else {
                    consecutiveErrors++;
                }
                // Small delay between individual requests
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_INDIVIDUAL_MS));
            }
            
            // Longer delay between batches to avoid rate limiting
            if (i + BATCH_SIZE < idsToFetch.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS));
            }
        }
        
        return results;
    }
    
    /**
     * Get metadata with retry on transient errors only
     * Only retries on 429 (rate limit) or 5xx (server errors)
     * Returns null immediately for permanent failures (invalid ID, game not found)
     */
    private async getGameMetadataWithRetry(externalId: string, apiKey?: string, retries = 2): Promise<GameMetadata | null> {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const result = await this.getGameMetadata(externalId, apiKey);
                // null means permanent failure (game not found), no retry needed
                return result;
            } catch (error) {
                // Transient error (rate limit, server error) - retry
                if (attempt < retries) {
                    console.log(`Steam metadata: retrying ${externalId} after ${RATE_LIMIT_RETRY_DELAY_MS}ms (attempt ${attempt + 1}/${retries})`);
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_RETRY_DELAY_MS));
                }
                // Last attempt failed, return null
            }
        }
        return null;
    }

    /**
     * Get Steam store URL for a game
     */
    getGameUrl(externalId: string): string {
        return `https://store.steampowered.com/app/${externalId}`;
    }

    /**
     * Map Steam API response to GameMetadata
     */
    private mapToGameMetadata(data: SteamAppDetails): GameMetadata {
        // Determine player info from categories
        const playerInfo = this.extractPlayerInfo(data.categories || []);
        
        // Build platforms list
        const platforms: string[] = [];
        if (data.platforms?.windows) platforms.push('Windows');
        if (data.platforms?.mac) platforms.push('macOS');
        if (data.platforms?.linux) platforms.push('Linux');
        
        // Strip HTML from descriptions and truncate for display
        const fullDescription = stripHtml(data.about_the_game || data.detailed_description || '');
        const steamShortDesc = stripHtml(data.short_description || '');
        // Use Steam's short description if available, otherwise truncate the full description
        const shortDescription = steamShortDesc || truncateText(fullDescription, MAX_SHORT_DESCRIPTION_LENGTH);
        
        return {
            externalId: String(data.steam_appid),
            name: data.name,
            description: fullDescription || undefined,
            shortDescription: shortDescription || undefined,
            coverImageUrl: data.capsule_imagev5 || data.capsule_image,
            headerImageUrl: data.header_image,
            screenshots: data.screenshots?.map(s => s.path_full),
            videos: data.movies?.map(m => m.webm?.max || m.thumbnail),
            genres: data.genres?.map(g => g.description),
            categories: data.categories?.map(c => c.description),
            developers: data.developers,
            publishers: data.publishers,
            releaseDate: data.release_date?.date,
            platforms,
            metacriticScore: data.metacritic?.score,
            metacriticUrl: data.metacritic?.url,
            ageRating: this.parseAgeRating(data.required_age),
            playerInfo,
            priceInfo: data.price_overview ? {
                currency: data.price_overview.currency,
                initialPrice: data.price_overview.initial / 100,
                finalPrice: data.price_overview.final / 100,
                discountPercent: data.price_overview.discount_percent,
                isFree: data.is_free,
            } : data.is_free ? {
                isFree: true,
            } : undefined,
            rawPayload: {...data},
        };
    }

    /**
     * Extract player info from Steam categories
     * 
     * NOTE: Steam does NOT provide exact player counts in its API.
     * This method only extracts what Steam actually provides:
     * - Whether the game supports multiplayer/online/local
     * - Whether it's single-player only
     * 
     * Actual player counts should be fetched from IGDB or other providers
     * that have this data. This provider only indicates capabilities,
     * not specific player numbers.
     */
    private extractPlayerInfo(categories: Array<{id: number; description: string}>): GameMetadata['playerInfo'] {
        const categoryIds = new Set(categories.map(c => c.id));
        
        // Steam category IDs:
        // 1 = Multi-player
        // 2 = Single-player
        // 9 = Co-op
        // 20 = MMO
        // 24 = Shared/Split Screen
        // 27 = Cross-Platform Multiplayer
        // 36 = Online PvP
        // 37 = Shared/Split Screen PvP
        // 38 = Online Co-op
        // 39 = Shared/Split Screen Co-op
        // 47 = LAN PvP
        // 48 = LAN Co-op
        // 49 = PvP
        
        const isSinglePlayer = categoryIds.has(2);
        const isMultiplayer = categoryIds.has(1) || categoryIds.has(9) || categoryIds.has(20) || categoryIds.has(49);
        const hasOnline = categoryIds.has(36) || categoryIds.has(38) || categoryIds.has(27) || categoryIds.has(20);
        const hasLocal = categoryIds.has(24) || categoryIds.has(37) || categoryIds.has(39);
        
        // Steam doesn't provide exact player counts - only capabilities
        // We only set overallMaxPlayers=1 for single-player-only games
        // For multiplayer games, we leave counts undefined so IGDB or other
        // providers can fill in the actual numbers
        let overallMaxPlayers: number | undefined;
        
        if (!isMultiplayer && isSinglePlayer) {
            overallMaxPlayers = 1;
        }
        // For multiplayer games, don't set fake defaults - let enrichment handle it
        
        return {
            overallMinPlayers: 1,
            overallMaxPlayers,
            supportsOnline: hasOnline,
            supportsLocal: hasLocal,
            // Don't set specific player counts - Steam doesn't provide this data
            // IGDB or other providers should be used for accurate counts
            onlineMaxPlayers: undefined,
            localMaxPlayers: undefined,
        };
    }

    /**
     * Parse age rating from Steam format
     */
    private parseAgeRating(requiredAge: number | string): string | undefined {
        if (!requiredAge || requiredAge === 0 || requiredAge === '0') {
            return undefined;
        }
        
        const age = typeof requiredAge === 'string' ? parseInt(requiredAge, 10) : requiredAge;
        if (isNaN(age) || age === 0) {
            return undefined;
        }
        
        return `${age}+`;
    }

    /**
     * Decode HTML entities in text
     * Note: Order matters - decode &amp; last to avoid double-unescaping
     */
    private decodeHtmlEntities(text: string): string {
        return text
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&trade;/g, '™')
            .replace(/&reg;/g, '®')
            .replace(/&copy;/g, '©')
            .replace(/&amp;/g, '&'); // Must be last to prevent double-unescaping
    }
}
