/**
 * Board Game Atlas Metadata Provider
 * Fetches board game metadata from Board Game Atlas API
 * 
 * Uses the Board Game Atlas API:
 * - https://api.boardgameatlas.com/api/search
 * 
 * Requires a free API key from: https://www.boardgameatlas.com/api/docs
 * Configure via BOARD_GAME_ATLAS_CLIENT_ID setting
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {truncateText} from '../../lib/htmlUtils';
import settings from '../../settings';

const BGA_API_BASE = 'https://api.boardgameatlas.com/api';

// Rate limiting - 100 requests per minute
const RATE_LIMIT_MS = 600;
let lastRequestTime = 0;

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

const BGA_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'boardgameatlas',
    name: 'Board Game Atlas',
    description: 'Fetch board game metadata from Board Game Atlas. Reliable player count data for board games.',
    version: '1.0.0',
    requiresApiKey: true,
    gameUrlPattern: 'https://www.boardgameatlas.com/game/{id}',
};

interface BgaGame {
    id: string;
    name: string;
    description_preview?: string;
    description?: string;
    image_url?: string;
    thumb_url?: string;
    min_players?: number;
    max_players?: number;
    year_published?: number;
    primary_publisher?: {name: string};
    primary_designer?: {name: string};
    publishers?: Array<{name: string}>;
    designers?: Array<{name: string}>;
    categories?: Array<{name: string}>;
    mechanics?: Array<{name: string}>;
    average_user_rating?: number;
    num_user_ratings?: number;
}

interface BgaSearchResponse {
    games: BgaGame[];
    count?: number;
}

export class BoardGameAtlasMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(BGA_METADATA_MANIFEST);
    }

    /**
     * Get API key from settings or environment
     */
    private getApiKey(): string | undefined {
        return settings.value.boardGameAtlasClientId || process.env.BOARD_GAME_ATLAS_CLIENT_ID;
    }

    /**
     * Rate limiting helper
     */
    private async rateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < RATE_LIMIT_MS) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
        }
        lastRequestTime = Date.now();
    }

    /**
     * Search for games on Board Game Atlas
     */
    async searchGames(query: string, limit = 10, apiKey?: string): Promise<MetadataSearchResult[]> {
        const clientId = apiKey || this.getApiKey();
        if (!clientId) {
            console.warn('Board Game Atlas: No API key configured');
            return [];
        }

        if (!query || query.trim().length < 2) {
            return [];
        }

        await this.rateLimit();

        const params = new URLSearchParams({
            client_id: clientId,
            name: query.trim(),
            limit: String(limit),
            fuzzy_match: 'true',
        });

        try {
            const response = await fetch(`${BGA_API_BASE}/search?${params.toString()}`);

            if (!response.ok) {
                console.warn(`Board Game Atlas search error: ${response.status}`);
                return [];
            }

            const data = await response.json() as BgaSearchResponse;

            return (data.games || []).map((game: BgaGame) => ({
                externalId: game.id,
                name: game.name,
                releaseDate: game.year_published?.toString(),
                coverImageUrl: game.thumb_url || game.image_url,
                provider: 'boardgameatlas',
            }));
        } catch (error) {
            console.warn('Board Game Atlas search error:', error);
            return [];
        }
    }

    /**
     * Get detailed metadata for a game
     */
    async getGameMetadata(externalId: string, apiKey?: string): Promise<GameMetadata | null> {
        const clientId = apiKey || this.getApiKey();
        if (!clientId) {
            console.warn('Board Game Atlas: No API key configured');
            return null;
        }

        if (!externalId) {
            return null;
        }

        await this.rateLimit();

        const params = new URLSearchParams({
            client_id: clientId,
            ids: externalId,
        });

        try {
            const response = await fetch(`${BGA_API_BASE}/search?${params.toString()}`);

            if (!response.ok) {
                console.warn(`Board Game Atlas get error: ${response.status}`);
                return null;
            }

            const data = await response.json() as BgaSearchResponse;

            if (!data.games || data.games.length === 0) {
                return null;
            }

            return this.parseGameData(data.games[0]);
        } catch (error) {
            console.warn('Board Game Atlas get error:', error);
            return null;
        }
    }

    /**
     * Search for a game by name and return the best match with full metadata
     */
    async findByGameName(name: string, apiKey?: string): Promise<GameMetadata | null> {
        const searchResults = await this.searchGames(name, 5, apiKey);
        if (searchResults.length === 0) {
            return null;
        }

        // Find best match by name similarity
        const normalizedQuery = name.toLowerCase().trim();
        const bestMatch = searchResults.find(
            r => r.name.toLowerCase().trim() === normalizedQuery
        ) || searchResults[0];

        return this.getGameMetadata(bestMatch.externalId, apiKey);
    }

    /**
     * Get game URL
     */
    getGameUrl(externalId: string): string {
        return `https://www.boardgameatlas.com/game/${externalId}`;
    }

    /**
     * Parse BGA API response to GameMetadata
     */
    private parseGameData(game: BgaGame): GameMetadata {
        const description = game.description_preview || game.description || '';
        
        // Extract designers
        const developers: string[] = [];
        if (game.primary_designer?.name) {
            developers.push(game.primary_designer.name);
        }
        if (game.designers) {
            for (const d of game.designers) {
                if (!developers.includes(d.name)) {
                    developers.push(d.name);
                }
            }
        }

        // Extract publishers
        const publishers: string[] = [];
        if (game.primary_publisher?.name) {
            publishers.push(game.primary_publisher.name);
        }
        if (game.publishers) {
            for (const p of game.publishers) {
                if (!publishers.includes(p.name)) {
                    publishers.push(p.name);
                }
            }
        }

        // Extract genres from categories and mechanics
        const genres: string[] = [];
        if (game.categories) {
            genres.push(...game.categories.map(c => c.name));
        }
        if (game.mechanics) {
            genres.push(...game.mechanics.slice(0, 3).map(m => m.name));
        }

        // Calculate rating out of 100
        const rating = game.average_user_rating 
            ? Math.round(game.average_user_rating * 20) // BGA uses 0-5 scale
            : undefined;

        const minPlayers = game.min_players || 1;
        const maxPlayers = game.max_players || minPlayers;

        return {
            externalId: game.id,
            name: game.name,
            description: description || undefined,
            shortDescription: description ? truncateText(description, MAX_SHORT_DESCRIPTION_LENGTH) : undefined,
            coverImageUrl: game.image_url || game.thumb_url,
            headerImageUrl: game.image_url,
            genres: genres.length > 0 ? genres : ['Board Game'],
            developers: developers.slice(0, 5),
            publishers: publishers.slice(0, 3),
            releaseDate: game.year_published?.toString(),
            platforms: ['Physical'], // Board Game Atlas focuses on physical editions
            metacriticScore: rating,
            playerInfo: {
                overallMinPlayers: minPlayers,
                overallMaxPlayers: maxPlayers,
                supportsPhysical: true,
                supportsLocal: maxPlayers > 1,
                supportsOnline: false, // Board Game Atlas data is for physical play; digital adaptations tracked separately
                physicalMaxPlayers: maxPlayers,
                localMaxPlayers: maxPlayers,
            },
            rawPayload: game as unknown as object,
        };
    }
}
