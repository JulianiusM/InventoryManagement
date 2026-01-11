/**
 * Metadata Pipeline Module
 * 
 * THE SINGLE UNIFIED IMPLEMENTATION for all metadata operations.
 * 
 * This module implements a composable pipeline with modular steps:
 * 
 * CORE STEPS (reusable building blocks):
 * 1. searchProvider() - Search a provider for a game name
 * 2. fetchFromProvider() - Fetch full metadata from a provider given an ID
 * 3. enrichPlayerCounts() - Fallback chain for player count enrichment
 * 4. applyToTitle() - Apply metadata to a GameTitle entity (includes normalization)
 * 
 * HIGH-LEVEL OPERATIONS (compose the steps):
 * - processGame() - Process a single game through the full pipeline
 * - processGameBatch() - Process multiple games (calls processGame for each)
 * - searchOptions() - Search for metadata options from all providers
 * 
 * ALL metadata operations MUST use this pipeline to ensure:
 * - DRY principle (ONE implementation, not separate paths)
 * - Consistent behavior across manual and sync operations
 * - Proper rate limiting and error handling
 * 
 * Architecture:
 * - MetadataFetcher class handles rate limiting and provider management
 * - Core steps are methods on MetadataFetcher
 * - High-level operations compose the steps
 * - Both batch sync and manual operations use the same core steps
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

/**
 * Validate player count: must be a positive finite integer
 * Used throughout the pipeline to reject invalid values (0, negative, NaN, Infinity)
 */
export function isValidPlayerCount(count: number | undefined | null): count is number {
    return count !== undefined && count !== null && Number.isFinite(count) && count > 0;
}

/**
 * Result of a metadata fetch/search operation
 */
export interface MetadataFetchResult {
    updated: boolean;
    message: string;
    metadata?: GameMetadata;
    providerName?: string;
}

/**
 * Parameters for processing a single game through the pipeline
 */
interface GameProcessingParams {
    /** Game name to search for (required unless providerExternalId is provided) */
    name?: string;
    /** External ID (for mapping results back) */
    externalId: string;
    /** Optional: specific provider to use */
    providerId?: string;
    /** Optional: specific external ID on provider (skip search, name not required) */
    providerExternalId?: string;
    /** Game type for provider selection */
    gameType?: GameType;
}

/**
 * Centralized Metadata Pipeline
 * 
 * Provides a unified implementation for all metadata operations:
 * - Single game processing (manual)
 * - Batch game processing (sync)
 * - Provider search
 * - Metadata application
 * 
 * The key insight is that batch processing is just multiple single-game
 * operations with shared rate limiting state.
 */
export class MetadataPipeline {
    // Rate limiting state
    private rateLimitedProviders = new Set<string>();
    private lastRequestTimeByProvider = new Map<string, number>();
    private consecutiveErrorsByProvider = new Map<string, number>();
    
    // ============ CORE STEP 1: Rate Limiting ============
    
    /**
     * Apply rate limiting for a provider
     */
    async applyRateLimit(provider: MetadataProvider): Promise<void> {
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
     * Mark provider as rate limited
     */
    markProviderRateLimited(providerId: string): void {
        this.rateLimitedProviders.add(providerId);
        console.log(`Provider ${providerId} marked as rate limited`);
    }
    
    /**
     * Track consecutive errors for a provider
     * @returns true if max errors reached
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
     * Handle provider error (rate limit or consecutive errors)
     * @returns true if we should stop using this provider
     */
    handleProviderError(error: unknown, providerId: string): boolean {
        if (error instanceof MetadataRateLimitError) {
            this.markProviderRateLimited(error.providerId);
            return true;
        }
        
        const isRateLimit = error instanceof Error && (
            error.message.includes('429') ||
            error.message.includes('rate') ||
            error.message.includes('Too Many')
        );
        
        if (isRateLimit) {
            this.markProviderRateLimited(providerId);
            return true;
        }
        
        return this.trackError(providerId);
    }
    
    // ============ CORE STEP 2: Search Provider ============
    
    /**
     * Search a provider for a game by name
     * This is a CORE STEP used by both manual and batch operations
     */
    async searchProvider(
        provider: MetadataProvider,
        gameName: string,
        limit: number = 5
    ): Promise<MetadataSearchResult[]> {
        const providerId = provider.getManifest().id;
        
        if (this.isProviderRateLimited(providerId)) {
            return [];
        }
        
        try {
            await this.applyRateLimit(provider);
            const results = await provider.searchGames(gameName, limit);
            this.resetErrors(providerId);
            return results;
        } catch (error) {
            console.warn(`Search on ${providerId} failed:`, error);
            this.handleProviderError(error, providerId);
            return [];
        }
    }
    
    // ============ CORE STEP 3: Fetch from Provider ============
    
    /**
     * Fetch full metadata from a provider given an external ID
     * This is a CORE STEP used by both manual and batch operations
     */
    async fetchFromProvider(
        provider: MetadataProvider,
        externalId: string
    ): Promise<GameMetadata | null> {
        const providerId = provider.getManifest().id;
        
        if (this.isProviderRateLimited(providerId)) {
            return null;
        }
        
        try {
            await this.applyRateLimit(provider);
            const metadata = await provider.getGameMetadata(externalId);
            this.resetErrors(providerId);
            return metadata;
        } catch (error) {
            console.warn(`Fetch from ${providerId} failed:`, error);
            this.handleProviderError(error, providerId);
            return null;
        }
    }
    
    // ============ CORE STEP 4: Enrich Player Counts ============
    
    /**
     * Enrich metadata with player counts from providers that have accurate data
     * This is a CORE STEP used by both manual and batch operations
     * 
     * Fallback chain: tries each hasAccuratePlayerCounts provider until success
     */
    async enrichPlayerCounts(
        gameName: string,
        metadata: GameMetadata
    ): Promise<GameMetadata> {
        // Check if we already have specific player counts
        const hasMultiplayer = metadata.playerInfo?.supportsOnline || metadata.playerInfo?.supportsLocal;
        const hasSpecificCounts = metadata.playerInfo?.onlineMaxPlayers !== undefined || 
                                  metadata.playerInfo?.localMaxPlayers !== undefined;
        
        if (!hasMultiplayer || hasSpecificCounts) {
            return metadata; // No enrichment needed
        }
        
        // Get providers with accurate player counts
        const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
        
        for (const provider of playerCountProviders) {
            const providerId = provider.getManifest().id;
            if (this.isProviderRateLimited(providerId)) continue;
            
            try {
                // Search for the game
                const searchResults = await this.searchProvider(provider, gameName, 1);
                if (searchResults.length === 0) continue;
                
                // Fetch player count data
                const playerMeta = await this.fetchFromProvider(provider, searchResults[0].externalId);
                if (!playerMeta?.playerInfo) continue;
                
                // Merge player counts
                const enrichedMetadata = {
                    ...metadata,
                    playerInfo: mergePlayerCounts(metadata.playerInfo, playerMeta.playerInfo),
                };
                
                console.log(`Enriched "${gameName}" with player counts from ${provider.getManifest().name}`);
                return enrichedMetadata;
            } catch (error) {
                console.warn(`Player count enrichment from ${providerId} failed:`, error);
                // Continue to next provider
            }
        }
        
        return metadata; // Return original if no enrichment succeeded
    }
    
    // ============ CORE STEP 5: Apply to Title ============
    
    /**
     * Apply metadata to a GameTitle entity
     * This is a CORE STEP used by both manual and batch operations
     * 
     * IMPORTANT: Respects game type when applying supportsPhysical.
     * Video games should NOT have supportsPhysical set from metadata providers.
     */
    async applyToTitle(
        titleId: string,
        title: GameTitle,
        metadata: GameMetadata,
        forceUpdate = false,
    ): Promise<{updates: Partial<GameTitle>; fieldsUpdated: string[]}> {
        const updates: Partial<GameTitle> = {};
        
        // Apply description (with normalization)
        if (metadata.shortDescription || metadata.description) {
            const rawDescription = metadata.shortDescription || metadata.description;
            const newDescription = normalizeDescription(rawDescription);
            
            const hasNoDescription = !title.description;
            const hasPlaceholderDescription = title.description && title.description.length < settings.value.minValidDescriptionLength;
            const hasNameAsDescription = title.description === title.name;
            
            if (newDescription && (forceUpdate || hasNoDescription || hasPlaceholderDescription || hasNameAsDescription)) {
                updates.description = newDescription;
            }
        }
        
        // Apply cover image
        if (metadata.coverImageUrl && (forceUpdate || !title.coverImageUrl)) {
            updates.coverImageUrl = metadata.coverImageUrl;
        }
        
        // Apply player info
        if (metadata.playerInfo) {
            this.applyPlayerInfoUpdates(updates, title, metadata.playerInfo);
        }
        
        const fieldsUpdated = Object.keys(updates);
        
        if (fieldsUpdated.length > 0) {
            await gameTitleService.updateGameTitle(titleId, updates);
        }
        
        return {updates, fieldsUpdated};
    }
    
    /**
     * Apply player info updates (helper for applyToTitle)
     * 
     * IMPORTANT: Player count values from metadata providers must be validated.
     * Invalid values (0, negative, NaN) are treated as "unknown" and not applied.
     * This ensures we preserve the distinction between "known count" vs "unknown count".
     * 
     * Player counts can be null (unknown):
     * - null = we don't know the player count
     * - For singleplayer-only games, null = implied 1 player
     * - For multiplayer games, null = UI will show warning
     */
    private applyPlayerInfoUpdates(
        updates: Partial<GameTitle>,
        title: GameTitle,
        playerInfo: NonNullable<GameMetadata['playerInfo']>
    ): void {
        // Overall player counts - validate before applying
        if (isValidPlayerCount(playerInfo.overallMinPlayers)) {
            updates.overallMinPlayers = playerInfo.overallMinPlayers;
        }
        if (isValidPlayerCount(playerInfo.overallMaxPlayers)) {
            updates.overallMaxPlayers = playerInfo.overallMaxPlayers;
        }
        
        // Online mode
        if (playerInfo.supportsOnline !== undefined) {
            updates.supportsOnline = playerInfo.supportsOnline;
            if (!playerInfo.supportsOnline) {
                updates.onlineMinPlayers = null;
                updates.onlineMaxPlayers = null;
            }
        }
        const willSupportOnline = updates.supportsOnline ?? title.supportsOnline;
        // Only apply player counts if mode is supported AND value is valid
        if (willSupportOnline && isValidPlayerCount(playerInfo.onlineMaxPlayers)) {
            updates.onlineMaxPlayers = playerInfo.onlineMaxPlayers;
        }
        
        // Local mode
        if (playerInfo.supportsLocal !== undefined) {
            updates.supportsLocal = playerInfo.supportsLocal;
            if (!playerInfo.supportsLocal) {
                updates.localMinPlayers = null;
                updates.localMaxPlayers = null;
            }
        }
        const willSupportLocal = updates.supportsLocal ?? title.supportsLocal;
        // Only apply player counts if mode is supported AND value is valid
        if (willSupportLocal && isValidPlayerCount(playerInfo.localMaxPlayers)) {
            updates.localMaxPlayers = playerInfo.localMaxPlayers;
        }
        
        // Physical mode - ONLY for board games
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
        if (willSupportPhysical && isBoardGame && isValidPlayerCount(playerInfo.physicalMaxPlayers)) {
            updates.physicalMaxPlayers = playerInfo.physicalMaxPlayers;
        }
    }
    
    // ============ HIGH-LEVEL OPERATION: Process Single Game ============
    
    /**
     * Process a single game through the full metadata pipeline
     * 
     * This is THE CORE OPERATION that both manual and batch use.
     * Batch processing is just multiple calls to this with shared state.
     * 
     * Pipeline steps:
     * 1. Get appropriate providers for game type
     * 2. Search/fetch metadata from primary provider
     * 3. Fallback to other providers if needed
     * 4. Enrich with player counts from specialized providers
     * 5. Return normalized metadata
     */
    async processGame(params: GameProcessingParams): Promise<MetadataFetchResult> {
        const {name, externalId, providerId, providerExternalId, gameType} = params;
        
        let foundMetadata: GameMetadata | null = null;
        let providerName = '';
        
        // Case 1: Specific provider and external ID given (user selected a search result)
        if (providerId && providerExternalId) {
            const provider = metadataProviderRegistry.getById(providerId);
            if (!provider) {
                return {updated: false, message: `Provider '${providerId}' not found`};
            }
            
            if (this.isProviderRateLimited(providerId)) {
                return {updated: false, message: `Provider '${providerId}' is rate limited`};
            }
            
            foundMetadata = await this.fetchFromProvider(provider, providerExternalId);
            providerName = provider.getManifest().name;
        }
        // Case 2: Specific provider given but no external ID (search by name)
        else if (providerId) {
            if (!name) {
                return {updated: false, message: 'Game name is required for search'};
            }
            
            const provider = metadataProviderRegistry.getById(providerId);
            if (!provider) {
                return {updated: false, message: `Provider '${providerId}' not found`};
            }
            
            const searchResults = await this.searchProvider(provider, name, 1);
            if (searchResults.length > 0) {
                foundMetadata = await this.fetchFromProvider(provider, searchResults[0].externalId);
            }
            providerName = provider.getManifest().name;
        }
        // Case 3: No specific provider - try all applicable providers
        else {
            if (!name) {
                return {updated: false, message: 'Game name is required for search'};
            }
            
            const providers = gameType 
                ? metadataProviderRegistry.getByGameType(gameType)
                : metadataProviderRegistry.getAllByCapability('supportsSearch');
            
            for (const provider of providers) {
                const pid = provider.getManifest().id;
                if (this.isProviderRateLimited(pid)) continue;
                
                // Search and fetch
                const searchResults = await this.searchProvider(provider, name, 1);
                if (searchResults.length === 0) continue;
                
                foundMetadata = await this.fetchFromProvider(provider, searchResults[0].externalId);
                if (foundMetadata) {
                    providerName = provider.getManifest().name;
                    break;
                }
            }
        }
        
        if (!foundMetadata) {
            return {updated: false, message: 'No metadata found from any provider'};
        }
        
        // Track if we had player counts before enrichment
        const hadPlayerCountsBefore = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined ||
                                       foundMetadata.playerInfo?.localMaxPlayers !== undefined;
        
        // Enrich with player counts (use metadata.name if name param not provided)
        const enrichmentName = name || foundMetadata.name;
        foundMetadata = await this.enrichPlayerCounts(enrichmentName, foundMetadata);
        
        // Track if we got player counts from enrichment
        const hasPlayerCountsAfter = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined ||
                                     foundMetadata.playerInfo?.localMaxPlayers !== undefined;
        
        // If we got player counts from enrichment (not from original provider), note it
        if (!hadPlayerCountsBefore && hasPlayerCountsAfter) {
            // The enrichPlayerCounts method already logged which provider was used
            // Just note that enrichment happened in the provider name
            providerName += ' (enriched)';
        }
        
        return {
            updated: true,
            message: `Found metadata from ${providerName}`,
            metadata: foundMetadata,
            providerName,
        };
    }
    
    // ============ HIGH-LEVEL OPERATION: Process Game Batch ============
    
    /**
     * Process multiple games through the metadata pipeline
     * 
     * This is batch processing - it calls processGame for each game
     * with shared rate limiting state for efficiency.
     * 
     * @param games List of games to process
     * @param primaryProviderId Primary provider to try first
     * @returns Map of externalGameId -> GameMetadata
     */
    async processGameBatch(
        games: ExternalGame[],
        primaryProviderId: string
    ): Promise<Map<string, GameMetadata>> {
        const metadataCache = new Map<string, GameMetadata>();
        const config = settings.value;
        const timeoutMs = config.metadataEnrichmentQueryTimeoutMs || games.length * 1000;
        const startTime = Date.now();
        
        console.log(`Starting batch metadata processing for ${games.length} games`);
        
        // Phase 1: Try primary provider first (more efficient for same-provider lookups)
        const primaryProvider = metadataProviderRegistry.getById(primaryProviderId);
        if (primaryProvider && !this.isProviderRateLimited(primaryProviderId)) {
            console.log(`Phase 1: Fetching from primary provider ${primaryProviderId}`);
            for (const game of games) {
                if (Date.now() - startTime >= timeoutMs) {
                    console.log('Timeout reached in phase 1');
                    break;
                }
                
                const metadata = await this.fetchFromProvider(primaryProvider, game.externalGameId);
                if (metadata) {
                    metadataCache.set(game.externalGameId, metadata);
                }
            }
        }
        
        // Phase 2: Fallback for games without metadata - use name search
        const gamesWithoutMetadata = games.filter(g => !metadataCache.has(g.externalGameId));
        if (gamesWithoutMetadata.length > 0 && Date.now() - startTime < timeoutMs) {
            console.log(`Phase 2: Searching by name for ${gamesWithoutMetadata.length} games`);
            
            const fallbackProviders = metadataProviderRegistry.getAllByCapability('supportsSearch')
                .filter(p => p.getManifest().id !== primaryProviderId);
            
            for (const game of gamesWithoutMetadata) {
                if (Date.now() - startTime >= timeoutMs) {
                    console.log('Timeout reached in phase 2');
                    break;
                }
                
                // Try each fallback provider
                for (const provider of fallbackProviders) {
                    const pid = provider.getManifest().id;
                    if (this.isProviderRateLimited(pid)) continue;
                    
                    const searchResults = await this.searchProvider(provider, game.name, 1);
                    if (searchResults.length > 0) {
                        const metadata = await this.fetchFromProvider(provider, searchResults[0].externalId);
                        if (metadata) {
                            // Map to original game's ID
                            metadataCache.set(game.externalGameId, {
                                ...metadata,
                                externalId: game.externalGameId,
                            });
                            break; // Found metadata, stop trying providers
                        }
                    }
                }
            }
        }
        
        // Phase 3: Enrich player counts for games that need it
        const gamesNeedingPlayerCounts = games.filter(g => {
            const meta = metadataCache.get(g.externalGameId);
            if (!meta) return false;
            const hasMultiplayer = meta.playerInfo?.supportsOnline || meta.playerInfo?.supportsLocal;
            const hasSpecificCounts = meta.playerInfo?.onlineMaxPlayers !== undefined ||
                                      meta.playerInfo?.localMaxPlayers !== undefined;
            return hasMultiplayer && !hasSpecificCounts;
        });
        
        if (gamesNeedingPlayerCounts.length > 0 && Date.now() - startTime < timeoutMs) {
            console.log(`Phase 3: Enriching player counts for ${gamesNeedingPlayerCounts.length} games`);
            
            for (const game of gamesNeedingPlayerCounts) {
                if (Date.now() - startTime >= timeoutMs) {
                    console.log('Timeout reached in phase 3');
                    break;
                }
                
                const currentMeta = metadataCache.get(game.externalGameId);
                if (!currentMeta) continue;
                
                const enrichedMeta = await this.enrichPlayerCounts(game.name, currentMeta);
                metadataCache.set(game.externalGameId, enrichedMeta);
            }
        }
        
        console.log(`Batch processing complete: ${metadataCache.size}/${games.length} games have metadata`);
        return metadataCache;
    }
    
    // ============ HIGH-LEVEL OPERATION: Search Options ============
    
    /**
     * Search for metadata options from all applicable providers
     * Returns sorted list for user selection
     */
    async searchOptions(
        gameName: string,
        gameType?: GameType
    ): Promise<MetadataSearchResult[]> {
        const providers = gameType 
            ? metadataProviderRegistry.getByGameType(gameType)
            : metadataProviderRegistry.getAllByCapability('supportsSearch');
        
        const allResults: MetadataSearchResult[] = [];
        
        for (const provider of providers) {
            const results = await this.searchProvider(provider, gameName, 10);
            allResults.push(...results);
        }
        
        // Sort by relevance
        const normalizedQuery = gameName.toLowerCase().trim();
        allResults.sort((a, b) => {
            const aName = a.name.toLowerCase().trim();
            const bName = b.name.toLowerCase().trim();
            
            // Exact match first
            const aExact = aName === normalizedQuery ? 0 : 1;
            const bExact = bName === normalizedQuery ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            
            // Prefix match
            const aPrefix = aName.startsWith(normalizedQuery) ? 0 : 1;
            const bPrefix = bName.startsWith(normalizedQuery) ? 0 : 1;
            if (aPrefix !== bPrefix) return aPrefix - bPrefix;
            
            // Shorter names
            return aName.length - bName.length;
        });
        
        return allResults.slice(0, 50);
    }
}

// ============ ENRICHMENT FUNCTION FOR SYNC PIPELINE ============

/**
 * Enrich ExternalGame with metadata
 * Used during sync pipeline to add metadata fields to games
 * 
 * IMPORTANT: Does NOT set supportsPhysical for video games
 */
export function enrichGameWithMetadata(game: ExternalGame, metadata: GameMetadata): ExternalGame {
    const enriched: ExternalGame = {...game};
    
    // Only override if not already set by connector
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
    
    if (enriched.storeUrl === undefined && metadata.storeUrl) {
        enriched.storeUrl = metadata.storeUrl;
    }
    
    if (enriched.coverImageUrl === undefined && metadata.coverImageUrl) {
        enriched.coverImageUrl = metadata.coverImageUrl;
    }
    
    // Player info (without supportsPhysical for video games)
    // IMPORTANT: Only apply player counts if they are valid (positive, finite numbers)
    if (metadata.playerInfo) {
        if (enriched.overallMinPlayers === undefined && isValidPlayerCount(metadata.playerInfo.overallMinPlayers)) {
            enriched.overallMinPlayers = metadata.playerInfo.overallMinPlayers;
        }
        if (enriched.overallMaxPlayers === undefined && isValidPlayerCount(metadata.playerInfo.overallMaxPlayers)) {
            enriched.overallMaxPlayers = metadata.playerInfo.overallMaxPlayers;
        }
        if (enriched.supportsOnline === undefined) {
            enriched.supportsOnline = metadata.playerInfo.supportsOnline;
        }
        if (enriched.supportsLocal === undefined) {
            enriched.supportsLocal = metadata.playerInfo.supportsLocal;
        }
        // Only apply mode-specific counts if valid (invalid -> keep as undefined = "unknown")
        if (enriched.onlineMaxPlayers === undefined && isValidPlayerCount(metadata.playerInfo.onlineMaxPlayers)) {
            enriched.onlineMaxPlayers = metadata.playerInfo.onlineMaxPlayers;
        }
        if (enriched.localMaxPlayers === undefined && isValidPlayerCount(metadata.playerInfo.localMaxPlayers)) {
            enriched.localMaxPlayers = metadata.playerInfo.localMaxPlayers;
        }
        // Note: supportsPhysical intentionally NOT set for video games
    }
    
    return enriched;
}

// ============ SINGLETON ============

let pipelineInstance: MetadataPipeline | null = null;

/**
 * Get the singleton MetadataPipeline instance
 */
export function getMetadataPipeline(): MetadataPipeline {
    if (!pipelineInstance) {
        pipelineInstance = new MetadataPipeline();
    }
    return pipelineInstance;
}
