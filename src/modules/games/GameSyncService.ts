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
 * 
 * Game copies are stored as Items with type=GAME_DIGITAL,
 * using the existing Item entity instead of a separate GameCopy entity.
 */

import {connectorRegistry} from './connectors/ConnectorRegistry';
import {ConnectorCredentials, ExternalGame} from './connectors/ConnectorInterface';
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
import {
    GameCopyType, 
    MappingStatus, 
    GameType
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
        
        // Process games with automatic creation
        const stats = await processGamesWithAutoCreate(
            account.id,
            account.provider,
            result.games,
            ownerId
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
 */
async function processGamesWithAutoCreate(
    accountId: string,
    provider: string,
    games: ExternalGame[],
    ownerId: number
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
            const {title, release} = await autoCreateGameFromMetadata(enrichedGame, gamePlatform, ownerId);
            titlesCreated++;
            
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
                });
                copiesCreated++;
            } else {
                // Update existing item with latest data
                await itemService.updateItem(existingItem.id, {
                    playtimeMinutes: enrichedGame.playtimeMinutes,
                    lastPlayedAt: enrichedGame.lastPlayedAt,
                    isInstalled: enrichedGame.isInstalled,
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
 * Strategy:
 * 1. Fetch from primary provider (e.g., Steam for Steam games)
 * 2. For games missing player count data, enrich from IGDB (which has accurate counts)
 * 3. For games without any metadata, fall back to other providers
 * 
 * This ensures we get the best data from each provider:
 * - Steam: Basic info, description, images, multiplayer flags
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
    
    // Get all providers for fallback
    const allProviders = metadataProviderRegistry.getAll();
    
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
            console.warn(`Primary provider ${provider} failed:`, error);
        }
    }
    
    // Step 2: Always query IGDB for accurate multiplayer info and player counts
    // IGDB has the most accurate multiplayer data - Steam/RAWG only know if a game
    // supports multiplayer but not player counts. We query IGDB for ALL games to:
    // 1. Get accurate player counts (onlineMax, localMax, etc.)
    // 2. Verify/correct multiplayer capabilities
    // 3. Discover multiplayer support Steam might have missed
    if (igdbProvider) {
        // Get games that don't have complete player info from primary provider
        const gamesNeedingIgdbData: ExternalGame[] = [];
        
        for (const game of games) {
            const cachedMeta = metadataCache.get(game.externalGameId);
            
            // Query IGDB for games that:
            // 1. Have no metadata at all
            // 2. Have metadata but missing any player count (onlineMaxPlayers OR localMaxPlayers)
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
            
            // Time-based limiting: use configurable timeout from settings
            // IGDB allows 4 req/sec, so we can do roughly 240 queries per minute
            // Default is 60000ms (1 minute), configurable via IGDB_QUERY_TIMEOUT_MS setting
            const igdbTimeoutMs = settings.value.igdbQueryTimeoutMs || 60000;
            const startTime = Date.now();
            let queriesCompleted = 0;
            
            for (const game of gamesNeedingIgdbData) {
                // Check time limit
                const elapsed = Date.now() - startTime;
                if (elapsed >= igdbTimeoutMs) {
                    console.log(`IGDB query time limit reached (${igdbTimeoutMs}ms), completed ${queriesCompleted}/${gamesNeedingIgdbData.length} queries`);
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
                } catch {
                    // Individual enrichment failed, continue with existing data
                }
            }
            
            console.log(`IGDB enrichment completed: ${queriesCompleted} queries in ${Date.now() - startTime}ms`);
        }
    }
    
    // Step 3: For games without metadata, try secondary providers
    const missingIds = externalIds.filter(id => !metadataCache.has(id));
    
    if (missingIds.length > 0) {
        console.log(`Attempting fallback for ${missingIds.length} games without metadata`);
        
        for (const secondaryProvider of allProviders) {
            const manifest = secondaryProvider.getManifest();
            if (manifest.id === provider) continue; // Skip primary
            
            // For non-matching providers, we need to search by game name
            // This is slower but provides fallback coverage
            const gamesNeedingMetadata = games.filter(g => missingIds.includes(g.externalGameId));
            
            for (const game of gamesNeedingMetadata) {
                if (metadataCache.has(game.externalGameId)) continue;
                
                try {
                    // Search for game by name
                    const searchResults = await secondaryProvider.searchGames(game.name, 1);
                    if (searchResults.length > 0) {
                        const metadata = await secondaryProvider.getGameMetadata(searchResults[0].externalId);
                        if (metadata) {
                            // Store with original game's externalId for lookup
                            metadataCache.set(game.externalGameId, {
                                ...metadata,
                                externalId: game.externalGameId, // Keep original ID for mapping
                            });
                        }
                    }
                } catch {
                    // Individual game lookup failed, continue
                }
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
 */
async function autoCreateGameFromMetadata(
    game: ExternalGame,
    platform: string,
    ownerId: number
): Promise<{title: Awaited<ReturnType<typeof gameTitleService.createGameTitle>>; release: Awaited<ReturnType<typeof gameReleaseService.createGameRelease>>}> {
    // Ensure the platform exists in the database (auto-create if missing)
    await platformService.getOrCreatePlatform(platform, ownerId);
    
    // Extract edition from game name (e.g., "Game - GOTY Edition" -> "Game" + "GOTY Edition")
    const {baseName, edition} = extractEdition(game.name);
    
    // Determine player info with sensible defaults for multiplayer games
    const supportsOnline = game.supportsOnline ?? false;
    const supportsLocal = game.supportsLocal ?? false;
    const hasMultiplayer = hasMultiplayerSupport(game);
    
    // Create game title with metadata from connector
    const title = await gameTitleService.createGameTitle({
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
    
    // Create a release for this platform with edition info
    const release = await gameReleaseService.createGameRelease({
        gameTitleId: title.id,
        platform,
        releaseDate: game.releaseDate || null,
        edition, // Store detected edition
        ownerId,
    });
    
    return {title, release};
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
