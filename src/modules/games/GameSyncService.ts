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
import {GameMetadata, mergePlayerCounts} from './metadata/MetadataProviderInterface';
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
import {
    GameCopyType, 
    MappingStatus, 
    GameType,
    SyncStatus
} from '../../types/InventoryEnums';

// Initialize metadata providers
initializeMetadataProviders();

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
 * Process synced games with automatic game title and copy creation
 * 
 * For each game from the connector:
 * 1. Enrich with metadata from provider (player info, multiplayer flags)
 * 2. Create/update library entry snapshot
 * 3. Check if we have an existing mapping
 * 4. If no mapping exists, automatically create game title + release from metadata
 * 5. Create/update the digital copy item
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
    
    // Pre-fetch metadata for all games to enrich player info
    // Uses appIds from the games to fetch from appropriate metadata provider
    const metadataCache = await fetchMetadataForGames(games, provider);
    
    for (const game of games) {
        // Enrich game with metadata from provider
        const enrichedGame = enrichGameWithMetadata(game, metadataCache.get(game.externalGameId));
        
        // Step 1: Upsert library entry (snapshot of external data)
        const existingEntry = await externalLibraryEntryService.getLibraryEntryByExternalId(
            accountId, 
            enrichedGame.externalGameId
        );
        
        await externalLibraryEntryService.upsertLibraryEntry({
            externalAccountId: accountId,
            externalGameId: enrichedGame.externalGameId,
            externalGameName: enrichedGame.name,
            rawPayload: enrichedGame.rawPayload,
            playtimeMinutes: enrichedGame.playtimeMinutes,
            lastPlayedAt: enrichedGame.lastPlayedAt,
            isInstalled: enrichedGame.isInstalled,
        });
        
        if (existingEntry) {
            entriesUpdated++;
        } else {
            entriesAdded++;
        }
        
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
            const {title, release, titleCreated} = await autoCreateGameFromMetadata(enrichedGame, gamePlatform, ownerId);
            if (titleCreated) titlesCreated++;
            
            // Create or update the mapping
            if (mapping) {
                await gameMappingService.updateMapping(mapping.id, {
                    gameTitleId: title.id,
                    gameReleaseId: release.id,
                    status: MappingStatus.MAPPED,
                });
            } else {
                await gameMappingService.createMapping({
                    provider,
                    externalGameId: enrichedGame.externalGameId,
                    externalGameName: enrichedGame.name,
                    gameTitleId: title.id,
                    gameReleaseId: release.id,
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
        
        // Step 5: Create or update the digital copy
        if (mapping?.gameReleaseId) {
            const existingItem = await itemService.findGameItemByExternalId(
                accountId,
                enrichedGame.externalGameId
            );
            
            if (!existingItem) {
                // Create digital game item
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
            } else {
                // Update existing item with latest data (including storeUrl in case generation improved)
                await itemService.updateItem(existingItem.id, {
                    playtimeMinutes: enrichedGame.playtimeMinutes,
                    lastPlayedAt: enrichedGame.lastPlayedAt,
                    isInstalled: enrichedGame.isInstalled,
                    storeUrl: enrichedGame.storeUrl,
                });
            }
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
 * Fetch metadata for all games using available providers
 * 
 * Strategy (with improved rate limit handling):
 * 1. Fetch from primary provider (e.g., Steam for Steam games) with batching
 * 2. For games missing player count data, enrich from IGDB (which has accurate counts)
 * 3. For games without any metadata, fall back to other providers
 * 
 * Rate limit handling:
 * - We wait for our OWN rate limit (our request queue) but NOT external provider rate limits
 * - If provider returns 429 (rate limited), immediately fallback to next provider
 * - This prevents hour-long waiting times for external rate limits
 * 
 * This ensures we get the best data from each provider:
 * - Steam: Basic info, description, images, multiplayer flags, store URLs (valid!)
 * - IGDB: Accurate player counts (onlineMax, localMax, etc.)
 * - RAWG: Fallback for games not in other providers
 */
async function fetchMetadataForGames(
    games: ExternalGame[],
    provider: string
): Promise<Map<string, GameMetadata>> {
    const metadataCache = new Map<string, GameMetadata>();
    const externalIds = games.map(g => g.externalGameId);
    
    // Get primary provider (matching the game source, e.g., Steam for Steam games)
    const primaryProvider = metadataProviderRegistry.getById(provider);
    
    // Get IGDB for accurate player counts
    const igdbProvider = metadataProviderRegistry.getById('igdb');
    
    // Get RAWG as fallback
    const rawgProvider = metadataProviderRegistry.getById('rawg');
    
    // Track rate-limited providers to avoid retrying them
    const rateLimitedProviders = new Set<string>();
    
    // Step 1: Try primary provider first (batched for performance)
    if (primaryProvider) {
        console.log(`Fetching metadata from primary provider: ${provider} for ${externalIds.length} games`);
        try {
            const metadataList = await primaryProvider.getGamesMetadata(externalIds);
            for (const meta of metadataList) {
                if (meta) {
                    metadataCache.set(meta.externalId, meta);
                }
            }
            console.log(`Primary provider returned metadata for ${metadataCache.size}/${externalIds.length} games`);
        } catch (error) {
            // Check if this is a rate limit error
            const isRateLimit = error instanceof Error && (
                error.message.includes('429') ||
                error.message.includes('rate') ||
                error.message.includes('Too Many')
            );
            
            if (isRateLimit) {
                console.warn(`Primary provider ${provider} rate limited, will fallback to other providers`);
                rateLimitedProviders.add(provider);
            } else {
                console.warn(`Primary provider ${provider} failed:`, error);
            }
        }
    }
    
    // Step 2: Query IGDB for accurate multiplayer info and player counts
    // IGDB has the most accurate multiplayer data.
    // If IGDB is rate limited, immediately fallback to RAWG - don't wait for external rate limits
    if (igdbProvider && !rateLimitedProviders.has('igdb')) {
        const gamesNeedingIgdbData: ExternalGame[] = [];
        
        for (const game of games) {
            const cachedMeta = metadataCache.get(game.externalGameId);
            
            // Query IGDB for games that need player count data
            const needsIgdbData = !cachedMeta || (
                cachedMeta.playerInfo?.onlineMaxPlayers === undefined ||
                cachedMeta.playerInfo?.localMaxPlayers === undefined
            );
            
            if (needsIgdbData) {
                gamesNeedingIgdbData.push(game);
            }
        }
        
        if (gamesNeedingIgdbData.length > 0) {
            console.log(`Querying IGDB for multiplayer info on ${gamesNeedingIgdbData.length} games`);
            
            // Use timeout to limit overall processing time
            const igdbTimeoutMs = settings.value.igdbQueryTimeoutMs || 300000; // 5 minutes default
            const startTime = Date.now();
            let queriesCompleted = 0;
            let consecutiveErrors = 0;
            const MAX_CONSECUTIVE_ERRORS = 5;
            
            for (const game of gamesNeedingIgdbData) {
                // Check time limit
                const elapsed = Date.now() - startTime;
                if (elapsed >= igdbTimeoutMs) {
                    console.log(`IGDB query time limit reached (${igdbTimeoutMs}ms), completed ${queriesCompleted}/${gamesNeedingIgdbData.length} queries`);
                    break;
                }
                
                // Stop if too many consecutive errors (likely API issues or rate limited)
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.log(`IGDB: ${MAX_CONSECUTIVE_ERRORS} consecutive errors, falling back to RAWG`);
                    rateLimitedProviders.add('igdb');
                    break;
                }
                
                try {
                    // Search IGDB by game name
                    const searchResults = await igdbProvider.searchGames(game.name, 1);
                    if (searchResults.length > 0) {
                        const igdbMeta = await igdbProvider.getGameMetadata(searchResults[0].externalId);
                        if (igdbMeta?.playerInfo) {
                            const existingMeta = metadataCache.get(game.externalGameId);
                            if (existingMeta) {
                                // Merge IGDB player counts into existing metadata
                                metadataCache.set(game.externalGameId, {
                                    ...existingMeta,
                                    playerInfo: mergePlayerCounts(existingMeta.playerInfo, igdbMeta.playerInfo),
                                });
                            } else {
                                // No existing metadata, use IGDB as primary
                                metadataCache.set(game.externalGameId, {
                                    ...igdbMeta,
                                    externalId: game.externalGameId, // Keep original ID
                                });
                            }
                        }
                    }
                    queriesCompleted++;
                    consecutiveErrors = 0; // Reset on success
                } catch (error) {
                    // Check if rate limited - immediately fallback, don't wait
                    const isRateLimit = error instanceof Error && (
                        error.message.includes('429') ||
                        error.message.includes('rate') ||
                        error.message.includes('Too Many')
                    );
                    
                    if (isRateLimit) {
                        console.log('IGDB rate limited, immediately falling back to RAWG');
                        rateLimitedProviders.add('igdb');
                        break; // Don't wait, use fallback provider
                    } else {
                        consecutiveErrors++;
                    }
                }
            }
            
            console.log(`IGDB enrichment completed: ${queriesCompleted} queries in ${Date.now() - startTime}ms`);
        }
    }
    
    // Step 3: For games without metadata, try RAWG (fallback provider)
    // Skip rate-limited providers
    const missingIds = externalIds.filter(id => !metadataCache.has(id));
    
    if (missingIds.length > 0 && rawgProvider && !rateLimitedProviders.has('rawg')) {
        console.log(`Attempting RAWG fallback for ${missingIds.length} games without metadata`);
        
        const gamesNeedingMetadata = games.filter(g => missingIds.includes(g.externalGameId));
        let consecutiveErrors = 0;
        const MAX_ERRORS = 5;
        
        for (const game of gamesNeedingMetadata) {
            if (metadataCache.has(game.externalGameId)) continue;
            if (consecutiveErrors >= MAX_ERRORS) {
                console.log(`RAWG: ${MAX_ERRORS} consecutive errors, stopping fallback`);
                break;
            }
            
            try {
                // Search for game by name
                const searchResults = await rawgProvider.searchGames(game.name, 1);
                if (searchResults.length > 0) {
                    const metadata = await rawgProvider.getGameMetadata(searchResults[0].externalId);
                    if (metadata) {
                        // Store with original game's externalId for lookup
                        metadataCache.set(game.externalGameId, {
                            ...metadata,
                            externalId: game.externalGameId, // Keep original ID for mapping
                        });
                    }
                }
                consecutiveErrors = 0;
            } catch (error) {
                // Check for rate limit
                const isRateLimit = error instanceof Error && (
                    error.message.includes('429') ||
                    error.message.includes('rate') ||
                    error.message.includes('Too Many')
                );
                
                if (isRateLimit) {
                    console.log('RAWG rate limited, stopping fallback');
                    break;
                }
                consecutiveErrors++;
            }
        }
    }
    
    console.log(`Total metadata fetched: ${metadataCache.size}/${externalIds.length} games`);
    return metadataCache;
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
): Promise<{title: Awaited<ReturnType<typeof gameTitleService.createGameTitle>>; release: Awaited<ReturnType<typeof gameReleaseService.createGameRelease>>; titleCreated: boolean; releaseCreated: boolean}> {
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
    
    // Pre-fetch all existing items for this account to reduce database queries
    const existingItemsMap = new Map<string, Awaited<ReturnType<typeof itemService.findGameItemByExternalId>>>();
    for (const game of games) {
        const existing = await itemService.findGameItemByExternalId(accountId, game.externalGameId);
        if (existing) {
            existingItemsMap.set(game.externalGameId, existing);
        }
    }
    
    console.log(`Smart sync: ${existingItemsMap.size} games already have copies, ${games.length - existingItemsMap.size} need full processing`);
    
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
                // Only update mutable fields (playtime, install status, store URL)
                await itemService.updateItem(existingItem.id, {
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
                    storeUrl: game.storeUrl,
                });
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
                const {title, release, titleCreated} = await autoCreateGameFromMetadata(game, gamePlatform, ownerId);
                if (titleCreated) titlesCreated++;
                
                // Create or update the mapping
                if (mapping) {
                    await gameMappingService.updateMapping(mapping.id, {
                        gameTitleId: title.id,
                        gameReleaseId: release.id,
                        status: MappingStatus.MAPPED,
                    });
                } else {
                    await gameMappingService.createMapping({
                        provider,
                        externalGameId: game.externalGameId,
                        externalGameName: game.name,
                        gameTitleId: title.id,
                        gameReleaseId: release.id,
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
        // Fetch metadata for all games
        const metadataCache = await fetchMetadataForGames(games, provider);
        
        let enrichedCount = 0;
        
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
                
                if (!mapping?.gameTitleId) continue;
                
                // Enrich game title with metadata
                const enrichedGame = enrichGameWithMetadata(game, metadata);
                
                // Update the game title with enriched data
                const updateData: Record<string, unknown> = {};
                
                if (enrichedGame.description) {
                    updateData.description = enrichedGame.description;
                }
                if (enrichedGame.overallMinPlayers !== undefined) {
                    updateData.overallMinPlayers = enrichedGame.overallMinPlayers;
                }
                if (enrichedGame.overallMaxPlayers !== undefined) {
                    updateData.overallMaxPlayers = enrichedGame.overallMaxPlayers;
                }
                if (enrichedGame.supportsOnline !== undefined) {
                    updateData.supportsOnline = enrichedGame.supportsOnline;
                }
                if (enrichedGame.supportsLocal !== undefined) {
                    updateData.supportsLocal = enrichedGame.supportsLocal;
                }
                if (enrichedGame.onlineMaxPlayers !== undefined) {
                    updateData.onlineMaxPlayers = enrichedGame.onlineMaxPlayers;
                }
                if (enrichedGame.localMaxPlayers !== undefined) {
                    updateData.localMaxPlayers = enrichedGame.localMaxPlayers;
                }
                
                if (Object.keys(updateData).length > 0) {
                    await gameTitleService.updateGameTitle(mapping.gameTitleId, updateData);
                    enrichedCount++;
                }
            } catch (error) {
                // Log error but continue with other games
                console.error(`Failed to enrich game "${game.name}":`, error);
            }
        }
        
        console.log(`Background metadata enrichment completed: ${enrichedCount}/${games.length} games enriched (job ${jobId})`);
        
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
