/**
 * Metadata Fetcher Module
 * 
 * Centralized metadata fetching with rate limiting for all metadata providers.
 * This module handles:
 * - Rate limiting per provider
 * - Provider fallback chains
 * - Two-phase metadata enrichment (general info + player counts)
 * - Error tracking and recovery
 */

import {ExternalGame} from '../connectors/ConnectorInterface';
import {metadataProviderRegistry} from '../metadata/MetadataProviderRegistry';
import {
    GameMetadata,
    mergePlayerCounts,
    MetadataProvider,
    MetadataRateLimitError
} from '../metadata/MetadataProviderInterface';
import settings from '../../settings';

/**
 * Centralized metadata fetcher with rate limiting
 * Handles rate limiting for all metadata providers uniformly
 */
export class MetadataFetcher {
    private rateLimitedProviders = new Set<string>();
    private lastRequestTimeByProvider = new Map<string, number>();
    private consecutiveErrorsByProvider = new Map<string, number>();
    
    /**
     * Apply rate limiting for a provider
     * Uses the provider's rate limit config
     */
    private async applyRateLimit(provider: MetadataProvider): Promise<void> {
        const config = provider.getRateLimitConfig();
        const providerId = provider.getManifest().id;
        const lastRequest = this.lastRequestTimeByProvider.get(providerId) || 0;
        const elapsed = Date.now() - lastRequest;
        
        if (elapsed < config.requestDelayMs) {
            await new Promise(resolve => setTimeout(resolve, config.requestDelayMs - elapsed));
        }
        
        this.lastRequestTimeByProvider.set(providerId, Date.now());
    }
    
    /**
     * Check if provider is rate limited
     */
    isProviderRateLimited(providerId: string): boolean {
        return this.rateLimitedProviders.has(providerId);
    }
    
    /**
     * Mark provider as rate limited (fallback to next provider)
     */
    markProviderRateLimited(providerId: string): void {
        this.rateLimitedProviders.add(providerId);
        console.log(`Provider ${providerId} marked as rate limited, will fallback to alternatives`);
    }
    
    /**
     * Track consecutive errors for a provider
     */
    trackError(providerId: string): boolean {
        const current = this.consecutiveErrorsByProvider.get(providerId) || 0;
        this.consecutiveErrorsByProvider.set(providerId, current + 1);
        const provider = metadataProviderRegistry.getById(providerId);
        const maxErrors = provider?.getRateLimitConfig().maxConsecutiveErrors || 5;
        return current + 1 >= maxErrors;
    }
    
    /**
     * Reset error count for a provider (on success)
     */
    resetErrors(providerId: string): void {
        this.consecutiveErrorsByProvider.set(providerId, 0);
    }
    
    /**
     * Fetch metadata for games with centralized rate limiting
     * Uses provider capabilities to determine which provider to use for what data
     * 
     * Two runs:
     * 1. General metadata (descriptions, images, etc.) from primary provider
     * 2. Player counts from provider with hasAccuratePlayerCounts capability
     */
    async fetchMetadataForGames(
        games: ExternalGame[],
        provider: string
    ): Promise<Map<string, GameMetadata>> {
        const metadataCache = new Map<string, GameMetadata>();
        
        // Run 1: General metadata from primary provider (matching game source)
        // With fallback to RAWG if primary fails
        await this.fetchGeneralMetadataWithFallback(games, provider, metadataCache);
        
        // Run 2: Player counts from provider with accurate player count capability
        // With fallback to RAWG if IGDB fails
        await this.fetchPlayerCountsWithFallback(games, metadataCache);
        
        console.log(`Total metadata fetched: ${metadataCache.size}/${games.length} games`);
        return metadataCache;
    }
    
    /**
     * Run 1: Fetch general metadata from the primary provider with fallback
     * Uses registry to find fallback providers by capability (no hardcoded provider references)
     */
    private async fetchGeneralMetadataWithFallback(
        games: ExternalGame[],
        provider: string,
        metadataCache: Map<string, GameMetadata>
    ): Promise<void> {
        // Try primary provider first
        const primaryProvider = metadataProviderRegistry.getById(provider);
        if (primaryProvider && !this.isProviderRateLimited(provider)) {
            await this.fetchGeneralMetadataFromProvider(games, primaryProvider, metadataCache);
        }
        
        // If we didn't get all games, try fallback providers with search capability
        let gamesStillNeeding = games.filter(g => !metadataCache.has(g.externalGameId));
        if (gamesStillNeeding.length > 0) {
            // Get all providers that support search (for fallback by name)
            const fallbackProviders = metadataProviderRegistry.getAllByCapability('supportsSearch');
            
            for (const fallbackProvider of fallbackProviders) {
                const fallbackId = fallbackProvider.getManifest().id;
                
                // Skip the primary provider (already tried)
                if (fallbackId === provider) continue;
                
                // Skip rate-limited providers
                if (this.isProviderRateLimited(fallbackId)) continue;
                
                console.log(`Falling back to ${fallbackId} for ${gamesStillNeeding.length} games without metadata`);
                await this.fetchGeneralMetadataFromProviderByName(gamesStillNeeding, fallbackProvider, metadataCache);
                
                // Update remaining games
                gamesStillNeeding = games.filter(g => !metadataCache.has(g.externalGameId));
                if (gamesStillNeeding.length === 0) break;
            }
        }
    }
    
    /**
     * Fetch general metadata from a specific provider
     */
    private async fetchGeneralMetadataFromProvider(
        games: ExternalGame[],
        provider: MetadataProvider,
        metadataCache: Map<string, GameMetadata>
    ): Promise<void> {
        const providerId = provider.getManifest().id;
        const config = provider.getRateLimitConfig();
        const externalIds = games.map(g => g.externalGameId).slice(0, config.maxGamesPerSync);
        
        console.log(`Fetching general metadata from ${providerId} for ${externalIds.length} games`);
        
        try {
            for (let i = 0; i < externalIds.length; i += config.maxBatchSize) {
                const batch = externalIds.slice(i, i + config.maxBatchSize);
                
                for (const id of batch) {
                    await this.applyRateLimit(provider);
                    
                    try {
                        const meta = await provider.getGameMetadata(id);
                        if (meta) {
                            metadataCache.set(id, meta);
                            this.resetErrors(providerId);
                        }
                    } catch (error) {
                        if (this.handleProviderError(error, providerId)) {
                            return; // Stop if rate limited or too many errors
                        }
                    }
                }
                
                if (i + config.maxBatchSize < externalIds.length) {
                    await new Promise(resolve => setTimeout(resolve, config.batchDelayMs));
                }
            }
            
            console.log(`General metadata from ${providerId}: ${metadataCache.size}/${externalIds.length} games`);
        } catch (error) {
            console.warn(`Provider ${providerId} failed:`, error);
        }
    }
    
    /**
     * Fetch general metadata from a provider by searching by game name
     * Used for fallback providers that don't have the same IDs
     */
    private async fetchGeneralMetadataFromProviderByName(
        games: ExternalGame[],
        provider: MetadataProvider,
        metadataCache: Map<string, GameMetadata>
    ): Promise<void> {
        const providerId = provider.getManifest().id;
        const config = provider.getRateLimitConfig();
        
        console.log(`Searching ${providerId} by name for ${games.length} games`);
        
        for (const game of games.slice(0, config.maxGamesPerSync)) {
            await this.applyRateLimit(provider);
            
            try {
                const searchResults = await provider.searchGames(game.name, 1);
                if (searchResults.length > 0) {
                    const meta = await provider.getGameMetadata(searchResults[0].externalId);
                    if (meta) {
                        // Map to the original game's externalGameId
                        metadataCache.set(game.externalGameId, {
                            ...meta,
                            externalId: game.externalGameId,
                        });
                        this.resetErrors(providerId);
                    }
                }
            } catch (error) {
                if (this.handleProviderError(error, providerId)) {
                    return;
                }
            }
        }
    }
    
    /**
     * Handle provider error (rate limit or consecutive errors)
     * @returns true if we should stop using this provider
     */
    private handleProviderError(error: unknown, providerId: string): boolean {
        // Check for structured rate limit error first
        if (error instanceof MetadataRateLimitError) {
            this.markProviderRateLimited(error.providerId);
            console.log(`${error.providerId} rate limited (structured error), stopping and using fallback`);
            return true;
        }
        
        // Fallback: check for rate limit in error message (legacy support)
        const isRateLimit = error instanceof Error && (
            error.message.includes('429') ||
            error.message.includes('rate') ||
            error.message.includes('Too Many')
        );
        
        if (isRateLimit) {
            this.markProviderRateLimited(providerId);
            console.log(`${providerId} rate limited, stopping and using fallback`);
            return true;
        }
        
        if (this.trackError(providerId)) {
            console.log(`${providerId}: Too many consecutive errors, stopping`);
            return true;
        }
        
        return false;
    }
    
    /**
     * Run 2: Fetch player counts with fallback chain
     * Uses registry to find providers with accurate player count capability (no hardcoded provider references)
     */
    private async fetchPlayerCountsWithFallback(
        games: ExternalGame[],
        metadataCache: Map<string, GameMetadata>
    ): Promise<void> {
        // Filter to games that need player count enrichment
        let gamesNeedingPlayerCounts = games.filter(game => {
            const cachedMeta = metadataCache.get(game.externalGameId);
            return !cachedMeta || (
                cachedMeta.playerInfo?.onlineMaxPlayers === undefined ||
                cachedMeta.playerInfo?.localMaxPlayers === undefined
            );
        });
        
        if (gamesNeedingPlayerCounts.length === 0) {
            return;
        }
        
        // Get all providers with accurate player count capability (in order of preference)
        const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
        
        // Also include providers with search capability as fallback
        const searchProviders = metadataProviderRegistry.getAllByCapability('supportsSearch');
        
        // Combine lists, removing duplicates (player count providers first)
        const allProviders: MetadataProvider[] = [...playerCountProviders];
        for (const provider of searchProviders) {
            if (!allProviders.find(p => p.getManifest().id === provider.getManifest().id)) {
                allProviders.push(provider);
            }
        }
        
        // Try each provider in sequence until no games remain
        for (const provider of allProviders) {
            const providerId = provider.getManifest().id;
            
            if (this.isProviderRateLimited(providerId)) continue;
            
            gamesNeedingPlayerCounts = await this.fetchPlayerCountsFromProviderInstance(
                gamesNeedingPlayerCounts,
                metadataCache,
                provider
            );
            
            if (gamesNeedingPlayerCounts.length === 0) break;
        }
    }
    
    /**
     * Fetch player counts from a specific provider instance
     * @returns Games that still need player counts (provider failed or didn't have data)
     */
    private async fetchPlayerCountsFromProviderInstance(
        games: ExternalGame[],
        metadataCache: Map<string, GameMetadata>,
        provider: MetadataProvider
    ): Promise<ExternalGame[]> {
        const providerId = provider.getManifest().id;
        
        if (this.isProviderRateLimited(providerId)) {
            return games;
        }
        
        const config = provider.getRateLimitConfig();
        const gamesProcessed: ExternalGame[] = [];
        
        console.log(`Fetching player counts from ${providerId} for ${games.length} games`);
        
        let queriesCompleted = 0;
        const timeoutMs = settings.value.igdbQueryTimeoutMs || 300000;
        const startTime = Date.now();
        
        for (const game of games) {
            if (Date.now() - startTime >= timeoutMs) {
                console.log(`${providerId} time limit reached, completed ${queriesCompleted} queries`);
                break;
            }
            
            await this.applyRateLimit(provider);
            
            try {
                const searchResults = await provider.searchGames(game.name, 1);
                if (searchResults.length > 0) {
                    const playerMeta = await provider.getGameMetadata(searchResults[0].externalId);
                    if (playerMeta?.playerInfo) {
                        const existingMeta = metadataCache.get(game.externalGameId);
                        if (existingMeta) {
                            metadataCache.set(game.externalGameId, {
                                ...existingMeta,
                                playerInfo: mergePlayerCounts(existingMeta.playerInfo, playerMeta.playerInfo),
                            });
                        } else {
                            metadataCache.set(game.externalGameId, {
                                ...playerMeta,
                                externalId: game.externalGameId,
                            });
                        }
                        gamesProcessed.push(game);
                    }
                }
                queriesCompleted++;
                this.resetErrors(providerId);
            } catch (error) {
                if (this.handleProviderError(error, providerId)) {
                    break;
                }
            }
        }
        
        console.log(`Player count enrichment from ${providerId}: ${queriesCompleted} queries, ${gamesProcessed.length} enriched`);
        
        // Return games that weren't successfully processed
        return games.filter(g => !gamesProcessed.includes(g));
    }
}

// Singleton instance for metadata fetching
let metadataFetcherInstance: MetadataFetcher | null = null;

/**
 * Get the singleton MetadataFetcher instance
 */
export function getMetadataFetcher(): MetadataFetcher {
    if (!metadataFetcherInstance) {
        metadataFetcherInstance = new MetadataFetcher();
    }
    return metadataFetcherInstance;
}
