/**
 * Game Processor Module
 * 
 * Central processing logic for game sync operations.
 * This module provides the SINGLE implementation for processing games,
 * used by both fetch-style and push-style connectors.
 * 
 * Key principles:
 * - DRY: One implementation for all use cases
 * - Separation of concerns: Processing logic separate from connector logic
 * - Edition extraction: Always extracts edition from game name
 * - Smart sync: Pre-fetches existing items to skip unnecessary processing
 */

import {Platform} from "../../database/entities/platform/Platform";
import {ExternalGame} from '../connectors/ConnectorInterface';
import {extractEdition, normalizeGameTitle} from '../GameNameUtils';
import {normalizeDescription} from '../../lib/htmlUtils';
import {PlayerProfileValidationError} from '../../database/services/GameValidationService';
import * as gameTitleService from '../../database/services/GameTitleService';
import * as gameReleaseService from '../../database/services/GameReleaseService';
import * as itemService from '../../database/services/ItemService';
import * as platformService from '../../database/services/PlatformService';
import * as externalLibraryEntryService from '../../database/services/ExternalLibraryEntryService';
import * as gameMappingService from '../../database/services/GameExternalMappingService';
import {GameTitle} from '../../database/entities/gameTitle/GameTitle';
import {GameRelease} from '../../database/entities/gameRelease/GameRelease';
import {GameType, MappingStatus, GameCopyType} from '../../../types/InventoryEnums';

// NOTE: Player counts can be null to indicate "unknown".
// We preserve this distinction throughout the pipeline:
// - null = we don't know the player count
// - For singleplayer-only games (no modes enabled), null overall count = implied 1 player
// - For multiplayer games, null = UI shows warning that count is unknown
// This is critical for accurate search functionality.

// Map provider to default platform
const providerPlatformDefaults: Record<string, string> = {
    'steam': 'PC',
    'epic': 'PC',
    'gog': 'PC',
    'xbox': 'Xbox Series',
    'playstation': 'PlayStation 5',
    'nintendo': 'Nintendo Switch',
    'origin': 'PC',
    'ubisoft': 'PC',
    'playnite': 'PC',
};

/**
 * Result from auto-creating game title and release
 */
export interface AutoCreateGameResult {
    title: GameTitle;
    release: GameRelease;
    titleCreated: boolean;
    releaseCreated: boolean;
}

/**
 * Stats from processing a batch of games
 */
export interface ProcessingStats {
    entriesProcessed: number;
    entriesAdded: number;
    entriesUpdated: number;
    titlesCreated: number;
    copiesCreated: number;
}

/**
 * Pre-fetch existing items for a list of games.
 * This is the central smart sync helper used by all sync flows.
 * 
 * @param accountId The external account ID
 * @param games List of games to check
 * @returns Map of externalGameId -> existing item (only for games that have copies)
 */
export async function prefetchExistingItems(
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
 * Update an existing game item with latest data (playtime, install status, store URL).
 * Used by smart sync to skip full processing for existing games.
 */
export async function updateExistingGameItem(
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
 * Determine if a game has multiplayer support based on available metadata
 */
function hasMultiplayerSupport(game: ExternalGame): boolean {
    const supportsOnline = game.supportsOnline ?? false;
    const supportsLocalCouch = game.supportsLocalCouch ?? false;
    const supportsLocalLAN = game.supportsLocalLAN ?? false;
    const hasMultipleMaxPlayers = game.overallMaxPlayers !== undefined && game.overallMaxPlayers > 1;
    return supportsOnline || supportsLocalCouch || supportsLocalLAN || hasMultipleMaxPlayers;
}

/**
 * Validate a player count value - returns undefined if invalid
 * Valid: positive finite integer
 * Invalid: 0, negative, NaN, Infinity -> returns undefined (unknown)
 */
function validatePlayerCount(value: number | undefined): number | undefined {
    if (value === undefined) return undefined;
    if (value <= 0 || !Number.isFinite(value)) return undefined;
    return value;
}

/**
 * Clamp player profile values to ensure they pass validation.
 * 
 * Key principles:
 * 1. Mode-specific values (online/local max) take PRECEDENCE over overall values
 * 2. If mode-specific values exist but supportsX is false, enable supportsX
 * 3. Overall max is EXTENDED to accommodate mode max values (not clamped down)
 * 4. PRESERVE null/undefined for unknown counts - do NOT set defaults
 * 5. Invalid values (0, negative, NaN) are treated as "unknown" (set to undefined)
 * 6. Overall counts can be null (unknown) - this is valid
 */
function clampPlayerProfileValues(game: ExternalGame): ExternalGame {
    const clamped: ExternalGame = {...game};
    
    // Step 1: Validate mode-specific values - treat invalid values as "unknown"
    clamped.onlineMaxPlayers = validatePlayerCount(clamped.onlineMaxPlayers);
    clamped.localMaxPlayers = validatePlayerCount(clamped.localMaxPlayers);
    clamped.onlineMinPlayers = validatePlayerCount(clamped.onlineMinPlayers);
    clamped.localMinPlayers = validatePlayerCount(clamped.localMinPlayers);
    
    // If mode-specific values are valid, enable support
    if (clamped.onlineMaxPlayers !== undefined) {
        clamped.supportsOnline = true;
    }
    if (clamped.localMaxPlayers !== undefined) {
        // If local max players detected but neither local mode specified, default to couch
        if (!clamped.supportsLocalCouch && !clamped.supportsLocalLAN) {
            clamped.supportsLocalCouch = true;
        }
    }
    
    // Step 2: Validate overall counts - treat invalid values as "unknown"
    clamped.overallMinPlayers = validatePlayerCount(clamped.overallMinPlayers);
    clamped.overallMaxPlayers = validatePlayerCount(clamped.overallMaxPlayers);
    
    // Step 3: If we have valid mode-specific counts, derive overall from them
    // This ONLY sets overall if mode counts are known, otherwise keeps as unknown
    let hasKnownMax = false;
    let derivedMaxPlayers = clamped.overallMaxPlayers ?? 0;
    
    if (clamped.supportsOnline && clamped.onlineMaxPlayers !== undefined) {
        derivedMaxPlayers = Math.max(derivedMaxPlayers, clamped.onlineMaxPlayers);
        hasKnownMax = true;
    }
    if ((clamped.supportsLocalCouch || clamped.supportsLocalLAN) && clamped.localMaxPlayers !== undefined) {
        derivedMaxPlayers = Math.max(derivedMaxPlayers, clamped.localMaxPlayers);
        hasKnownMax = true;
    }
    
    // Only update overall max if we have known values from modes
    if (hasKnownMax) {
        clamped.overallMaxPlayers = derivedMaxPlayers;
    }
    // Otherwise, keep overall max as is (could be null/undefined = unknown)
    
    // Step 4: Validate min/max relationship for overall if both are known
    if (clamped.overallMinPlayers !== undefined && clamped.overallMaxPlayers !== undefined) {
        if (clamped.overallMinPlayers > clamped.overallMaxPlayers) {
            clamped.overallMinPlayers = clamped.overallMaxPlayers;
        }
    }
    
    // Step 5: Clear mode-specific values if mode is not supported (validation requires this)
    // But preserve null/undefined for unknown counts when mode IS supported
    if (!clamped.supportsOnline) {
        clamped.onlineMinPlayers = undefined;
        clamped.onlineMaxPlayers = undefined;
    } else {
        // For supported modes, validate min/max relationship if both are set
        if (clamped.onlineMinPlayers !== undefined && clamped.onlineMaxPlayers !== undefined 
            && clamped.onlineMaxPlayers < clamped.onlineMinPlayers) {
            clamped.onlineMaxPlayers = clamped.onlineMinPlayers;
        }
    }
    
    if (!clamped.supportsLocalCouch && !clamped.supportsLocalLAN) {
        clamped.localMinPlayers = undefined;
        clamped.localMaxPlayers = undefined;
    } else {
        // For supported modes, validate min/max relationship if both are set
        if (clamped.localMinPlayers !== undefined && clamped.localMaxPlayers !== undefined 
            && clamped.localMaxPlayers < clamped.localMinPlayers) {
            clamped.localMaxPlayers = clamped.localMinPlayers;
        }
    }
    
    return clamped;
}

/**
 * Create game title and release from game data.
 * ALWAYS extracts edition from game name.
 * 
 * This is the SINGLE implementation for creating games - used by all sync flows.
 * 
 * IMPORTANT: Mode-specific player counts (onlineMaxPlayers, localMaxPlayers) are kept
 * as null/undefined when not known from metadata. This preserves the distinction between
 * "we know it supports X players" vs "we don't know how many players".
 * 
 * @param game The external game data
 * @param platform The platform for the release
 * @param ownerId The owner ID
 */
async function createGameFromData(
    game: ExternalGame,
    platform: string,
    ownerId: number
): Promise<AutoCreateGameResult> {
    // Ensure the platform exists in the database (auto-create if missing)
    const pf = await platformService.getOrCreatePlatform(platform, ownerId);
    
    // CRITICAL: Extract edition from game name
    // e.g., "The Sims 4 Premium Edition" -> baseName: "The Sims 4", edition: "Premium Edition"
    const {baseName, edition} = extractEdition(game.name);
    
    // Log for debugging
    //console.log(`Game processing: "${game.name}" -> baseName: "${baseName}", edition: "${edition}"`);
    
    // Determine multiplayer support from game data
    const supportsOnline = game.supportsOnline ?? false;
    const supportsLocalCouch = game.supportsLocalCouch ?? false;
    const supportsLocalLAN = game.supportsLocalLAN ?? false;
    
    // Normalize description in the shared pipeline (handles HTML, length, etc.)
    const normalizedDescription = normalizeDescription(game.description);
    
    // KEY DESIGN DECISION: Player counts are preserved as-is (including null).
    // null = "we don't know the player count" - this is critical for search functionality.
    // We NEVER set default values that would obscure unknown data.
    //
    // For singleplayer-only games (no multiplayer modes): null overall = implied 1 player
    // For multiplayer games: null overall = we don't know (UI will show warning)
    
    // Get or create game title (merges with existing titles with same normalized name)
    // The title uses the BASE NAME (without edition)
    const {title, isNew: titleCreated} = await gameTitleService.getOrCreateGameTitle({
        name: baseName, // Use base name WITHOUT edition
        type: GameType.VIDEO_GAME,
        description: normalizedDescription || null,
        coverImageUrl: game.coverImageUrl || null,
        // Overall player counts: preserve as-is (null = unknown)
        overallMinPlayers: game.overallMinPlayers ?? null,
        overallMaxPlayers: game.overallMaxPlayers ?? null,
        supportsOnline,
        supportsLocalCouch,
        supportsLocalLAN,
        supportsPhysical: game.supportsPhysical ?? false,
        // Mode-specific counts: only set if we have actual data, otherwise null (unknown)
        onlineMinPlayers: supportsOnline ? (game.onlineMinPlayers ?? null) : null,
        onlineMaxPlayers: supportsOnline ? (game.onlineMaxPlayers ?? null) : null,
        localMinPlayers: (supportsLocalCouch || supportsLocalLAN) ? (game.localMinPlayers ?? null) : null,
        localMaxPlayers: (supportsLocalCouch || supportsLocalLAN) ? (game.localMaxPlayers ?? null) : null,
        physicalMinPlayers: null,
        physicalMaxPlayers: null,
        ownerId,
    });
    
    // Get or create release for this platform with the DETECTED edition
    const {release, isNew: releaseCreated} = await gameReleaseService.getOrCreateGameRelease({
        gameTitleId: title.id,
        platform: pf.name,
        releaseDate: game.releaseDate || null,
        edition, // Store the DETECTED edition (e.g., "Premium Edition")
        ownerId,
    });
    
    //console.log(`  -> Title: "${title.name}" (${titleCreated ? 'NEW' : 'existing'}), Release edition: "${edition}" (${releaseCreated ? 'NEW' : 'existing'})`);
    
    return {title, release, titleCreated, releaseCreated};
}

/**
 * Safe wrapper for createGameFromData that handles PlayerProfileValidationError.
 * If validation fails, clamps values to ensure they pass validation.
 */
export async function safeCreateGameFromData(
    game: ExternalGame,
    platform: string,
    ownerId: number
): Promise<AutoCreateGameResult> {
    try {
        return await createGameFromData(game, platform, ownerId);
    } catch (error) {
        if (error instanceof PlayerProfileValidationError) {
            console.warn(`PlayerProfileValidationError for "${game.name}": ${error.message}. Attempting to clamp values.`);
            
            // Clamp values to ensure they pass validation
            const clampedGame = clampPlayerProfileValues(game);
            
            try {
                return await createGameFromData(clampedGame, platform, ownerId);
            } catch (clampError) {
                // If clamping still fails, use absolute safe defaults as last resort
                console.warn(`Clamping failed for "${game.name}": ${clampError instanceof Error ? clampError.message : 'Unknown'}. Using minimal defaults.`);
                
                const safeGame: ExternalGame = {
                    ...game,
                    overallMinPlayers: 1,
                    overallMaxPlayers: 1,
                    supportsOnline: false,
                    supportsLocalCouch: false,
                    supportsLocalLAN: false,
                    supportsPhysical: false,
                    onlineMinPlayers: undefined,
                    onlineMaxPlayers: undefined,
                    localMinPlayers: undefined,
                    localMaxPlayers: undefined,
                };
                
                return await createGameFromData(safeGame, platform, ownerId);
            }
        }
        throw error;
    }
}

/**
 * Process a batch of games - the UNIFIED processing function.
 * 
 * This is the SINGLE implementation used by BOTH fetch-style and push-style connectors.
 * 
 * For each game:
 * 1. Check if game already has a copy (smart sync: skip for existing)
 * 2. Upsert library entry
 * 3. Create/update mapping with auto-creation of title/release
 * 4. Create digital copy item
 * 
 * @param accountId External account ID
 * @param provider Provider name (e.g., 'steam', 'playnite')
 * @param games Games to process
 * @param ownerId Owner user ID
 * @param isAggregator Whether this is an aggregator connector (e.g., Playnite)
 */
export async function processGameBatch(
    accountId: string,
    provider: string,
    games: ExternalGame[],
    ownerId: number,
    isAggregator: boolean = false
): Promise<ProcessingStats> {
    let entriesAdded = 0;
    let entriesUpdated = 0;
    let titlesCreated = 0;
    let copiesCreated = 0;
    
    // Get default platform for this provider
    const defaultPlatform = providerPlatformDefaults[provider.toLowerCase()] || 'PC';
    
    // Smart sync: Pre-fetch all existing items
    const existingItemsMap = await prefetchExistingItems(accountId, games);
    
    // Process each game sequentially (important for edition merging)
    for (const game of games) {
        try {
            // Check if this game already has a copy
            const existingItem = existingItemsMap.get(game.externalGameId);
            
            if (existingItem) {
                // For existing games: only update library entry and item
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
                
                // Update existing item with latest data
                await updateExistingGameItem(existingItem, game);
                continue;
            }
            
            // For new games: Full processing
            
            // Step 1: Upsert library entry
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
            
            // Step 2: Get or create mapping
            let mapping = await gameMappingService.getMappingByExternalId(
                provider,
                game.externalGameId,
                ownerId
            );
            
            // Step 3: If no mapping exists or mapping is pending, auto-create title/release
            if (!mapping || mapping.status === MappingStatus.PENDING) {
                // Use platform from game metadata if available
                const gamePlatform = game.platform || defaultPlatform;
                
                // Create title and release using the unified function
                const result = await safeCreateGameFromData(game, gamePlatform, ownerId);
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
            
            // Step 5: Create the digital copy
            if (mapping?.gameReleaseId) {
                await itemService.createGameItem({
                    name: game.name, // Item name keeps the full game name
                    gameReleaseId: mapping.gameReleaseId,
                    gameCopyType: GameCopyType.DIGITAL_LICENSE,
                    externalAccountId: accountId,
                    externalGameId: game.externalGameId,
                    playtimeMinutes: game.playtimeMinutes,
                    lastPlayedAt: game.lastPlayedAt,
                    isInstalled: game.isInstalled,
                    lendable: false,
                    ownerId,
                    // Aggregator origin fields
                    aggregatorProviderId: isAggregator ? provider : undefined,
                    aggregatorAccountId: isAggregator ? accountId : undefined,
                    aggregatorExternalGameId: isAggregator ? game.externalGameId : undefined,
                    originalProviderPluginId: game.originalProviderPluginId,
                    originalProviderName: game.originalProviderName,
                    originalProviderGameId: game.originalProviderGameId,
                    originalProviderNormalizedId: game.originalProviderNormalizedId,
                    storeUrl: game.storeUrl,
                    needsReview: !game.originalProviderGameId && isAggregator,
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
