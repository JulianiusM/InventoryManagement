/**
 * Game Sync Service
 * Handles synchronization of game libraries from external providers
 */

import {connectorRegistry} from './connectors/ConnectorRegistry';
import {ExternalGame} from './connectors/ConnectorInterface';
import * as externalAccountService from '../database/services/ExternalAccountService';
import * as externalLibraryEntryService from '../database/services/ExternalLibraryEntryService';
import * as gameMappingService from '../database/services/GameExternalMappingService';
import * as gameCopyService from '../database/services/GameCopyService';
import * as syncJobService from '../database/services/SyncJobService';
import {GameProvider, GameCopyType, MappingStatus} from '../../types/InventoryEnums';

export interface SyncStats {
    entriesProcessed: number;
    entriesAdded: number;
    entriesUpdated: number;
    unmappedCount: number;
}

/**
 * Sync a user's external account library
 * Idempotent: reruns do not duplicate copies
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
        const syncStartTime = new Date();
        
        // Sync library
        const result = await connector.syncLibrary(account.tokenRef || '');
        if (!result.success) {
            await syncJobService.failSyncJob(job.id, result.error || 'Sync failed');
            return {success: false, error: result.error, jobId: job.id};
        }
        
        // Process games
        const stats = await processGames(
            account.id,
            account.provider,
            result.games,
            ownerId,
            syncStartTime
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
 * Process synced games and update library entries
 */
async function processGames(
    accountId: string,
    provider: GameProvider,
    games: ExternalGame[],
    ownerId: number,
    syncStartTime: Date
): Promise<SyncStats> {
    let entriesAdded = 0;
    let entriesUpdated = 0;
    let unmappedCount = 0;
    
    for (const game of games) {
        // Upsert library entry
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
        
        // Check if we have a mapping for this game
        const mapping = await gameMappingService.getMappingByExternalId(
            provider,
            game.externalGameId,
            ownerId
        );
        
        if (mapping && mapping.status === MappingStatus.MAPPED && mapping.gameReleaseId) {
            // Check if we already have a copy for this game
            const existingCopy = await gameCopyService.findGameCopyByExternalId(
                accountId,
                game.externalGameId
            );
            
            if (!existingCopy) {
                // Create digital copy
                await gameCopyService.createGameCopy({
                    gameReleaseId: mapping.gameReleaseId,
                    copyType: GameCopyType.DIGITAL_LICENSE,
                    externalAccountId: accountId,
                    externalGameId: game.externalGameId,
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
                    lendable: false, // Digital licenses are not lendable by default
                    ownerId: ownerId,
                });
            } else {
                // Update existing copy with latest data
                await gameCopyService.updateGameCopy(existingCopy.id, {
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
                });
            }
        } else if (!mapping) {
            // Create pending mapping for manual resolution
            await gameMappingService.upsertMapping({
                provider: provider,
                externalGameId: game.externalGameId,
                externalGameName: game.name,
                status: MappingStatus.PENDING,
                ownerId: ownerId,
            });
            unmappedCount++;
        }
    }
    
    // Soft-removal: mark entries not seen as "not seen"
    // (We don't hard delete; just leave them with old lastSeenAt timestamp)
    // Users can check lastSeenAt to see which games are no longer in library
    
    return {
        entriesProcessed: games.length,
        entriesAdded,
        entriesUpdated,
        unmappedCount,
    };
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
}> {
    const account = await externalAccountService.getExternalAccountById(accountId);
    const latestJob = await syncJobService.getLatestSyncJob(accountId);
    
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
    };
}
