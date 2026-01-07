/**
 * Metadata Provider Plugin Contract
 * Defines the interface for game metadata providers (Steam, IGDB, etc.)
 * 
 * Metadata providers can fetch game information like:
 * - Game details (name, description, genres, release date)
 * - Cover images and screenshots
 * - Developer and publisher information
 * - Player counts and multiplayer support
 */

/**
 * Game metadata returned by providers
 */
export interface GameMetadata {
    /** External ID from the provider (e.g., Steam AppID) */
    externalId: string;
    
    /** Game name */
    name: string;
    
    /** Game description/summary */
    description?: string;
    
    /** Short description */
    shortDescription?: string;
    
    /** Cover image URL */
    coverImageUrl?: string;
    
    /** Header/banner image URL */
    headerImageUrl?: string;
    
    /** Screenshot URLs */
    screenshots?: string[];
    
    /** Video trailer URLs */
    videos?: string[];
    
    /** Game genres (e.g., "Action", "RPG") */
    genres?: string[];
    
    /** Game categories (e.g., "Single-player", "Multi-player") */
    categories?: string[];
    
    /** Developer name(s) */
    developers?: string[];
    
    /** Publisher name(s) */
    publishers?: string[];
    
    /** Release date (ISO format or human-readable) */
    releaseDate?: string;
    
    /** Supported platforms */
    platforms?: string[];
    
    /** Metacritic score (0-100) */
    metacriticScore?: number;
    
    /** Metacritic URL */
    metacriticUrl?: string;
    
    /** Recommended age rating */
    ageRating?: string;
    
    /** Player count information */
    playerInfo?: {
        overallMinPlayers?: number;
        overallMaxPlayers?: number;
        supportsOnline?: boolean;
        supportsLocal?: boolean;
        supportsPhysical?: boolean;
        onlineMaxPlayers?: number;
        localMaxPlayers?: number;
        physicalMaxPlayers?: number;
    };
    
    /** Price information */
    priceInfo?: {
        currency?: string;
        initialPrice?: number;
        finalPrice?: number;
        discountPercent?: number;
        isFree?: boolean;
    };
    
    /** Raw provider response for debugging/extension */
    rawPayload?: object;
}

/**
 * Search result from metadata provider
 */
export interface MetadataSearchResult {
    externalId: string;
    name: string;
    releaseDate?: string;
    coverImageUrl?: string;
    provider: string;
}

/**
 * Metadata provider manifest
 */
export interface MetadataProviderManifest {
    /** Unique provider ID (e.g., "steam", "igdb") */
    id: string;
    
    /** Display name */
    name: string;
    
    /** Provider description */
    description: string;
    
    /** Provider version */
    version: string;
    
    /** Whether this provider requires an API key */
    requiresApiKey: boolean;
    
    /** Base URL for this provider's game pages (for linking) */
    gameUrlPattern?: string;
}

/**
 * Metadata provider interface that all providers must implement
 */
export interface MetadataProvider {
    /**
     * Get the provider manifest
     */
    getManifest(): MetadataProviderManifest;
    
    /**
     * Search for games by name
     * @param query Search query
     * @param limit Maximum number of results
     * @param apiKey Optional user-provided API key
     */
    searchGames(query: string, limit?: number, apiKey?: string): Promise<MetadataSearchResult[]>;
    
    /**
     * Get detailed metadata for a game by its external ID
     * @param externalId Provider-specific game ID
     * @param apiKey Optional user-provided API key
     */
    getGameMetadata(externalId: string, apiKey?: string): Promise<GameMetadata | null>;
    
    /**
     * Get metadata for multiple games by their external IDs
     * @param externalIds Array of provider-specific game IDs
     * @param apiKey Optional user-provided API key
     */
    getGamesMetadata(externalIds: string[], apiKey?: string): Promise<GameMetadata[]>;
    
    /**
     * Get the URL for a game on this provider's website
     * @param externalId Provider-specific game ID
     */
    getGameUrl(externalId: string): string;
}

/**
 * Base metadata provider class with common functionality
 */
export abstract class BaseMetadataProvider implements MetadataProvider {
    protected manifest: MetadataProviderManifest;
    
    constructor(manifest: MetadataProviderManifest) {
        this.manifest = manifest;
    }
    
    getManifest(): MetadataProviderManifest {
        return this.manifest;
    }
    
    abstract searchGames(query: string, limit?: number, apiKey?: string): Promise<MetadataSearchResult[]>;
    
    abstract getGameMetadata(externalId: string, apiKey?: string): Promise<GameMetadata | null>;
    
    async getGamesMetadata(externalIds: string[], apiKey?: string): Promise<GameMetadata[]> {
        // Default implementation: fetch one by one
        const results: GameMetadata[] = [];
        for (const id of externalIds) {
            const metadata = await this.getGameMetadata(id, apiKey);
            if (metadata) {
                results.push(metadata);
            }
        }
        return results;
    }
    
    abstract getGameUrl(externalId: string): string;
}
