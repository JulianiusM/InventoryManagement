/**
 * Playnite Import Service
 * Handles ingestion of Playnite library exports and conversion to game module records
 * 
 * Key features:
 * - Transparent aggregator: tracks both Playnite source and original provider
 * - Idempotent imports using entitlementKey
 * - Soft removal for missing entries
 * - Creates mapping queue entries for unresolved games
 */

import * as externalAccountService from '../database/services/ExternalAccountService';
import * as externalLibraryEntryService from '../database/services/ExternalLibraryEntryService';
import * as gameMappingService from '../database/services/GameExternalMappingService';
import * as gameTitleService from '../database/services/GameTitleService';
import * as gameReleaseService from '../database/services/GameReleaseService';
import * as itemService from '../database/services/ItemService';
import * as connectorDeviceService from '../database/services/ConnectorDeviceService';
import * as platformService from '../database/services/PlatformService';
import {
    GameCopyType,
    MappingStatus,
    GameType
} from '../../types/InventoryEnums';
import {AppDataSource} from '../database/dataSource';
import {ExternalLibraryEntry} from '../database/entities/externalLibraryEntry/ExternalLibraryEntry';
import {Item} from '../database/entities/item/Item';
import {ExternalAccount} from '../database/entities/externalAccount/ExternalAccount';
import {normalizeProviderName} from './PlayniteProviders';

export interface PlaynitePlugin {
    pluginId: string;
    name: string;
}

export interface PlayniteGame {
    entitlementKey?: string;
    playniteDatabaseId: string;
    name: string;
    isCustomGame?: boolean;
    hidden?: boolean;
    installed?: boolean;
    installDirectory?: string;
    playtimeSeconds?: number;
    lastActivity?: string;
    platforms?: string[];
    sourceId?: string;
    sourceName?: string;
    originalProviderPluginId: string;
    originalProviderName: string;
    originalProviderGameId?: string;
    raw?: object;
}

export interface PlayniteImportPayload {
    aggregator: 'playnite';
    exportedAt: string;
    plugins: PlaynitePlugin[];
    games: PlayniteGame[];
}

export interface ImportCounts {
    received: number;
    created: number;
    updated: number;
    unchanged: number;
    softRemoved: number;
    needsReview: number;
}

export interface ImportWarning {
    code: string;
    count: number;
}

export interface PlayniteImportResult {
    deviceId: string;
    importedAt: string;
    counts: ImportCounts;
    warnings: ImportWarning[];
}

/**
 * Convert playtime from seconds to minutes
 */
function convertPlaytimeToMinutes(seconds: number | undefined): number | null {
    return seconds ? Math.round(seconds / 60) : null;
}

/**
 * Parse lastActivity date string
 */
function parseLastActivity(lastActivity: string | undefined): Date | null {
    return lastActivity ? new Date(lastActivity) : null;
}

/**
 * Derive entitlement key if not provided
 */
function deriveEntitlementKey(game: PlayniteGame): {key: string; needsReview: boolean} {
    if (game.entitlementKey) {
        return {key: game.entitlementKey, needsReview: false};
    }
    
    // Prefer playnite:<pluginId>:<gameId>
    if (game.originalProviderPluginId && game.originalProviderGameId) {
        return {
            key: `playnite:${game.originalProviderPluginId}:${game.originalProviderGameId}`,
            needsReview: false,
        };
    }
    
    // Fallback to playnite-db:<playniteDatabaseId>
    return {
        key: `playnite-db:${game.playniteDatabaseId}`,
        needsReview: true,
    };
}

/**
 * Process a Playnite import for a device
 */
export async function processPlayniteImport(
    deviceId: string,
    userId: number,
    payload: PlayniteImportPayload
): Promise<PlayniteImportResult> {
    const importedAt = new Date().toISOString();
    const counts: ImportCounts = {
        received: payload.games.length,
        created: 0,
        updated: 0,
        unchanged: 0,
        softRemoved: 0,
        needsReview: 0,
    };
    const warningCounts: Record<string, number> = {};
    
    // Get the Playnite external account for this device
    let playniteAccount = await getPlayniteAccountForDevice(deviceId, userId);
    
    // Track which entitlement keys we've seen in this import
    const seenEntitlementKeys = new Set<string>();
    
    // Process each game
    for (const game of payload.games) {
        const {key: entitlementKey, needsReview: derivedNeedsReview} = deriveEntitlementKey(game);
        seenEntitlementKeys.add(entitlementKey);
        
        // Check for missing original game ID
        let needsReview = derivedNeedsReview;
        if (!game.originalProviderGameId) {
            warningCounts['MISSING_ORIGINAL_GAME_ID'] = (warningCounts['MISSING_ORIGINAL_GAME_ID'] || 0) + 1;
            needsReview = true;
        }
        
        if (needsReview) {
            counts.needsReview++;
        }
        
        // Upsert ExternalLibraryEntry
        const libraryEntryResult = await upsertLibraryEntry(
            playniteAccount.id,
            entitlementKey,
            game
        );
        
        // Upsert game copy (Item) with transparent aggregator origin
        const copyResult = await upsertGameCopy(
            playniteAccount.id,
            deviceId,
            entitlementKey,
            game,
            needsReview,
            userId
        );
        
        if (libraryEntryResult === 'created' || copyResult === 'created') {
            counts.created++;
        } else if (libraryEntryResult === 'updated' || copyResult === 'updated') {
            counts.updated++;
        } else {
            counts.unchanged++;
        }
    }
    
    // Soft removal: mark entries not in this import as inactive
    const softRemoved = await softRemoveUnseenEntries(
        playniteAccount.id,
        seenEntitlementKeys,
        importedAt
    );
    counts.softRemoved = softRemoved;
    
    // Update device last import time
    await connectorDeviceService.updateLastImportAt(deviceId);
    
    // Convert warning counts to array
    const warnings: ImportWarning[] = Object.entries(warningCounts).map(([code, count]) => ({
        code,
        count,
    }));
    
    return {
        deviceId,
        importedAt,
        counts,
        warnings,
    };
}

/**
 * Get the external account for a Playnite device
 * In the new architecture, devices are tied to accounts, so we just return the device's account
 */
async function getPlayniteAccountForDevice(deviceId: string, userId: number): Promise<ExternalAccount> {
    const device = await connectorDeviceService.getDeviceById(deviceId);
    if (!device) {
        throw new Error(`Playnite device not found: ${deviceId}`);
    }
    
    // The device already has a reference to its account
    if (!device.externalAccount) {
        throw new Error(`Device ${deviceId} has no linked account`);
    }
    
    // Verify ownership - handle case where owner relation is not loaded
    const ownerId = device.externalAccount.owner?.id;
    if (ownerId === undefined || ownerId === null) {
        throw new Error(`Device ${deviceId} has no account owner`);
    }
    
    if (ownerId !== userId) {
        throw new Error(`Device ${deviceId} belongs to another user`);
    }
    
    return device.externalAccount;
}

/**
 * Upsert ExternalLibraryEntry for a Playnite game
 */
async function upsertLibraryEntry(
    accountId: string,
    entitlementKey: string,
    game: PlayniteGame
): Promise<'created' | 'updated' | 'unchanged'> {
    const existing = await externalLibraryEntryService.getLibraryEntryByExternalId(
        accountId,
        entitlementKey
    );
    
    const playtimeMinutes = convertPlaytimeToMinutes(game.playtimeSeconds);
    const lastPlayedAt = parseLastActivity(game.lastActivity);
    
    if (existing) {
        // Check if anything changed
        const changed = 
            existing.externalGameName !== game.name ||
            existing.playtimeMinutes !== playtimeMinutes ||
            existing.isInstalled !== (game.installed ?? null);
        
        if (!changed) {
            // Just update lastSeenAt
            await externalLibraryEntryService.upsertLibraryEntry({
                externalAccountId: accountId,
                externalGameId: entitlementKey,
                externalGameName: game.name,
                rawPayload: game.raw,
                playtimeMinutes,
                lastPlayedAt,
                isInstalled: game.installed ?? null,
            });
            return 'unchanged';
        }
    }
    
    await externalLibraryEntryService.upsertLibraryEntry({
        externalAccountId: accountId,
        externalGameId: entitlementKey,
        externalGameName: game.name,
        rawPayload: game.raw,
        playtimeMinutes,
        lastPlayedAt,
        isInstalled: game.installed ?? null,
    });
    
    return existing ? 'updated' : 'created';
}

/**
 * Upsert game copy (Item) with transparent aggregator origin
 */
async function upsertGameCopy(
    accountId: string,
    deviceId: string,
    entitlementKey: string,
    game: PlayniteGame,
    needsReview: boolean,
    userId: number
): Promise<'created' | 'updated' | 'unchanged'> {
    const itemRepo = AppDataSource.getRepository(Item);
    
    // Find existing item by aggregator entitlement key
    const existingItem = await itemRepo.findOne({
        where: {
            aggregatorProviderId: 'playnite',
            aggregatorAccountId: accountId,
            aggregatorExternalGameId: entitlementKey,
        },
    });
    
    const playtimeMinutes = convertPlaytimeToMinutes(game.playtimeSeconds);
    const lastPlayedAt = parseLastActivity(game.lastActivity);
    const normalizedProvider = normalizeProviderName(game.originalProviderPluginId);
    
    if (existingItem) {
        // Check if update needed
        const changed = 
            existingItem.name !== game.name ||
            existingItem.playtimeMinutes !== playtimeMinutes ||
            existingItem.isInstalled !== (game.installed ?? null) ||
            existingItem.originalProviderName !== game.originalProviderName ||
            existingItem.originalProviderGameId !== (game.originalProviderGameId ?? null);
        
        if (!changed) {
            return 'unchanged';
        }
        
        // Update existing item
        await itemRepo.update({id: existingItem.id}, {
            name: game.name,
            playtimeMinutes,
            lastPlayedAt,
            isInstalled: game.installed ?? null,
            originalProviderName: game.originalProviderName,
            originalProviderGameId: game.originalProviderGameId ?? null,
            originalProviderNormalizedId: normalizedProvider,
            needsReview,
            updatedAt: new Date(),
        });
        
        return 'updated';
    }
    
    // Create new item - need to get or create release first
    const platform = game.platforms?.[0] || 'PC';
    await platformService.getOrCreatePlatform(platform, userId);
    
    // Try to find or create game title and release
    let releaseId: string | null = null;
    
    // Check if we have a mapping for the original provider
    const mapping = await gameMappingService.getMappingByExternalId(
        normalizedProvider,
        game.originalProviderGameId || entitlementKey,
        userId
    );
    
    if (mapping && mapping.gameReleaseId) {
        releaseId = mapping.gameReleaseId;
    } else {
        // Create new title and release
        const title = await gameTitleService.createGameTitle({
            name: game.name,
            type: GameType.VIDEO_GAME,
            description: null,
            coverImageUrl: null,
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocal: false,
            supportsPhysical: false,
            onlineMinPlayers: null,
            onlineMaxPlayers: null,
            localMinPlayers: null,
            localMaxPlayers: null,
            physicalMinPlayers: null,
            physicalMaxPlayers: null,
            ownerId: userId,
        });
        
        const release = await gameReleaseService.createGameRelease({
            gameTitleId: title.id,
            platform,
            ownerId: userId,
        });
        
        releaseId = release.id;
        
        // Create mapping for future lookups
        await gameMappingService.createMapping({
            provider: 'playnite',
            externalGameId: entitlementKey,
            externalGameName: game.name,
            gameTitleId: title.id,
            gameReleaseId: release.id,
            status: needsReview ? MappingStatus.PENDING : MappingStatus.MAPPED,
            ownerId: userId,
        });
        
        // Also create mapping for original provider if game ID is known
        if (game.originalProviderGameId && normalizedProvider !== 'unknown') {
            await gameMappingService.createMapping({
                provider: normalizedProvider,
                externalGameId: game.originalProviderGameId,
                externalGameName: game.name,
                gameTitleId: title.id,
                gameReleaseId: release.id,
                status: MappingStatus.MAPPED,
                ownerId: userId,
            });
        }
    }
    
    // Create item with full aggregator origin info
    const newItem = new Item();
    newItem.name = game.name;
    newItem.type = 'game_digital' as any;
    newItem.owner = {id: userId} as any;
    newItem.gameRelease = releaseId ? {id: releaseId} as any : null;
    newItem.gameCopyType = GameCopyType.DIGITAL_LICENSE;
    newItem.externalAccount = {id: accountId} as any;
    newItem.externalGameId = entitlementKey;
    newItem.playtimeMinutes = playtimeMinutes;
    newItem.lastPlayedAt = lastPlayedAt;
    newItem.isInstalled = game.installed ?? null;
    newItem.lendable = false;
    
    // Aggregator origin fields
    newItem.aggregatorProviderId = 'playnite';
    newItem.aggregatorAccountId = accountId;
    newItem.aggregatorExternalGameId = entitlementKey;
    newItem.originalProviderPluginId = game.originalProviderPluginId;
    newItem.originalProviderName = game.originalProviderName;
    newItem.originalProviderGameId = game.originalProviderGameId ?? null;
    newItem.originalProviderNormalizedId = normalizedProvider;
    newItem.needsReview = needsReview;
    
    await itemRepo.save(newItem);
    
    return 'created';
}

/**
 * Soft remove entries not seen in this import
 * (Sets isInstalled to false to indicate removed from library)
 */
async function softRemoveUnseenEntries(
    accountId: string,
    seenEntitlementKeys: Set<string>,
    beforeDate: string
): Promise<number> {
    const libraryEntryRepo = AppDataSource.getRepository(ExternalLibraryEntry);
    const itemRepo = AppDataSource.getRepository(Item);
    
    // Get all entries for this account
    const allEntries = await externalLibraryEntryService.getLibraryEntriesByAccountId(accountId);
    
    // Find entries not in the current import batch
    const unseenEntries = allEntries.filter(entry => !seenEntitlementKeys.has(entry.externalGameId));
    
    if (unseenEntries.length === 0) {
        return 0;
    }
    
    const unseenGameIds = unseenEntries.map(e => e.externalGameId);
    const entryIds = unseenEntries.map(e => e.id);
    
    // Batch update library entries
    if (entryIds.length > 0) {
        await libraryEntryRepo
            .createQueryBuilder()
            .update()
            .set({isInstalled: false, updatedAt: new Date()})
            .where('id IN (:...ids)', {ids: entryIds})
            .execute();
    }
    
    // Batch update items by aggregator external game IDs
    if (unseenGameIds.length > 0) {
        await itemRepo
            .createQueryBuilder()
            .update()
            .set({isInstalled: false, updatedAt: new Date()})
            .where('aggregator_provider_id = :providerId', {providerId: 'playnite'})
            .andWhere('aggregator_account_id = :accountId', {accountId})
            .andWhere('aggregator_external_game_id IN (:...gameIds)', {gameIds: unseenGameIds})
            .execute();
    }
    
    return unseenEntries.length;
}
