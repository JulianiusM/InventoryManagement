/**
 * Metadata Provider Plugin Contract
 * Defines the interface for game metadata providers (Steam, IGDB, etc.)
 * 
 * Metadata providers can fetch game information like:
 * - Game details (name, description, genres, release date)
 * - Cover images and screenshots
 * - Developer and publisher information
 * - Player counts and multiplayer support
 * 
 * Providers should only fetch and reformat data, not handle rate limiting.
 * Rate limiting is handled by the GameSyncService using the provider's rate limit config.
 */

/**
 * Provider capabilities for feature detection
 */
export interface MetadataProviderCapabilities {
    /** Whether this provider can return accurate multiplayer player counts */
    hasAccuratePlayerCounts: boolean;
    
    /** Whether this provider can return store URLs */
    hasStoreUrls: boolean;
    
    /** Whether this provider can do batch requests (multiple IDs at once) */
    supportsBatchRequests: boolean;
    
    /** Whether this provider can search for games by name */
    supportsSearch: boolean;
    
    /** Whether this provider returns descriptions */
    hasDescriptions: boolean;
    
    /** Whether this provider returns cover images */
    hasCoverImages: boolean;
}

/**
 * Rate limit configuration for a provider
 * Used by GameSyncService to throttle requests appropriately
 */
export interface RateLimitConfig {
    /** Minimum milliseconds between individual requests */
    requestDelayMs: number;
    
    /** Maximum requests in a batch (if batching supported) */
    maxBatchSize: number;
    
    /** Milliseconds to delay between batches */
    batchDelayMs: number;
    
    /** Maximum total games to fetch in one sync operation */
    maxGamesPerSync: number;
    
    /** Milliseconds to wait before retrying after a transient error */
    retryDelayMs: number;
    
    /** Maximum consecutive errors before giving up */
    maxConsecutiveErrors: number;
}

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
    
    /** Store URL for purchasing/viewing the game */
    storeUrl?: string;
    
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
 * 
 * Providers should only fetch and reformat data, not handle rate limiting.
 * Rate limiting is handled by GameSyncService using getRateLimitConfig().
 */
export interface MetadataProvider {
    /**
     * Get the provider manifest
     */
    getManifest(): MetadataProviderManifest;
    
    /**
     * Get provider capabilities
     * Used by GameSyncService to decide which provider to use for what data
     */
    getCapabilities(): MetadataProviderCapabilities;
    
    /**
     * Get rate limit configuration
     * Used by GameSyncService to throttle requests appropriately
     */
    getRateLimitConfig(): RateLimitConfig;
    
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
 * 
 * Subclasses must implement:
 * - searchGames()
 * - getGameMetadata()
 * - getGameUrl()
 * - getCapabilities()
 * - getRateLimitConfig()
 */
export abstract class BaseMetadataProvider implements MetadataProvider {
    protected manifest: MetadataProviderManifest;
    
    constructor(manifest: MetadataProviderManifest) {
        this.manifest = manifest;
    }
    
    getManifest(): MetadataProviderManifest {
        return this.manifest;
    }
    
    abstract getCapabilities(): MetadataProviderCapabilities;
    
    abstract getRateLimitConfig(): RateLimitConfig;
    
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

/**
 * Player info type alias for convenience
 */
export type PlayerInfo = NonNullable<GameMetadata['playerInfo']>;

/**
 * Error thrown when a metadata provider hits a rate limit
 * This allows the MetadataFetcher to detect and handle rate limits properly
 */
export class MetadataRateLimitError extends Error {
    public readonly providerId: string;
    public readonly statusCode: number;
    public readonly retryAfterMs?: number;
    
    constructor(providerId: string, statusCode: number = 429, retryAfterMs?: number) {
        super(`Rate limit exceeded for ${providerId} (${statusCode})`);
        this.name = 'MetadataRateLimitError';
        this.providerId = providerId;
        this.statusCode = statusCode;
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * Error thrown when a metadata API request fails
 */
export class MetadataApiError extends Error {
    public readonly providerId: string;
    public readonly statusCode?: number;
    
    constructor(providerId: string, message: string, statusCode?: number) {
        super(`${providerId} API error: ${message}`);
        this.name = 'MetadataApiError';
        this.providerId = providerId;
        this.statusCode = statusCode;
    }
}

/**
 * Merge player counts from enrichment source into existing player info
 * Only overrides undefined values in existing info with values from enrichment
 */
export function mergePlayerCounts(
    existing: PlayerInfo | undefined,
    enrichment: PlayerInfo | undefined
): PlayerInfo | undefined {
    if (!enrichment) return existing;
    if (!existing) return enrichment;
    
    return {
        ...existing,
        overallMaxPlayers: enrichment.overallMaxPlayers ?? existing.overallMaxPlayers,
        onlineMaxPlayers: enrichment.onlineMaxPlayers ?? existing.onlineMaxPlayers,
        localMaxPlayers: enrichment.localMaxPlayers ?? existing.localMaxPlayers,
        physicalMaxPlayers: enrichment.physicalMaxPlayers ?? existing.physicalMaxPlayers,
    };
}
