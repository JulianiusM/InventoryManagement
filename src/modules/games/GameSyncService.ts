/**
 * Game Sync Service
 * Handles synchronization of game libraries from external providers
 * 
 * Key features:
 * - Automatic game title and release creation from connector metadata
 * - Automatic digital copy creation for synced games
 * - No manual mapping required - games are imported automatically
 * - Scheduled sync support for periodic execution
 * - Metadata enrichment from Steam Store API for player info
 * - Async processing for push imports (immediate entry creation, background metadata)
 * - Resilient sync with per-game error handling
 * 
 * Game copies are stored as Items with type=GAME_DIGITAL,
 * using the existing Item entity instead of a separate GameCopy entity.
 */

import {connectorRegistry} from './connectors/ConnectorRegistry';
import {ConnectorCredentials, ExternalGame, ImportPreprocessResult, isPushConnector} from './connectors/ConnectorInterface';
import {metadataProviderRegistry, initializeMetadataProviders} from './metadata/MetadataProviderRegistry';
import {GameMetadata, mergePlayerCounts, MetadataProvider, RateLimitConfig, MetadataRateLimitError} from './metadata/MetadataProviderInterface';
import {extractEdition} from './GameNameUtils';
import settings from '../settings';
import * as externalAccountService from '../database/services/ExternalAccountService';
import * as externalLibraryEntryService from '../database/services/ExternalLibraryEntryService';
import * as gameMappingService from '../database/services/GameExternalMappingService';
import * as gameTitleService from '../database/services/GameTitleService';
import * as gameReleaseService from '../database/services/GameReleaseService';
import * as itemService from '../database/services/ItemService';
import * as syncJobService from '../database/services/SyncJobService';
import * as platformService from '../database/services/PlatformService';
import * as connectorDeviceService from '../database/services/ConnectorDeviceService';
import {PlayerProfileValidationError} from '../database/services/GameValidationService';
import {
    GameCopyType, 
    MappingStatus, 
    GameType,
    SyncStatus
} from '../../types/InventoryEnums';
import {GameTitle} from '../database/entities/gameTitle/GameTitle';
import {GameRelease} from '../database/entities/gameRelease/GameRelease';

// Initialize metadata providers
initializeMetadataProviders();

/**
 * Result from auto-creating game title and release from metadata
 */
export interface AutoCreateGameResult {
    title: GameTitle;
    release: GameRelease;
    titleCreated: boolean;
    releaseCreated: boolean;
}

export interface SyncStats {
    entriesProcessed: number;
    entriesAdded: number;
    entriesUpdated: number;
    titlesCreated: number;
    copiesCreated: number;
}

/**
 * Push import result returned to API caller
 */
export interface PushImportResult {
    deviceId: string;
    importedAt: string;
    counts: {
        received: number;
        created: number;
        updated: number;
        unchanged: number;
        softRemoved: number;
        needsReview: number;
    };
    warnings: Array<{code: string; count: number}>;
}

// Map provider to default platform (user-defined platforms now, so using common defaults)
const providerPlatformDefaults: Record<string, string> = {
    'steam': 'PC',
    'epic': 'PC',
    'gog': 'PC',
    'xbox': 'Xbox Series',
    'playstation': 'PlayStation 5',
    'nintendo': 'Nintendo Switch',
    'origin': 'PC',
    'ubisoft': 'PC',
};

// Store scheduled sync intervals (in-memory for now)
const scheduledSyncs = new Map<string, NodeJS.Timeout>();

/**
 * Centralized metadata fetcher with rate limiting
 * Handles rate limiting for all metadata providers uniformly
 */
class MetadataFetcher {
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
const metadataFetcher = new MetadataFetcher();

/**
 * Schedule periodic sync for an account
 * @param accountId Account to sync
 * @param intervalMinutes Interval in minutes between syncs
 */
export function scheduleSync(accountId: string, ownerId: number, intervalMinutes: number): void {
    // Clear existing schedule if any
    cancelScheduledSync(accountId);
    
    const intervalMs = intervalMinutes * 60 * 1000;
    const timer = setInterval(async () => {
        try {
            await syncExternalAccount(accountId, ownerId);
        } catch (error) {
            console.error(`Scheduled sync failed for account ${accountId}:`, error);
        }
    }, intervalMs);
    
    scheduledSyncs.set(accountId, timer);
}

/**
 * Cancel scheduled sync for an account
 */
export function cancelScheduledSync(accountId: string): void {
    const existing = scheduledSyncs.get(accountId);
    if (existing) {
        clearInterval(existing);
        scheduledSyncs.delete(accountId);
    }
}

/**
 * Get all scheduled sync account IDs
 */
export function getScheduledSyncs(): string[] {
    return Array.from(scheduledSyncs.keys());
}

/**
 * Recover in-progress sync jobs on application startup
 * Marks stale in-progress jobs as failed so they can be retried
 */
export async function recoverStaleSyncJobs(): Promise<void> {
    try {
        const staleJobs = await syncJobService.getInProgressJobs();
        
        if (staleJobs.length === 0) {
            console.log('No stale sync jobs to recover');
            return;
        }
        
        console.log(`Recovering ${staleJobs.length} stale sync jobs...`);
        
        for (const job of staleJobs) {
            // Mark as failed since we can't resume partial state
            await syncJobService.failSyncJob(
                job.id, 
                'Sync interrupted by application restart. Please trigger a new sync.'
            );
            console.log(`Marked stale job ${job.id} as failed`);
        }
        
        console.log('Stale sync job recovery completed');
    } catch (error) {
        console.error('Failed to recover stale sync jobs:', error);
    }
}

/**
 * Sync a user's external account library
 * 
 * This is the main sync function that:
 * 1. Fetches games from the external provider
 * 2. Automatically creates game titles with metadata from connector
 * 3. Creates releases for the platform
 * 4. Creates digital copy items linked to the account
 * 
 * No manual mapping is required - everything is handled automatically.
 * Idempotent: reruns do not duplicate copies.
 */
export async function syncExternalAccount(
    accountId: string, 
    ownerId: number
): Promise<{success: boolean; stats?: SyncStats; error?: string; jobId: string}> {
    // Create sync job
    const job = await syncJobService.createSyncJob(accountId);
    
    try {
        // Get account
        const account = await externalAccountService.getExternalAccountById(accountId);
        if (!account) {
            await syncJobService.failSyncJob(job.id, 'Account not found');
            return {success: false, error: 'Account not found', jobId: job.id};
        }
        
        // Verify ownership
        if (account.ownerId !== ownerId) {
            await syncJobService.failSyncJob(job.id, 'Access denied');
            return {success: false, error: 'Access denied', jobId: job.id};
        }
        
        // Get connector
        const connector = connectorRegistry.getByProvider(account.provider);
        if (!connector) {
            await syncJobService.failSyncJob(job.id, `No connector for provider: ${account.provider}`);
            return {success: false, error: `No connector for provider: ${account.provider}`, jobId: job.id};
        }
        
        // Start job
        await syncJobService.startSyncJob(job.id);
        
        // Validate external user ID is set
        if (!account.externalUserId) {
            await syncJobService.failSyncJob(job.id, 'External user ID not configured for this account');
            return {success: false, error: 'External user ID not configured for this account', jobId: job.id};
        }
        
        // Build credentials from account
        const credentials: ConnectorCredentials = {
            externalUserId: account.externalUserId,
            tokenRef: account.tokenRef || undefined,
        };
        
        // Sync library
        const result = await connector.syncLibrary(credentials);
        if (!result.success) {
            await syncJobService.failSyncJob(job.id, result.error || 'Sync failed');
            return {success: false, error: result.error, jobId: job.id};
        }
        
        // Check if connector is an aggregator
        const isAggregator = connector.getManifest().isAggregator || false;
        
        // Process games with automatic creation
        const stats = await processGamesWithAutoCreate(
            account.id,
            account.provider,
            result.games,
            ownerId,
            isAggregator
        );
        
        // Update account last synced
        await externalAccountService.updateLastSyncedAt(accountId);
        
        // Complete job
        await syncJobService.completeSyncJob(job.id, {
            entriesProcessed: stats.entriesProcessed,
            entriesAdded: stats.entriesAdded,
            entriesUpdated: stats.entriesUpdated,
        });
        
        return {success: true, stats, jobId: job.id};
        
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await syncJobService.failSyncJob(job.id, message);
        return {success: false, error: message, jobId: job.id};
    }
}

/**
 * Pre-fetch existing items for a list of games
 * This is the central smart sync helper used by both fetch and push flows
 * 
 * @param accountId The external account ID
 * @param games List of games to check
 * @returns Map of externalGameId -> existing item (only for games that have copies)
 */
async function prefetchExistingItems(
    accountId: string,
    games: ExternalGame[]
): Promise<Map<string, Awaited<ReturnType<typeof itemService.findGameItemByExternalId>>>> {
    const existingItemsMap = new Map<string, Awaited<ReturnType<typeof itemService.findGameItemByExternalId>>>();
    
    for (const game of games) {
        const existing = await itemService.findGameItemByExternalId(accountId, game.externalGameId);
        if (existing) {
            existingItemsMap.set(game.externalGameId, existing);
        }
    }
    
    const newCount = games.length - existingItemsMap.size;
    console.log(`Smart sync: ${existingItemsMap.size} games already have copies, ${newCount} need full processing`);
    
    return existingItemsMap;
}

/**
 * Update an existing game item with latest data (playtime, install status, store URL)
 * Used by smart sync to skip full processing for existing games
 */
async function updateExistingGameItem(
    existingItem: NonNullable<Awaited<ReturnType<typeof itemService.findGameItemByExternalId>>>,
    game: ExternalGame
): Promise<void> {
    await itemService.updateItem(existingItem.id, {
        playtimeMinutes: game.playtimeMinutes,
        lastPlayedAt: game.lastPlayedAt,
        isInstalled: game.isInstalled,
        storeUrl: game.storeUrl,
    });
}

/**
 * Process synced games with automatic game title and copy creation
 * 
 * For each game from the connector:
 * 1. Check if game already has a copy (smart sync: skip metadata for existing)
 * 2. For new games only: Enrich with metadata from provider
 * 3. Create/update library entry snapshot
 * 4. If no mapping exists, automatically create game title + release from metadata
 * 5. Create/update the digital copy item
 * 
 * Smart sync: Games that already have copies only get updated with playtime/status.
 * Metadata enrichment is skipped for existing games to save API calls.
 * 
 * For aggregator connectors (like Playnite), also stores the original provider info
 */
async function processGamesWithAutoCreate(
    accountId: string,
    provider: string,
    games: ExternalGame[],
    ownerId: number,
    isAggregator: boolean = false
): Promise<SyncStats> {
    let entriesAdded = 0;
    let entriesUpdated = 0;
    let titlesCreated = 0;
    let copiesCreated = 0;
    
    // Use provider-specific platform default or 'PC' as fallback
    const platform = providerPlatformDefaults[provider.toLowerCase()] || 'PC';
    
    // Smart sync: Pre-fetch all existing items using centralized helper
    const existingItemsMap = await prefetchExistingItems(accountId, games);
    
    // Filter games to those that need metadata enrichment (new games only)
    const newGames = games.filter(g => !existingItemsMap.has(g.externalGameId));
    
    // Only fetch metadata for NEW games - skip for existing games
    let metadataCache: Map<string, GameMetadata> = new Map();
    if (newGames.length > 0) {
        metadataCache = await metadataFetcher.fetchMetadataForGames(newGames, provider);
    }
    
    for (const game of games) {
        try {
            // Check if this game already has a copy
            const existingItem = existingItemsMap.get(game.externalGameId);
            
            // For existing games: only update playtime/status, skip metadata enrichment
            if (existingItem) {
                // Step 1: Upsert library entry (snapshot of external data)
                await externalLibraryEntryService.upsertLibraryEntry({
                    externalAccountId: accountId,
                    externalGameId: game.externalGameId,
                    externalGameName: game.name,
                    rawPayload: game.rawPayload,
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
                });
                entriesUpdated++;
                
                // Update existing item using centralized helper
                await updateExistingGameItem(existingItem, game);
                continue;
            }
            
            // For new games: Full processing with metadata enrichment
            const enrichedGame = enrichGameWithMetadata(game, metadataCache.get(game.externalGameId));
            
            // Step 1: Upsert library entry (snapshot of external data)
            await externalLibraryEntryService.upsertLibraryEntry({
                externalAccountId: accountId,
                externalGameId: enrichedGame.externalGameId,
                externalGameName: enrichedGame.name,
                rawPayload: enrichedGame.rawPayload,
                playtimeMinutes: enrichedGame.playtimeMinutes,
                lastPlayedAt: enrichedGame.lastPlayedAt,
                isInstalled: enrichedGame.isInstalled,
            });
            entriesAdded++;
            
            // Step 2: Get or create mapping with auto-creation
            let mapping = await gameMappingService.getMappingByExternalId(
                provider,
                enrichedGame.externalGameId,
                ownerId
            );
            
            // Step 3: If no mapping exists or mapping is pending, auto-create
            if (!mapping || mapping.status === MappingStatus.PENDING) {
                // Use platform from game metadata if available, otherwise use provider default
                const gamePlatform = enrichedGame.platform || platform;
                const result = await safeAutoCreateGameFromMetadata(enrichedGame, gamePlatform, ownerId);
                if (result.titleCreated) titlesCreated++;
                
                // Create or update the mapping
                if (mapping) {
                    await gameMappingService.updateMapping(mapping.id, {
                        gameTitleId: result.title.id,
                        gameReleaseId: result.release.id,
                        status: MappingStatus.MAPPED,
                    });
                } else {
                    await gameMappingService.createMapping({
                        provider,
                        externalGameId: enrichedGame.externalGameId,
                        externalGameName: enrichedGame.name,
                        gameTitleId: result.title.id,
                        gameReleaseId: result.release.id,
                        status: MappingStatus.MAPPED,
                        ownerId,
                    });
                }
                
                // Refresh mapping
                mapping = await gameMappingService.getMappingByExternalId(
                    provider,
                    enrichedGame.externalGameId,
                    ownerId
                );
            }
            
            // Step 4: Skip if mapping is ignored
            if (mapping?.status === MappingStatus.IGNORED) {
                continue;
            }
            
            // Step 5: Create the digital copy
            if (mapping?.gameReleaseId) {
                await itemService.createGameItem({
                    name: enrichedGame.name,
                    gameReleaseId: mapping.gameReleaseId,
                    gameCopyType: GameCopyType.DIGITAL_LICENSE,
                    externalAccountId: accountId,
                    externalGameId: enrichedGame.externalGameId,
                    playtimeMinutes: enrichedGame.playtimeMinutes,
                    lastPlayedAt: enrichedGame.lastPlayedAt,
                    isInstalled: enrichedGame.isInstalled,
                    lendable: false,
                    ownerId,
                    // Aggregator origin fields (only for aggregator connectors)
                    aggregatorProviderId: isAggregator ? provider : undefined,
                    aggregatorAccountId: isAggregator ? accountId : undefined,
                    aggregatorExternalGameId: isAggregator ? enrichedGame.externalGameId : undefined,
                    originalProviderPluginId: enrichedGame.originalProviderPluginId,
                    originalProviderName: enrichedGame.originalProviderName,
                    originalProviderGameId: enrichedGame.originalProviderGameId,
                    originalProviderNormalizedId: enrichedGame.originalProviderNormalizedId,
                    storeUrl: enrichedGame.storeUrl,
                    needsReview: !enrichedGame.originalProviderGameId && isAggregator,
                });
                copiesCreated++;
            }
        } catch (error) {
            // Log error but continue with other games (per-game error handling)
            console.error(`Failed to process game "${game.name}" (${game.externalGameId}):`, error);
        }
    }
    
    return {
        entriesProcessed: games.length,
        entriesAdded,
        entriesUpdated,
        titlesCreated,
        copiesCreated,
    };
}

/**
 * Enrich a game with metadata from provider
 * Adds player info, multiplayer flags, and other metadata
 */
function enrichGameWithMetadata(
    game: ExternalGame,
    metadata: GameMetadata | undefined
): ExternalGame {
    if (!metadata) {
        return game;
    }
    
    const enriched: ExternalGame = {...game};
    
    // Only override if not already set by connector
    if (enriched.description === undefined && metadata.description) {
        enriched.description = metadata.description;
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
    
    // Enrich player info from metadata provider
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
    }
    
    return enriched;
}

// Default maximum players for multiplayer games when not specified
const DEFAULT_MULTIPLAYER_MAX_PLAYERS = 4;

/**
 * Determine if a game has multiplayer support based on available metadata
 */
function hasMultiplayerSupport(game: ExternalGame): boolean {
    const supportsOnline = game.supportsOnline ?? false;
    const supportsLocal = game.supportsLocal ?? false;
    const hasMultipleMaxPlayers = game.overallMaxPlayers !== undefined && game.overallMaxPlayers > 1;
    return supportsOnline || supportsLocal || hasMultipleMaxPlayers;
}

/**
 * Automatically create a game title and release from connector metadata
 * Extracts edition from game name and creates appropriate structures
 * 
 * Uses getOrCreate pattern to merge games with the same normalized title:
 * - "The Sims 4" and "The Sims™ 4" will map to the same title
 * - "Game Standard Edition" and "Game Deluxe Edition" will be different releases of the same title
 */
async function autoCreateGameFromMetadata(
    game: ExternalGame,
    platform: string,
    ownerId: number
): Promise<AutoCreateGameResult> {
    // Ensure the platform exists in the database (auto-create if missing)
    await platformService.getOrCreatePlatform(platform, ownerId);
    
    // Extract edition from game name (e.g., "Game - GOTY Edition" -> "Game" + "GOTY Edition")
    const {baseName, edition} = extractEdition(game.name);
    
    // Determine player info with sensible defaults for multiplayer games
    const supportsOnline = game.supportsOnline ?? false;
    const supportsLocal = game.supportsLocal ?? false;
    const hasMultiplayer = hasMultiplayerSupport(game);
    
    // Get or create game title (merges with existing titles with same normalized name)
    const {title, isNew: titleCreated} = await gameTitleService.getOrCreateGameTitle({
        name: baseName, // Use base name without edition
        type: GameType.VIDEO_GAME,
        description: game.description || null,
        coverImageUrl: game.coverImageUrl || null,
        overallMinPlayers: game.overallMinPlayers ?? 1,
        overallMaxPlayers: game.overallMaxPlayers ?? (hasMultiplayer ? DEFAULT_MULTIPLAYER_MAX_PLAYERS : 1),
        supportsOnline,
        supportsLocal,
        supportsPhysical: game.supportsPhysical ?? false,
        onlineMinPlayers: supportsOnline ? (game.onlineMinPlayers ?? 1) : null,
        onlineMaxPlayers: supportsOnline ? (game.onlineMaxPlayers ?? DEFAULT_MULTIPLAYER_MAX_PLAYERS) : null,
        localMinPlayers: supportsLocal ? (game.localMinPlayers ?? 1) : null,
        localMaxPlayers: supportsLocal ? (game.localMaxPlayers ?? DEFAULT_MULTIPLAYER_MAX_PLAYERS) : null,
        physicalMinPlayers: null,
        physicalMaxPlayers: null,
        ownerId,
    });
    
    // Get or create release for this platform with edition info
    const {release, isNew: releaseCreated} = await gameReleaseService.getOrCreateGameRelease({
        gameTitleId: title.id,
        platform,
        releaseDate: game.releaseDate || null,
        edition, // Store detected edition
        ownerId,
    });
    
    return {title, release, titleCreated, releaseCreated};
}

/**
 * Clamp player profile values to ensure they pass validation
 * 
 * Key principles:
 * 1. Mode-specific values (online/local max) take PRECEDENCE over overall values
 * 2. If mode-specific values exist but supportsX is false, enable supportsX
 * 3. Overall max is EXTENDED to accommodate mode max values (not clamped down)
 * 4. Only clamp if we have actual data (not defaults)
 * 
 * This ensures syncs complete even with inconsistent metadata from providers
 */
function clampPlayerProfileValues(game: ExternalGame): ExternalGame {
    // Start with a copy
    const clamped: ExternalGame = {...game};
    
    // Step 1: If mode-specific values exist but supportsX is false, enable the support flag
    // This is because having player counts implies support for that mode
    if (clamped.onlineMaxPlayers !== undefined && clamped.onlineMaxPlayers > 0) {
        clamped.supportsOnline = true;
    }
    if (clamped.localMaxPlayers !== undefined && clamped.localMaxPlayers > 0) {
        clamped.supportsLocal = true;
    }
    
    // Step 2: Find the maximum player count across all modes (mode values take precedence)
    let derivedMaxPlayers = clamped.overallMaxPlayers ?? 1;
    
    if (clamped.supportsOnline && clamped.onlineMaxPlayers !== undefined) {
        derivedMaxPlayers = Math.max(derivedMaxPlayers, clamped.onlineMaxPlayers);
    }
    if (clamped.supportsLocal && clamped.localMaxPlayers !== undefined) {
        derivedMaxPlayers = Math.max(derivedMaxPlayers, clamped.localMaxPlayers);
    }
    
    // Step 3: Ensure overall max is at least 1 and accommodates all mode maxes
    clamped.overallMaxPlayers = Math.max(1, derivedMaxPlayers);
    
    // Step 4: Ensure overall min is at least 1 and <= overall max
    if (!clamped.overallMinPlayers || clamped.overallMinPlayers < 1) {
        clamped.overallMinPlayers = 1;
    }
    if (clamped.overallMinPlayers > clamped.overallMaxPlayers) {
        clamped.overallMinPlayers = clamped.overallMaxPlayers;
    }
    
    // Step 5: Clear mode-specific values if mode is not supported (validation requires this)
    if (!clamped.supportsOnline) {
        clamped.onlineMinPlayers = undefined;
        clamped.onlineMaxPlayers = undefined;
    } else {
        // Ensure online min is valid
        if (clamped.onlineMinPlayers !== undefined && clamped.onlineMinPlayers < 1) {
            clamped.onlineMinPlayers = 1;
        }
        // Ensure online max >= online min
        if (clamped.onlineMinPlayers !== undefined && clamped.onlineMaxPlayers !== undefined 
            && clamped.onlineMaxPlayers < clamped.onlineMinPlayers) {
            clamped.onlineMaxPlayers = clamped.onlineMinPlayers;
        }
    }
    
    if (!clamped.supportsLocal) {
        clamped.localMinPlayers = undefined;
        clamped.localMaxPlayers = undefined;
    } else {
        // Ensure local min is valid
        if (clamped.localMinPlayers !== undefined && clamped.localMinPlayers < 1) {
            clamped.localMinPlayers = 1;
        }
        // Ensure local max >= local min
        if (clamped.localMinPlayers !== undefined && clamped.localMaxPlayers !== undefined 
            && clamped.localMaxPlayers < clamped.localMinPlayers) {
            clamped.localMaxPlayers = clamped.localMinPlayers;
        }
    }
    
    return clamped;
}

/**
 * Safe wrapper for autoCreateGameFromMetadata that handles PlayerProfileValidationError
 * If validation fails, clamps values to ensure they pass validation
 * 
 * This ensures that syncs complete even if metadata from providers has invalid values
 * (e.g., onlineMaxPlayers > overallMaxPlayers due to inconsistent metadata)
 */
async function safeAutoCreateGameFromMetadata(
    game: ExternalGame,
    platform: string,
    ownerId: number
): Promise<AutoCreateGameResult> {
    try {
        return await autoCreateGameFromMetadata(game, platform, ownerId);
    } catch (error) {
        if (error instanceof PlayerProfileValidationError) {
            console.warn(`PlayerProfileValidationError for "${game.name}": ${error.message}. Attempting to clamp values.`);
            
            // Clamp values to ensure they pass validation
            const clampedGame = clampPlayerProfileValues(game);
            
            try {
                return await autoCreateGameFromMetadata(clampedGame, platform, ownerId);
            } catch (clampError) {
                // If clamping still fails, use absolute safe defaults as last resort
                console.warn(`Clamping failed for "${game.name}": ${clampError instanceof Error ? clampError.message : 'Unknown'}. Using minimal defaults.`);
                
                const safeGame: ExternalGame = {
                    ...game,
                    overallMinPlayers: 1,
                    overallMaxPlayers: 1,
                    supportsOnline: false,
                    supportsLocal: false,
                    supportsPhysical: false,
                    onlineMinPlayers: undefined,
                    onlineMaxPlayers: undefined,
                    localMinPlayers: undefined,
                    localMaxPlayers: undefined,
                };
                
                return await autoCreateGameFromMetadata(safeGame, platform, ownerId);
            }
        }
        throw error;
    }
}

/**
 * Get sync status for an account
 */
export async function getSyncStatus(accountId: string): Promise<{
    lastSyncedAt: Date | null;
    latestJob: {
        id: string;
        status: string;
        startedAt: Date | null;
        completedAt: Date | null;
        entriesProcessed: number | null;
        errorMessage: string | null;
    } | null;
    isScheduled: boolean;
}> {
    const account = await externalAccountService.getExternalAccountById(accountId);
    const latestJob = await syncJobService.getLatestSyncJob(accountId);
    const isScheduled = scheduledSyncs.has(accountId);
    
    return {
        lastSyncedAt: account?.lastSyncedAt || null,
        latestJob: latestJob ? {
            id: latestJob.id,
            status: latestJob.status,
            startedAt: latestJob.startedAt || null,
            completedAt: latestJob.completedAt || null,
            entriesProcessed: latestJob.entriesProcessed || null,
            errorMessage: latestJob.errorMessage || null,
        } : null,
        isScheduled,
    };
}

/**
 * Process a push import from an external agent
 * 
 * Unified pipeline for all push-style connectors with async metadata enrichment:
 * 1. Get account/connector from device info
 * 2. Delegate preprocessing to connector (validates and converts to ExternalGame[])
 * 3. Create/update library entries immediately (no metadata wait)
 * 4. Queue background metadata enrichment
 * 5. Handle soft-removal for missing entries
 * 6. Return import summary immediately
 * 
 * Metadata enrichment happens asynchronously - the caller doesn't need to wait.
 * 
 * @param deviceId - Device ID that pushed the data
 * @param accountId - Account ID the device belongs to
 * @param userId - User ID who owns the account
 * @param payload - Raw import payload from the external agent
 */
export async function processPushImport(
    deviceId: string,
    accountId: string,
    userId: number,
    payload: unknown
): Promise<PushImportResult> {
    const importedAt = new Date().toISOString();
    
    // Get account info
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new Error('Account not found');
    }
    
    // Verify ownership
    if (account.ownerId !== userId) {
        throw new Error('Access denied');
    }
    
    // Get connector - must be a push connector
    const connector = connectorRegistry.getByProvider(account.provider);
    if (!connector) {
        throw new Error(`No connector for provider: ${account.provider}`);
    }
    
    if (!isPushConnector(connector)) {
        throw new Error(`${account.provider} does not support push imports`);
    }
    
    // Preprocess the payload via the connector
    // This is the ONLY connector-specific step - everything else is generic
    const preprocessResult: ImportPreprocessResult = await connector.preprocessImport(payload);
    
    if (!preprocessResult.success) {
        throw new Error(preprocessResult.error || 'Preprocessing failed');
    }
    
    // Check if connector is an aggregator
    const isAggregator = connector.getManifest().isAggregator || false;
    
    // Create a sync job for tracking
    const job = await syncJobService.createSyncJob(accountId);
    await syncJobService.startSyncJob(job.id);
    
    // Step 1: Immediate processing - create/update library entries and basic items (no metadata wait)
    const stats = await processGamesImmediately(
        accountId,
        account.provider,
        preprocessResult.games,
        userId,
        isAggregator
    );
    
    // Handle soft-removal for entries not in this import batch
    const softRemoved = await softRemoveUnseenEntries(
        accountId,
        account.provider,
        new Set(preprocessResult.entitlementKeys),
        isAggregator
    );
    
    // Update device last import timestamp
    await connectorDeviceService.updateLastImportAt(deviceId);
    
    // Update account last synced timestamp
    await externalAccountService.updateLastSyncedAt(accountId);
    
    // Step 2: Queue background metadata enrichment (async - don't wait)
    processMetadataEnrichmentAsync(
        accountId,
        account.provider,
        preprocessResult.games,
        userId,
        isAggregator,
        job.id
    ).catch(error => {
        console.error(`Background metadata enrichment failed for account ${accountId}:`, error);
        syncJobService.failSyncJob(job.id, error instanceof Error ? error.message : 'Metadata enrichment failed');
    });
    
    return {
        deviceId,
        importedAt,
        counts: {
            received: preprocessResult.games.length,
            created: stats.copiesCreated,
            updated: stats.entriesUpdated,
            unchanged: stats.entriesProcessed - stats.copiesCreated - stats.entriesUpdated,
            softRemoved,
            needsReview: preprocessResult.needsReviewCount,
        },
        warnings: preprocessResult.warnings,
    };
}

/**
 * Process games immediately without waiting for metadata
 * Creates library entries and basic items. Metadata enrichment happens later.
 * 
 * Smart sync optimization:
 * - Pre-filters games that already have copies (only updates playtime/install status)
 * - Full processing only for new games
 */
async function processGamesImmediately(
    accountId: string,
    provider: string,
    games: ExternalGame[],
    ownerId: number,
    isAggregator: boolean = false
): Promise<SyncStats> {
    let entriesAdded = 0;
    let entriesUpdated = 0;
    let titlesCreated = 0;
    let copiesCreated = 0;
    
    // Use provider-specific platform default or 'PC' as fallback
    const platform = providerPlatformDefaults[provider.toLowerCase()] || 'PC';
    
    // Smart sync: Pre-fetch all existing items using centralized helper
    const existingItemsMap = await prefetchExistingItems(accountId, games);
    
    for (const game of games) {
        try {
            // Step 1: Upsert library entry (snapshot of external data)
            const existingEntry = await externalLibraryEntryService.getLibraryEntryByExternalId(
                accountId, 
                game.externalGameId
            );
            
            await externalLibraryEntryService.upsertLibraryEntry({
                externalAccountId: accountId,
                externalGameId: game.externalGameId,
                externalGameName: game.name,
                rawPayload: game.rawPayload,
                playtimeMinutes: game.playtimeMinutes,
                lastPlayedAt: game.lastPlayedAt,
                isInstalled: game.isInstalled,
            });
            
            if (existingEntry) {
                entriesUpdated++;
            } else {
                entriesAdded++;
            }
            
            // Smart sync: If this game already has a copy, just update it and skip full processing
            const existingItem = existingItemsMap.get(game.externalGameId);
            if (existingItem) {
                // Update existing item using centralized helper
                await updateExistingGameItem(existingItem, game);
                continue;
            }
            
            // Step 2: Get or create mapping with auto-creation
            let mapping = await gameMappingService.getMappingByExternalId(
                provider,
                game.externalGameId,
                ownerId
            );
            
            // Step 3: If no mapping exists or mapping is pending, auto-create with basic data
            if (!mapping || mapping.status === MappingStatus.PENDING) {
                // Use platform from game metadata if available, otherwise use provider default
                const gamePlatform = game.platform || platform;
                const result = await safeAutoCreateGameFromMetadata(game, gamePlatform, ownerId);
                if (result.titleCreated) titlesCreated++;
                
                // Create or update the mapping
                if (mapping) {
                    await gameMappingService.updateMapping(mapping.id, {
                        gameTitleId: result.title.id,
                        gameReleaseId: result.release.id,
                        status: MappingStatus.MAPPED,
                    });
                } else {
                    await gameMappingService.createMapping({
                        provider,
                        externalGameId: game.externalGameId,
                        externalGameName: game.name,
                        gameTitleId: result.title.id,
                        gameReleaseId: result.release.id,
                        status: MappingStatus.MAPPED,
                        ownerId,
                    });
                }
                
                // Refresh mapping
                mapping = await gameMappingService.getMappingByExternalId(
                    provider,
                    game.externalGameId,
                    ownerId
                );
            }
            
            // Step 4: Skip if mapping is ignored
            if (mapping?.status === MappingStatus.IGNORED) {
                continue;
            }
            
            // Step 5: Create the digital copy (since we already handled updates above for existing copies)
            if (mapping?.gameReleaseId) {
                // Create digital game item with basic data
                await itemService.createGameItem({
                    name: game.name,
                    gameReleaseId: mapping.gameReleaseId,
                    gameCopyType: GameCopyType.DIGITAL_LICENSE,
                    externalAccountId: accountId,
                    externalGameId: game.externalGameId,
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
                    lendable: false,
                    ownerId,
                    // Aggregator origin fields (only for aggregator connectors)
                    aggregatorProviderId: isAggregator ? provider : undefined,
                    aggregatorAccountId: isAggregator ? accountId : undefined,
                    aggregatorExternalGameId: isAggregator ? game.externalGameId : undefined,
                    originalProviderPluginId: game.originalProviderPluginId,
                    originalProviderName: game.originalProviderName,
                    originalProviderGameId: game.originalProviderGameId,
                    originalProviderNormalizedId: game.originalProviderNormalizedId,
                    storeUrl: game.storeUrl, // Use storeUrl from connector if provided
                    needsReview: !game.originalProviderGameId && isAggregator,
                });
                copiesCreated++;
            }
        } catch (error) {
            // Log error but continue with other games
            console.error(`Failed to process game "${game.name}" (${game.externalGameId}):`, error);
        }
    }
    
    return {
        entriesProcessed: games.length,
        entriesAdded,
        entriesUpdated,
        titlesCreated,
        copiesCreated,
    };
}

/**
 * Process metadata enrichment asynchronously
 * Runs in background after immediate processing completes
 */
async function processMetadataEnrichmentAsync(
    accountId: string,
    provider: string,
    games: ExternalGame[],
    ownerId: number,
    isAggregator: boolean,
    jobId: string
): Promise<void> {
    console.log(`Starting background metadata enrichment for ${games.length} games (job ${jobId})`);
    
    try {
        // Fetch metadata for all games using centralized fetcher
        const metadataCache = await metadataFetcher.fetchMetadataForGames(games, provider);
        
        let enrichedCount = 0;
        let skippedCount = 0;
        
        // Enrich games that have metadata
        for (const game of games) {
            const metadata = metadataCache.get(game.externalGameId);
            if (!metadata) continue;
            
            try {
                // Get the mapping for this game
                const mapping = await gameMappingService.getMappingByExternalId(
                    provider,
                    game.externalGameId,
                    ownerId
                );
                
                if (!mapping?.gameTitleId) {
                    skippedCount++;
                    continue;
                }
                
                // Check if the game title still exists (may have been merged/deleted)
                const gameTitle = await gameTitleService.getGameTitleById(mapping.gameTitleId);
                if (!gameTitle) {
                    console.log(`Skipping enrichment for "${game.name}" - game title no longer exists (may have been merged or deleted)`);
                    skippedCount++;
                    continue;
                }
                
                // Enrich game title with metadata
                const enrichedGame = enrichGameWithMetadata(game, metadata);
                
                // Build update data, clamping values to ensure validation passes
                // The key issue is that mode-specific values must be consistent with supportsX flags
                const updateData: Record<string, unknown> = {};
                
                if (enrichedGame.description) {
                    updateData.description = enrichedGame.description;
                }
                
                // Handle player profile updates carefully to avoid validation errors
                // We need to consider existing values from the game title and merge with new values
                const existingSupportsOnline = gameTitle.supportsOnline ?? false;
                const existingSupportsLocal = gameTitle.supportsLocal ?? false;
                const existingOverallMax = gameTitle.overallMaxPlayers ?? 1;
                
                // Determine new support flags
                const newSupportsOnline = enrichedGame.supportsOnline ?? existingSupportsOnline;
                const newSupportsLocal = enrichedGame.supportsLocal ?? existingSupportsLocal;
                
                // If updating min/max players, ensure consistency
                if (enrichedGame.overallMinPlayers !== undefined) {
                    updateData.overallMinPlayers = Math.max(1, enrichedGame.overallMinPlayers);
                }
                
                let newOverallMax = existingOverallMax;
                if (enrichedGame.overallMaxPlayers !== undefined) {
                    newOverallMax = Math.max(enrichedGame.overallMaxPlayers, updateData.overallMinPlayers as number ?? 1);
                }
                
                // Handle online max players - must be <= overall max and only set if supportsOnline
                if (newSupportsOnline && enrichedGame.onlineMaxPlayers !== undefined) {
                    // If online max exceeds overall max, extend overall max
                    if (enrichedGame.onlineMaxPlayers > newOverallMax) {
                        newOverallMax = enrichedGame.onlineMaxPlayers;
                    }
                    updateData.onlineMaxPlayers = enrichedGame.onlineMaxPlayers;
                    updateData.supportsOnline = true;
                } else if (!newSupportsOnline && enrichedGame.onlineMaxPlayers !== undefined) {
                    // If we have online max but don't support online, enable online support
                    updateData.supportsOnline = true;
                    if (enrichedGame.onlineMaxPlayers > newOverallMax) {
                        newOverallMax = enrichedGame.onlineMaxPlayers;
                    }
                    updateData.onlineMaxPlayers = enrichedGame.onlineMaxPlayers;
                }
                
                // Handle local max players - must be <= overall max and only set if supportsLocal
                if (newSupportsLocal && enrichedGame.localMaxPlayers !== undefined) {
                    // If local max exceeds overall max, extend overall max
                    if (enrichedGame.localMaxPlayers > newOverallMax) {
                        newOverallMax = enrichedGame.localMaxPlayers;
                    }
                    updateData.localMaxPlayers = enrichedGame.localMaxPlayers;
                    updateData.supportsLocal = true;
                } else if (!newSupportsLocal && enrichedGame.localMaxPlayers !== undefined) {
                    // If we have local max but don't support local, enable local support
                    updateData.supportsLocal = true;
                    if (enrichedGame.localMaxPlayers > newOverallMax) {
                        newOverallMax = enrichedGame.localMaxPlayers;
                    }
                    updateData.localMaxPlayers = enrichedGame.localMaxPlayers;
                }
                
                // Update overall max if it changed
                if (newOverallMax !== existingOverallMax) {
                    updateData.overallMaxPlayers = newOverallMax;
                }
                
                // Also update supportsOnline/supportsLocal if they're explicitly set in metadata
                if (enrichedGame.supportsOnline !== undefined && !updateData.supportsOnline) {
                    updateData.supportsOnline = enrichedGame.supportsOnline;
                    // If disabling online support, clear mode-specific values
                    if (!enrichedGame.supportsOnline) {
                        updateData.onlineMinPlayers = null;
                        updateData.onlineMaxPlayers = null;
                    }
                }
                if (enrichedGame.supportsLocal !== undefined && !updateData.supportsLocal) {
                    updateData.supportsLocal = enrichedGame.supportsLocal;
                    // If disabling local support, clear mode-specific values
                    if (!enrichedGame.supportsLocal) {
                        updateData.localMinPlayers = null;
                        updateData.localMaxPlayers = null;
                    }
                }
                
                if (Object.keys(updateData).length > 0) {
                    try {
                        await gameTitleService.updateGameTitle(mapping.gameTitleId, updateData);
                        enrichedCount++;
                    } catch (updateError) {
                        // If validation still fails, skip this game but continue with others
                        if (updateError instanceof PlayerProfileValidationError) {
                            console.warn(`Skipping enrichment for "${game.name}" due to validation error: ${updateError.message}`);
                        } else {
                            throw updateError;
                        }
                    }
                }
            } catch (error) {
                // Log error but continue with other games (resilient to individual failures)
                console.error(`Failed to enrich game "${game.name}":`, error);
            }
        }
        
        console.log(`Background metadata enrichment completed: ${enrichedCount}/${games.length} games enriched, ${skippedCount} skipped (job ${jobId})`);
        
        // Mark job as completed
        await syncJobService.completeSyncJob(jobId, {
            entriesProcessed: games.length,
            entriesAdded: 0,
            entriesUpdated: enrichedCount,
        });
    } catch (error) {
        console.error(`Background metadata enrichment failed (job ${jobId}):`, error);
        await syncJobService.failSyncJob(jobId, error instanceof Error ? error.message : 'Metadata enrichment failed');
        throw error;
    }
}

/**
 * Soft-remove entries not seen in the current import
 * Sets isInstalled to false for items that were previously synced but are not in the current batch
 */
async function softRemoveUnseenEntries(
    accountId: string,
    provider: string,
    seenEntitlementKeys: Set<string>,
    isAggregator: boolean
): Promise<number> {
    // Get all library entries for this account
    const allEntries = await externalLibraryEntryService.getLibraryEntriesByAccountId(accountId);
    
    // Find entries not in the current import batch
    const unseenEntries = allEntries.filter(entry => !seenEntitlementKeys.has(entry.externalGameId));
    
    if (unseenEntries.length === 0) {
        return 0;
    }
    
    // Mark unseen entries as not installed (soft removal)
    for (const entry of unseenEntries) {
        // Update library entry - preserve existing data except isInstalled
        await externalLibraryEntryService.upsertLibraryEntry({
            externalAccountId: accountId,
            externalGameId: entry.externalGameId,
            externalGameName: entry.externalGameName,
            playtimeMinutes: entry.playtimeMinutes,
            lastPlayedAt: entry.lastPlayedAt,
            rawPayload: entry.rawPayload,
            isInstalled: false,
        });
        
        // Update corresponding item
        if (isAggregator) {
            const item = await itemService.findItemByAggregatorEntitlementKey(provider, accountId, entry.externalGameId);
            if (item) {
                await itemService.updateItem(item.id, {isInstalled: false});
            }
        } else {
            const item = await itemService.findGameItemByExternalId(accountId, entry.externalGameId);
            if (item) {
                await itemService.updateItem(item.id, {isInstalled: false});
            }
        }
    }
    
    return unseenEntries.length;
}
