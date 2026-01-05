/**
 * Game Sync Service
 * Handles synchronization of game libraries from external providers
 * 
 * Key features:
 * - Automatic game title and release creation from connector metadata
 * - Automatic digital copy creation for synced games
 * - No manual mapping required - games are imported automatically
 * - Scheduled sync support for periodic execution
 * 
 * Game copies are stored as Items with type=GAME_DIGITAL,
 * using the existing Item entity instead of a separate GameCopy entity.
 */

import {connectorRegistry} from './connectors/ConnectorRegistry';
import {ExternalGame} from './connectors/ConnectorInterface';
import * as externalAccountService from '../database/services/ExternalAccountService';
import * as externalLibraryEntryService from '../database/services/ExternalLibraryEntryService';
import * as gameMappingService from '../database/services/GameExternalMappingService';
import * as gameTitleService from '../database/services/GameTitleService';
import * as gameReleaseService from '../database/services/GameReleaseService';
import * as itemService from '../database/services/ItemService';
import * as syncJobService from '../database/services/SyncJobService';
import {
    GameProvider, 
    GameCopyType, 
    MappingStatus, 
    GameType, 
    GamePlatform
} from '../../types/InventoryEnums';

export interface SyncStats {
    entriesProcessed: number;
    entriesAdded: number;
    entriesUpdated: number;
    titlesCreated: number;
    copiesCreated: number;
}

// Map provider to default platform
const providerPlatformMap: Record<GameProvider, GamePlatform> = {
    [GameProvider.STEAM]: GamePlatform.PC,
    [GameProvider.EPIC]: GamePlatform.PC,
    [GameProvider.GOG]: GamePlatform.PC,
    [GameProvider.XBOX]: GamePlatform.XBOX_SERIES,
    [GameProvider.PLAYSTATION]: GamePlatform.PS5,
    [GameProvider.NINTENDO]: GamePlatform.SWITCH,
    [GameProvider.ORIGIN]: GamePlatform.PC,
    [GameProvider.UBISOFT]: GamePlatform.PC,
    [GameProvider.OTHER]: GamePlatform.OTHER,
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
        
        // Sync library
        const result = await connector.syncLibrary(account.tokenRef || '');
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
 * 1. Create/update library entry snapshot
 * 2. Check if we have an existing mapping
 * 3. If no mapping exists, automatically create game title + release from metadata
 * 4. Create/update the digital copy item
 */
async function processGamesWithAutoCreate(
    accountId: string,
    provider: GameProvider,
    games: ExternalGame[],
    ownerId: number
): Promise<SyncStats> {
    let entriesAdded = 0;
    let entriesUpdated = 0;
    let titlesCreated = 0;
    let copiesCreated = 0;
    
    const platform = providerPlatformMap[provider] || GamePlatform.OTHER;
    
    for (const game of games) {
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
        
        // Step 2: Get or create mapping with auto-creation
        let mapping = await gameMappingService.getMappingByExternalId(
            provider,
            game.externalGameId,
            ownerId
        );
        
        // Step 3: If no mapping exists or mapping is pending, auto-create
        if (!mapping || mapping.status === MappingStatus.PENDING) {
            const {title, release} = await autoCreateGameFromMetadata(game, provider, platform, ownerId);
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
        
        // Step 5: Create or update the digital copy
        if (mapping?.gameReleaseId) {
            const existingItem = await itemService.findGameItemByExternalId(
                accountId,
                game.externalGameId
            );
            
            if (!existingItem) {
                // Create digital game item
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
                });
                copiesCreated++;
            } else {
                // Update existing item with latest data
                await itemService.updateItem(existingItem.id, {
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
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
 * Automatically create a game title and release from connector metadata
 */
async function autoCreateGameFromMetadata(
    game: ExternalGame,
    _provider: GameProvider,
    platform: GamePlatform,
    ownerId: number
): Promise<{title: Awaited<ReturnType<typeof gameTitleService.createGameTitle>>; release: Awaited<ReturnType<typeof gameReleaseService.createGameRelease>>}> {
    // Create game title with metadata from connector
    const title = await gameTitleService.createGameTitle({
        name: game.name,
        type: GameType.VIDEO_GAME,
        description: game.description || null,
        coverImageUrl: game.coverImageUrl || null,
        overallMinPlayers: game.overallMinPlayers ?? 1,
        overallMaxPlayers: game.overallMaxPlayers ?? 1,
        supportsOnline: game.supportsOnline ?? false,
        supportsLocal: game.supportsLocal ?? false,
        supportsPhysical: game.supportsPhysical ?? false,
        onlineMinPlayers: game.onlineMinPlayers ?? null,
        onlineMaxPlayers: game.onlineMaxPlayers ?? null,
        localMinPlayers: game.localMinPlayers ?? null,
        localMaxPlayers: game.localMaxPlayers ?? null,
        physicalMinPlayers: null,
        physicalMaxPlayers: null,
        ownerId,
    });
    
    // Create a release for this platform
    const release = await gameReleaseService.createGameRelease({
        gameTitleId: title.id,
        platform,
        releaseDate: game.releaseDate || null,
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
