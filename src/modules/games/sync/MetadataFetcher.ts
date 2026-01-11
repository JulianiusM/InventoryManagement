/**
 * Metadata Fetcher Module
 * 
 * THE SINGLE CENTRALIZED IMPLEMENTATION for all metadata operations.
 * 
 * This module handles:
 * - Rate limiting per provider
 * - Provider fallback chains
 * - Two-phase metadata enrichment (general info + player counts)
 * - Error tracking and recovery
 * - Manual metadata fetch/apply (single game operations)
 * - Batch metadata fetch (sync pipeline)
 * - ExternalGame enrichment
 * 
 * ALL metadata operations MUST go through this module to ensure:
 * - DRY principle (no duplicate implementations)
 * - Consistent behavior across manual and sync operations
 * - Proper rate limiting and error handling
 */

import {ExternalGame} from '../connectors/ConnectorInterface';
import {metadataProviderRegistry} from '../metadata/MetadataProviderRegistry';
import {
    GameMetadata,
    mergePlayerCounts,
    MetadataProvider,
    MetadataRateLimitError,
    MetadataSearchResult,
} from '../metadata/MetadataProviderInterface';
import {normalizeDescription} from '../../lib/htmlUtils';
import * as gameTitleService from '../../database/services/GameTitleService';
import {GameTitle} from '../../database/entities/gameTitle/GameTitle';
import {GameType} from '../../../types/InventoryEnums';
import settings from '../../settings';

// Minimum length for a description to be considered valid (avoid placeholders)
// Descriptions shorter than this are considered too short to be meaningful
export const MIN_VALID_DESCRIPTION_LENGTH = 50;

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
    
    // ============ SINGLE GAME METADATA OPERATIONS ============
    // These functions are used for manual metadata operations (title detail page)
    
    /**
     * Fetch metadata for a single game title
     * Uses appropriate metadata provider based on game type
     * 
     * Strategy:
     * 1. Get basic metadata from primary provider
     * 2. If multiplayer but missing player counts, enrich from hasAccuratePlayerCounts providers
     * 
     * @param title The game title to fetch metadata for
     * @param searchQuery Optional search query (defaults to title name)
     * @returns Metadata fetch result with GameMetadata if found
     */
    async fetchMetadataForTitle(
        title: GameTitle,
        searchQuery?: string
    ): Promise<MetadataFetchResult> {
        // Get providers based on game type
        const providers = metadataProviderRegistry.getByGameType(title.type);
        if (providers.length === 0) {
            return {updated: false, message: 'No metadata providers available for this game type'};
        }
        
        // Search query defaults to game name
        const query = searchQuery?.trim() || title.name;
        
        // Track what we found and from where
        let foundMetadata: GameMetadata | null = null;
        let primaryProviderName = '';
        
        // Step 1: Get basic metadata from primary providers
        for (const provider of providers) {
            try {
                // Apply rate limiting
                await this.applyRateLimit(provider);
                
                // Search for the game
                const searchResults = await provider.searchGames(query, 5);
                if (searchResults.length === 0) continue;
                
                // Get full metadata for best match
                await this.applyRateLimit(provider);
                const metadata = await provider.getGameMetadata(searchResults[0].externalId);
                if (!metadata) continue;
                
                foundMetadata = metadata;
                primaryProviderName = provider.getManifest().name;
                this.resetErrors(provider.getManifest().id);
                break; // Found metadata, stop searching
            } catch (error) {
                const providerId = provider.getManifest().id;
                console.warn(`Metadata fetch from ${providerId} failed:`, error);
                this.handleProviderError(error, providerId);
                // Continue to next provider
            }
        }
        
        if (!foundMetadata) {
            return {updated: false, message: 'No metadata found from any provider'};
        }
        
        // Step 2: If game supports multiplayer but lacks specific player counts, enrich from player count providers
        const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
        const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                                  foundMetadata.playerInfo?.localMaxPlayers !== undefined;
        
        if (hasMultiplayer && !hasSpecificCounts) {
            // Use capability-based lookup for player count enrichment
            const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
            for (const provider of playerCountProviders) {
                const providerId = provider.getManifest().id;
                if (this.isProviderRateLimited(providerId)) continue;
                
                try {
                    const providerName = provider.getManifest().name;
                    console.log(`Enriching "${title.name}" with player counts from ${providerName}`);
                    await this.applyRateLimit(provider);
                    const results = await provider.searchGames(query, 1);
                    if (results.length > 0) {
                        await this.applyRateLimit(provider);
                        const playerMeta = await provider.getGameMetadata(results[0].externalId);
                        if (playerMeta?.playerInfo) {
                            // Merge player counts into metadata using utility
                            foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, playerMeta.playerInfo);
                            primaryProviderName += ` + ${providerName}`;
                            this.resetErrors(providerId);
                            break; // Stop after first successful enrichment
                        }
                    }
                } catch (error) {
                    console.warn(`${provider.getManifest().name} enrichment failed:`, error);
                    this.handleProviderError(error, provider.getManifest().id);
                    // Continue with next provider
                }
            }
        }
        
        return {
            updated: true,
            message: `Found metadata from ${primaryProviderName}`,
            metadata: foundMetadata,
            providerName: primaryProviderName,
        };
    }
    
    /**
     * Search for metadata options from all applicable providers
     * Returns a deduplicated, sorted list of potential matches
     * 
     * @param title The game title to search for
     * @param searchQuery Optional search query (defaults to title name)
     * @returns List of metadata search results
     */
    async searchMetadataOptions(
        title: GameTitle,
        searchQuery?: string
    ): Promise<MetadataSearchResult[]> {
        // Get providers based on game type
        const providers = metadataProviderRegistry.getByGameType(title.type);
        if (providers.length === 0) {
            return [];
        }
        
        // Search query defaults to game name
        const query = searchQuery?.trim() || title.name;
        
        // Collect all search results from all providers
        const allResults: MetadataSearchResult[] = [];
        
        for (const provider of providers) {
            const providerId = provider.getManifest().id;
            if (this.isProviderRateLimited(providerId)) continue;
            
            try {
                await this.applyRateLimit(provider);
                const results = await provider.searchGames(query, 10);
                allResults.push(...results);
                this.resetErrors(providerId);
            } catch (error) {
                console.warn(`Metadata search from ${providerId} failed:`, error);
                this.handleProviderError(error, providerId);
            }
        }
        
        // Deduplicate by name (keep first occurrence of each unique name)
        const seenNames = new Set<string>();
        const uniqueResults = allResults.filter(r => {
            const key = r.name.toLowerCase().trim();
            if (seenNames.has(key)) return false;
            seenNames.add(key);
            return true;
        });
        
        // Sort by relevance: exact match first, then prefix match, then others
        const normalizedQuery = query.toLowerCase().trim();
        uniqueResults.sort((a, b) => {
            const aName = a.name.toLowerCase().trim();
            const bName = b.name.toLowerCase().trim();
            
            // Exact match priority
            const aExact = aName === normalizedQuery ? 0 : 1;
            const bExact = bName === normalizedQuery ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            
            // Prefix match priority
            const aPrefix = aName.startsWith(normalizedQuery) ? 0 : 1;
            const bPrefix = bName.startsWith(normalizedQuery) ? 0 : 1;
            if (aPrefix !== bPrefix) return aPrefix - bPrefix;
            
            // Shorter names preferred
            return aName.length - bName.length;
        });
        
        return uniqueResults.slice(0, 15);
    }
    
    /**
     * Fetch metadata from a specific provider and external ID
     * Used when user selects a specific search result
     * 
     * @param providerId The provider ID
     * @param externalId The external game ID on that provider
     * @returns Metadata fetch result
     */
    async fetchMetadataFromProvider(
        providerId: string,
        externalId: string
    ): Promise<MetadataFetchResult> {
        // Get the specific provider
        const provider = metadataProviderRegistry.getById(providerId);
        if (!provider) {
            return {updated: false, message: `Provider '${providerId}' not found`};
        }
        
        if (this.isProviderRateLimited(providerId)) {
            return {updated: false, message: `Provider '${providerId}' is rate limited, please try again later`};
        }
        
        const primaryProviderName = provider.getManifest().name;
        
        // Fetch full metadata
        let foundMetadata: GameMetadata | null = null;
        
        try {
            await this.applyRateLimit(provider);
            foundMetadata = await provider.getGameMetadata(externalId);
            this.resetErrors(providerId);
        } catch (error) {
            console.warn(`Metadata fetch from ${providerId} failed:`, error);
            this.handleProviderError(error, providerId);
            return {updated: false, message: `Failed to fetch metadata from ${primaryProviderName}`};
        }
        
        if (!foundMetadata) {
            return {updated: false, message: `No metadata found for ID ${externalId}`};
        }
        
        // Enrich with player count providers if needed
        const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
        const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                                  foundMetadata.playerInfo?.localMaxPlayers !== undefined;
        
        let enrichedProviderName = primaryProviderName;
        
        if (hasMultiplayer && !hasSpecificCounts) {
            // Use capability-based lookup for player count enrichment
            const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
            for (const pcProvider of playerCountProviders) {
                const pcProviderId = pcProvider.getManifest().id;
                if (this.isProviderRateLimited(pcProviderId)) continue;
                
                try {
                    await this.applyRateLimit(pcProvider);
                    const results = await pcProvider.searchGames(foundMetadata.name, 1);
                    if (results.length > 0) {
                        await this.applyRateLimit(pcProvider);
                        const playerMeta = await pcProvider.getGameMetadata(results[0].externalId);
                        if (playerMeta?.playerInfo) {
                            foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, playerMeta.playerInfo);
                            enrichedProviderName += ` + ${pcProvider.getManifest().name}`;
                            this.resetErrors(pcProviderId);
                            break; // Stop after first successful enrichment
                        }
                    }
                } catch (error) {
                    console.warn(`${pcProvider.getManifest().name} enrichment failed:`, error);
                    this.handleProviderError(error, pcProvider.getManifest().id);
                    // Continue with next provider
                }
            }
        }
        
        return {
            updated: true,
            message: `Found metadata from ${enrichedProviderName}`,
            metadata: foundMetadata,
            providerName: enrichedProviderName,
        };
    }
}

// ============ METADATA APPLICATION FUNCTIONS ============
// These are standalone functions that can be used by both the MetadataFetcher and other services

/**
 * Result of a metadata fetch operation
 */
export interface MetadataFetchResult {
    updated: boolean;
    message: string;
    metadata?: GameMetadata;
    providerName?: string;
}

/**
 * Apply GameMetadata to a GameTitle entity
 * Centralizes the logic for updating title fields from metadata
 * 
 * IMPORTANT: This function respects game type when applying supportsPhysical.
 * Video games should NOT have supportsPhysical set from metadata providers.
 * 
 * @param titleId The ID of the title to update
 * @param title The current title entity (for comparison)
 * @param metadata The metadata to apply
 * @returns Object containing the fields that were updated
 */
export async function applyMetadataToTitle(
    titleId: string,
    title: GameTitle,
    metadata: GameMetadata
): Promise<{updates: Partial<GameTitle>; fieldsUpdated: string[]}> {
    const updates: Partial<GameTitle> = {};
    
    // Apply description normalization centrally
    if (metadata.shortDescription || metadata.description) {
        const rawDescription = metadata.shortDescription || metadata.description;
        const newDescription = normalizeDescription(rawDescription);
        
        // Determine if we should update the description:
        // 1. No new description available → don't update
        // 2. No existing description → update (first time)
        // 3. Existing description is too short (placeholder) → update
        // 4. Existing description equals the game name (auto-placeholder) → update
        const hasNoDescription = !title.description;
        const hasPlaceholderDescription = title.description && title.description.length < MIN_VALID_DESCRIPTION_LENGTH;
        const hasNameAsDescription = title.description === title.name;
        
        if (newDescription && (hasNoDescription || hasPlaceholderDescription || hasNameAsDescription)) {
            updates.description = newDescription;
        }
    }
    
    // Update cover image if we found one and don't have one
    if (metadata.coverImageUrl && !title.coverImageUrl) {
        updates.coverImageUrl = metadata.coverImageUrl;
    }
    
    // Apply player info updates
    if (metadata.playerInfo) {
        applyPlayerInfoUpdates(updates, title, metadata.playerInfo);
    }
    
    const fieldsUpdated = Object.keys(updates);
    
    if (fieldsUpdated.length > 0) {
        await gameTitleService.updateGameTitle(titleId, updates);
    }
    
    return {updates, fieldsUpdated};
}

/**
 * Apply player info from metadata to updates object
 * Handles the complex logic of updating player modes and counts
 * 
 * IMPORTANT: supportsPhysical is ONLY set for board games, not video games.
 * This prevents Wikidata (which always returns supportsPhysical: true) from
 * incorrectly marking video games as physical games.
 */
function applyPlayerInfoUpdates(
    updates: Partial<GameTitle>,
    title: GameTitle,
    playerInfo: NonNullable<GameMetadata['playerInfo']>
): void {
    // Overall player counts
    if (playerInfo.overallMinPlayers) {
        updates.overallMinPlayers = playerInfo.overallMinPlayers;
    }
    if (playerInfo.overallMaxPlayers) {
        updates.overallMaxPlayers = playerInfo.overallMaxPlayers;
    }
    
    // Handle online mode - only set player counts if supportsOnline is true
    if (playerInfo.supportsOnline !== undefined) {
        updates.supportsOnline = playerInfo.supportsOnline;
        // When setting supportsOnline to false, clear the player counts
        if (!playerInfo.supportsOnline) {
            updates.onlineMinPlayers = null;
            updates.onlineMaxPlayers = null;
        }
    }
    // Only set online player counts if supportsOnline is or will be true
    const willSupportOnline = updates.supportsOnline ?? title.supportsOnline;
    if (willSupportOnline) {
        if (playerInfo.onlineMaxPlayers !== undefined && playerInfo.onlineMaxPlayers !== null) {
            updates.onlineMaxPlayers = playerInfo.onlineMaxPlayers;
        }
    }
    
    // Handle local mode - only set player counts if supportsLocal is true
    if (playerInfo.supportsLocal !== undefined) {
        updates.supportsLocal = playerInfo.supportsLocal;
        if (!playerInfo.supportsLocal) {
            updates.localMinPlayers = null;
            updates.localMaxPlayers = null;
        }
    }
    const willSupportLocal = updates.supportsLocal ?? title.supportsLocal;
    if (willSupportLocal) {
        if (playerInfo.localMaxPlayers !== undefined && playerInfo.localMaxPlayers !== null) {
            updates.localMaxPlayers = playerInfo.localMaxPlayers;
        }
    }
    
    // Handle physical mode - ONLY for board games, NOT video games
    // This prevents Wikidata from marking video games as physical games
    const isBoardGame = title.type === GameType.BOARD_GAME || 
                        title.type === GameType.CARD_GAME || 
                        title.type === GameType.TABLETOP_RPG ||
                        title.type === GameType.OTHER_PHYSICAL_GAME;
    
    if (isBoardGame && playerInfo.supportsPhysical !== undefined) {
        updates.supportsPhysical = playerInfo.supportsPhysical;
        if (!playerInfo.supportsPhysical) {
            updates.physicalMinPlayers = null;
            updates.physicalMaxPlayers = null;
        }
    }
    
    const willSupportPhysical = updates.supportsPhysical ?? title.supportsPhysical;
    if (willSupportPhysical && isBoardGame) {
        if (playerInfo.physicalMaxPlayers !== undefined && playerInfo.physicalMaxPlayers !== null) {
            updates.physicalMaxPlayers = playerInfo.physicalMaxPlayers;
        }
    }
}

/**
 * Enrich ExternalGame with metadata from providers
 * Centralized enrichment used during sync pipeline
 * 
 * IMPORTANT: This function should NOT set supportsPhysical for video games,
 * only for board games. Video games from Wikidata should be filtered out.
 * 
 * @param game The external game to enrich
 * @param metadata The metadata from a provider
 * @returns Enriched game with metadata applied
 */
export function enrichGameWithMetadata(game: ExternalGame, metadata: GameMetadata): ExternalGame {
    const enriched: ExternalGame = {...game};
    
    // Only override if not already set by connector
    // Apply normalizeDescription to ensure clean descriptions regardless of source
    if (enriched.description === undefined && metadata.description) {
        enriched.description = normalizeDescription(metadata.description);
    }
    
    if (enriched.releaseDate === undefined && metadata.releaseDate) {
        enriched.releaseDate = metadata.releaseDate;
    }
    
    if (enriched.developer === undefined && metadata.developers?.[0]) {
        enriched.developer = metadata.developers[0];
    }
    
    if (enriched.publisher === undefined && metadata.publishers?.[0]) {
        enriched.publisher = metadata.publishers[0];
    }
    
    if (enriched.genres === undefined && metadata.genres) {
        enriched.genres = metadata.genres;
    }
    
    // Enrich store URL from metadata provider if not already set
    if (enriched.storeUrl === undefined && metadata.storeUrl) {
        enriched.storeUrl = metadata.storeUrl;
    }
    
    // Enrich cover image URL from metadata provider if not already set
    if (enriched.coverImageUrl === undefined && metadata.coverImageUrl) {
        enriched.coverImageUrl = metadata.coverImageUrl;
    }
    
    // Enrich player info from metadata provider
    // IMPORTANT: For video games, we should NOT use supportsPhysical from providers like Wikidata
    // Video games should default to supportsPhysical: false
    if (metadata.playerInfo) {
        if (enriched.overallMinPlayers === undefined) {
            enriched.overallMinPlayers = metadata.playerInfo.overallMinPlayers;
        }
        if (enriched.overallMaxPlayers === undefined) {
            enriched.overallMaxPlayers = metadata.playerInfo.overallMaxPlayers;
        }
        if (enriched.supportsOnline === undefined) {
            enriched.supportsOnline = metadata.playerInfo.supportsOnline;
        }
        if (enriched.supportsLocal === undefined) {
            enriched.supportsLocal = metadata.playerInfo.supportsLocal;
        }
        if (enriched.onlineMaxPlayers === undefined) {
            enriched.onlineMaxPlayers = metadata.playerInfo.onlineMaxPlayers;
        }
        if (enriched.localMaxPlayers === undefined) {
            enriched.localMaxPlayers = metadata.playerInfo.localMaxPlayers;
        }
        // Note: supportsPhysical is intentionally NOT enriched from metadata for video games
        // Video games should not be marked as physical games
    }
    
    return enriched;
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
