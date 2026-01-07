/**
 * RAWG Metadata Provider
 * Fetches game metadata from RAWG.io API
 * 
 * Uses the RAWG Video Games Database API:
 * - https://api.rawg.io/api/games
 * - https://api.rawg.io/api/games/{id}
 * 
 * Note: RAWG has a free tier that allows 20,000 requests/month
 * API key required: https://rawg.io/apidocs
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {stripHtml, truncateText} from '../../lib/htmlUtils';

const RAWG_API_BASE = 'https://api.rawg.io/api';

// Environment variable for RAWG API key
const RAWG_API_KEY_ENV = 'RAWG_API_KEY';

// Maximum length for short description (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

/**
 * RAWG game response structure
 */
interface RawgGameResponse {
    id: number;
    slug: string;
    name: string;
    name_original?: string;
    description?: string;
    description_raw?: string;
    released?: string;
    tba: boolean;
    background_image?: string;
    background_image_additional?: string;
    website?: string;
    rating: number;
    rating_top: number;
    ratings_count: number;
    metacritic?: number;
    playtime?: number;
    screenshots_count?: number;
    movies_count?: number;
    creators_count?: number;
    achievements_count?: number;
    parent_achievements_count?: number;
    updated?: string;
    esrb_rating?: {
        id: number;
        name: string;
        slug: string;
    };
    platforms?: Array<{
        platform: {
            id: number;
            name: string;
            slug: string;
        };
        released_at?: string;
        requirements?: {
            minimum?: string;
            recommended?: string;
        };
    }>;
    developers?: Array<{
        id: number;
        name: string;
        slug: string;
    }>;
    publishers?: Array<{
        id: number;
        name: string;
        slug: string;
    }>;
    genres?: Array<{
        id: number;
        name: string;
        slug: string;
    }>;
    tags?: Array<{
        id: number;
        name: string;
        slug: string;
    }>;
    stores?: Array<{
        id: number;
        store: {
            id: number;
            name: string;
            slug: string;
        };
        url?: string;
    }>;
    short_screenshots?: Array<{
        id: number;
        image: string;
    }>;
}

interface RawgSearchResponse {
    count: number;
    next?: string;
    previous?: string;
    results: RawgGameResponse[];
}

/**
 * RAWG metadata provider implementation
 */
export class RawgMetadataProvider extends BaseMetadataProvider {
    private rateLimitDelay = 100; // 100ms between requests
    private lastRequestTime = 0;
    
    constructor() {
        super({
            id: 'rawg',
            name: 'RAWG',
            description: 'Fetch game metadata from RAWG.io video game database',
            version: '1.0.0',
            requiresApiKey: true,
            gameUrlPattern: 'https://rawg.io/games/{id}',
        });
    }
    
    /**
     * Get API key from environment or user-provided
     */
    private getApiKey(userApiKey?: string): string | null {
        return userApiKey || process.env[RAWG_API_KEY_ENV] || null;
    }
    
    /**
     * Rate limiting helper
     */
    private async rateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        if (elapsed < this.rateLimitDelay) {
            await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - elapsed));
        }
        this.lastRequestTime = Date.now();
    }
    
    /**
     * Search for games by name
     */
    async searchGames(query: string, limit = 10, apiKey?: string): Promise<MetadataSearchResult[]> {
        const key = this.getApiKey(apiKey);
        if (!key) {
            console.warn('RAWG API key not configured');
            return [];
        }
        
        await this.rateLimit();
        
        try {
            const params = new URLSearchParams({
                key,
                search: query,
                page_size: String(Math.min(limit, 40)),
            });
            
            const response = await fetch(`${RAWG_API_BASE}/games?${params.toString()}`);
            if (!response.ok) {
                console.error(`RAWG search failed: ${response.status}`);
                return [];
            }
            
            const data = await response.json() as RawgSearchResponse;
            
            return data.results.map(game => ({
                externalId: String(game.id),
                name: game.name,
                releaseDate: game.released,
                coverImageUrl: game.background_image,
                provider: 'rawg',
            }));
        } catch (error) {
            console.error('RAWG search error:', error);
            return [];
        }
    }
    
    /**
     * Get detailed metadata for a game
     */
    async getGameMetadata(externalId: string, apiKey?: string): Promise<GameMetadata | null> {
        const key = this.getApiKey(apiKey);
        if (!key) {
            console.warn('RAWG API key not configured');
            return null;
        }
        
        await this.rateLimit();
        
        try {
            const params = new URLSearchParams({key});
            const response = await fetch(`${RAWG_API_BASE}/games/${externalId}?${params.toString()}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                console.error(`RAWG getGameMetadata failed: ${response.status}`);
                return null;
            }
            
            const data = await response.json() as RawgGameResponse;
            return this.mapToGameMetadata(data);
        } catch (error) {
            console.error('RAWG getGameMetadata error:', error);
            return null;
        }
    }
    
    /**
     * Get metadata for multiple games
     */
    async getGamesMetadata(externalIds: string[], apiKey?: string): Promise<GameMetadata[]> {
        const results: GameMetadata[] = [];
        
        // RAWG doesn't have bulk endpoint, fetch one by one with rate limiting
        for (const id of externalIds) {
            const metadata = await this.getGameMetadata(id, apiKey);
            if (metadata) {
                results.push(metadata);
            }
        }
        
        return results;
    }
    
    /**
     * Search for a game by name (for Steam game fallback)
     * This is more reliable than searching by AppID since RAWG search is name-based
     */
    async findByGameName(gameName: string, apiKey?: string): Promise<GameMetadata | null> {
        const key = this.getApiKey(apiKey);
        if (!key) return null;
        
        try {
            // Search by game name
            const searchResults = await this.searchGames(gameName, 1, apiKey);
            if (searchResults.length === 0) return null;
            
            // Get full details for best match
            return this.getGameMetadata(searchResults[0].externalId, apiKey);
        } catch {
            return null;
        }
    }
    
    /**
     * Get game URL
     */
    getGameUrl(externalId: string): string {
        return `https://rawg.io/games/${externalId}`;
    }
    
    /**
     * Map RAWG response to GameMetadata
     */
    private mapToGameMetadata(data: RawgGameResponse): GameMetadata {
        // Determine player info from tags
        const playerInfo = this.extractPlayerInfo(data.tags || []);
        
        // Build platforms list
        const platforms = data.platforms?.map(p => p.platform.name) || [];
        
        // Get description (prefer raw, then strip HTML from formatted)
        const description = data.description_raw || stripHtml(data.description || '');
        
        return {
            externalId: String(data.id),
            name: data.name,
            description,
            shortDescription: description ? truncateText(description, MAX_SHORT_DESCRIPTION_LENGTH) : undefined,
            coverImageUrl: data.background_image,
            headerImageUrl: data.background_image_additional || data.background_image,
            screenshots: data.short_screenshots?.map(s => s.image),
            genres: data.genres?.map(g => g.name),
            developers: data.developers?.map(d => d.name),
            publishers: data.publishers?.map(p => p.name),
            releaseDate: data.released,
            platforms,
            metacriticScore: data.metacritic,
            ageRating: data.esrb_rating?.name,
            playerInfo,
            rawPayload: {...data},
        };
    }
    
    /**
     * Extract player info from RAWG tags
     * 
     * NOTE: RAWG does NOT provide exact player counts in its API.
     * This method only extracts what RAWG actually provides:
     * - Whether the game supports multiplayer/online/local based on tags
     * - Whether it's single-player only
     * 
     * Actual player counts should be fetched from IGDB or other providers
     * that have this data. This provider only indicates capabilities,
     * not specific player numbers.
     */
    private extractPlayerInfo(tags: Array<{id: number; name: string; slug: string}>): GameMetadata['playerInfo'] {
        const tagSlugs = new Set(tags.map(t => t.slug.toLowerCase()));
        
        // Common RAWG tag slugs for multiplayer
        const hasMultiplayer = tagSlugs.has('multiplayer') || 
                              tagSlugs.has('online-multiplayer') ||
                              tagSlugs.has('co-op') ||
                              tagSlugs.has('local-co-op') ||
                              tagSlugs.has('split-screen') ||
                              tagSlugs.has('online-co-op') ||
                              tagSlugs.has('local-multiplayer');
        
        const hasOnline = tagSlugs.has('online-multiplayer') || 
                         tagSlugs.has('online-co-op') ||
                         tagSlugs.has('mmo') ||
                         tagSlugs.has('massively-multiplayer');
        
        const hasLocal = tagSlugs.has('local-co-op') || 
                        tagSlugs.has('local-multiplayer') ||
                        tagSlugs.has('split-screen');
        
        // Only set overallMaxPlayers=1 for single-player-only games
        // For multiplayer games, we leave counts undefined so IGDB or other
        // providers can fill in the actual numbers
        let overallMaxPlayers: number | undefined;
        
        if (!hasMultiplayer) {
            overallMaxPlayers = 1;
        }
        // For multiplayer games, don't set fake defaults - let enrichment handle it
        
        return {
            overallMinPlayers: 1,
            overallMaxPlayers,
            supportsOnline: hasOnline,
            supportsLocal: hasLocal,
            // Don't set specific player counts - RAWG doesn't provide this data
            // IGDB should be used for accurate counts
            onlineMaxPlayers: undefined,
            localMaxPlayers: undefined,
        };
    }
}
