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
 * 
 * ARCHITECTURE:
 * - GameProcessor (./sync/GameProcessor.ts) - SINGLE implementation for game processing
 * - MetadataFetcher (./sync/MetadataFetcher.ts) - Centralized metadata fetching with rate limiting
 * - MetadataService (./metadata/MetadataService.ts) - Centralized metadata application
 * - Both fetch-style and push-style connectors use processGameBatch() from GameProcessor
 * - Metadata enrichment is handled asynchronously after batch processing
 */

import {connectorRegistry} from './connectors/ConnectorRegistry';
import {ConnectorCredentials, ExternalGame, ImportPreprocessResult, isPushConnector} from './connectors/ConnectorInterface';
import {initializeMetadataProviders} from './metadata/MetadataProviderRegistry';
import {GameMetadata} from './metadata/MetadataProviderInterface';
import * as externalAccountService from '../database/services/ExternalAccountService';
import * as externalLibraryEntryService from '../database/services/ExternalLibraryEntryService';
import * as gameMappingService from '../database/services/GameExternalMappingService';
import * as gameTitleService from '../database/services/GameTitleService';
import * as itemService from '../database/services/ItemService';
import * as syncJobService from '../database/services/SyncJobService';
import * as connectorDeviceService from '../database/services/ConnectorDeviceService';
import {PlayerProfileValidationError} from '../database/services/GameValidationService';
import {
    SyncStatus
} from '../../types/InventoryEnums';
import {GameTitle} from '../database/entities/gameTitle/GameTitle';
import {GameRelease} from '../database/entities/gameRelease/GameRelease';

// Import the unified game processor
import {
    processGameBatch,
    AutoCreateGameResult,
    ProcessingStats
} from './sync/GameProcessor';

// Import the centralized metadata fetcher
import {getMetadataFetcher} from './sync/MetadataFetcher';

// Re-export types for backwards compatibility
export {AutoCreateGameResult, ProcessingStats as SyncStats};

// Initialize metadata providers
initializeMetadataProviders();

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

// Store scheduled sync intervals (in-memory for now)
const scheduledSyncs = new Map<string, NodeJS.Timeout>();

// Get singleton metadata fetcher instance
const metadataFetcher = getMetadataFetcher();

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
): Promise<{success: boolean; stats?: ProcessingStats; error?: string; jobId: string}> {
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
        
        // Process games using the UNIFIED game processor
        // This is the SAME pipeline used by push-style connectors
        const stats = await processGameBatch(
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

// Import enrichGameWithMetadata from centralized MetadataService
import {enrichGameWithMetadata} from './metadata/MetadataService';

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
    
    // Step 1: Immediate processing using the UNIFIED game processor
    // This is the SAME pipeline used by fetch-style connectors
    const stats = await processGameBatch(
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
