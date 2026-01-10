/**
 * Games Controller
 * Business logic for games module
 * 
 * Game copies are now stored as Items with type=GAME or GAME_DIGITAL,
 * using the existing Barcode and Loan entities for integration.
 */

import * as gameTitleService from '../modules/database/services/GameTitleService';
import * as gameReleaseService from '../modules/database/services/GameReleaseService';
import * as itemService from '../modules/database/services/ItemService';
import * as barcodeService from '../modules/database/services/BarcodeService';
import * as loanService from '../modules/database/services/LoanService';
import * as externalAccountService from '../modules/database/services/ExternalAccountService';
import * as gameMappingService from '../modules/database/services/GameExternalMappingService';
import * as locationService from '../modules/database/services/LocationService';
import * as partyService from '../modules/database/services/PartyService';
import * as gameSyncService from '../modules/games/GameSyncService';
import * as platformService from '../modules/database/services/PlatformService';
import * as connectorDeviceService from '../modules/database/services/ConnectorDeviceService';
import {connectorRegistry, initializeConnectors} from '../modules/games/connectors/ConnectorRegistry';
import {metadataProviderRegistry} from '../modules/games/metadata/MetadataProviderRegistry';
import {mergePlayerCounts, type GameMetadata, type MetadataSearchResult} from '../modules/games/metadata/MetadataProviderInterface';
import {validatePlayerProfile, PlayerProfileValidationError} from '../modules/database/services/GameValidationService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {GameTitle} from '../modules/database/entities/gameTitle/GameTitle';
import {GameRelease} from '../modules/database/entities/gameRelease/GameRelease';
import {Item} from '../modules/database/entities/item/Item';
import {
    GameType, 
    GameCopyType, 
    ItemCondition,
    ItemType,
    LoanDirection,
    MappingStatus
} from '../types/InventoryEnums';
import {
    CreateGameTitleBody,
    CreateGameReleaseBody,
    CreateGameCopyBody,
    MoveGameCopyBody,
    LendGameCopyBody,
    CreateExternalAccountBody,
    ResolveMappingBody,
    MergeGameTitlesBody,
    MergeGameReleasesBody,
    LinkDigitalCopyToAccountBody,
    ScheduleSyncBody, DeviceRegistrationResult, ConnectorDevice
} from '../types/GamesTypes';

// Ensure connectors are initialized
initializeConnectors();

// Minimum description length to be considered valid (shorter = placeholder)
const MIN_VALID_DESCRIPTION_LENGTH = 50;

/**
 * Helper to parse checkbox boolean from form submissions
 * HTML checkboxes submit 'true' string when checked, undefined when unchecked
 */
function parseCheckboxBoolean(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
}

/**
 * Helper to parse optional checkbox boolean (can be null)
 * Returns true/false if value is present, null if undefined
 */
function parseOptionalCheckboxBoolean(value: boolean | string | undefined): boolean | null {
    if (value === undefined) return null;
    return value === true || value === 'true';
}

// ============ Game Titles ============

import {fuzzySearchGames} from '../modules/games/GameNameUtils';

export async function listGameTitles(ownerId: number, options?: {
    search?: string;
    typeFilter?: string;
    playersFilter?: number;
    page?: number;
    limit?: number;
}) {
    requireAuthenticatedUser(ownerId);
    let titles = await gameTitleService.getAllGameTitles(ownerId);
    
    // Apply filters
    if (options?.search) {
        // Use fuzzy search for better matching (handles punctuation variations)
        titles = fuzzySearchGames(titles, options.search);
    }
    
    if (options?.typeFilter) {
        titles = titles.filter(t => t.type === options.typeFilter);
    }
    
    if (options?.playersFilter) {
        const count = options.playersFilter;
        titles = titles.filter(t => 
            count >= t.overallMinPlayers && count <= t.overallMaxPlayers
        );
    }
    
    // Apply pagination
    const page = options?.page || 1;
    const limit = options?.limit || 24;
    const totalCount = titles.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;
    titles = titles.slice(offset, offset + limit);
    
    return {
        titles,
        pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

export async function getGameTitleDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    // Ensure default platforms exist for user
    await platformService.ensureDefaultPlatforms(userId);
    
    const releases = await gameReleaseService.getGameReleasesByTitleId(id);
    // Get all titles for merge dropdown (excluding current)
    const allTitles = (await gameTitleService.getAllGameTitles(userId))
        .filter(t => t.id !== id);
    // Get all platforms for dropdown
    const platforms = await platformService.getAllPlatforms(userId);
    return {title, releases, allTitles, platforms};
}

export async function createGameTitle(body: CreateGameTitleBody, ownerId: number): Promise<GameTitle> {
    requireAuthenticatedUser(ownerId);
    
    if (!body.name || body.name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    // Parse player profile
    const profile = {
        overallMinPlayers: Number(body.overallMinPlayers) || 1,
        overallMaxPlayers: Number(body.overallMaxPlayers) || 1,
        supportsOnline: parseCheckboxBoolean(body.supportsOnline),
        supportsLocal: parseCheckboxBoolean(body.supportsLocal),
        supportsPhysical: parseCheckboxBoolean(body.supportsPhysical),
        onlineMinPlayers: body.onlineMinPlayers ? Number(body.onlineMinPlayers) : null,
        onlineMaxPlayers: body.onlineMaxPlayers ? Number(body.onlineMaxPlayers) : null,
        localMinPlayers: body.localMinPlayers ? Number(body.localMinPlayers) : null,
        localMaxPlayers: body.localMaxPlayers ? Number(body.localMaxPlayers) : null,
        physicalMinPlayers: body.physicalMinPlayers ? Number(body.physicalMinPlayers) : null,
        physicalMaxPlayers: body.physicalMaxPlayers ? Number(body.physicalMaxPlayers) : null,
    };
    
    try {
        validatePlayerProfile(profile);
    } catch (err) {
        if (err instanceof PlayerProfileValidationError) {
            throw new ExpectedError(err.message, 'error', 400);
        }
        throw err;
    }
    
    return await gameTitleService.createGameTitle({
        name: body.name.trim(),
        type: (body.type as GameType) || GameType.VIDEO_GAME,
        description: body.description?.trim() || null,
        coverImageUrl: body.coverImageUrl?.trim() || null,
        ...profile,
        ownerId,
    });
}

export async function updateGameTitle(
    id: string,
    body: Partial<GameTitle>,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    const updates: Partial<GameTitle> = {};
    
    if (body.name !== undefined) {
        if (!body.name.trim()) {
            throw new ExpectedError('Name is required', 'error', 400);
        }
        updates.name = body.name.trim();
    }
    
    if (body.type !== undefined) updates.type = body.type;
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.coverImageUrl !== undefined) updates.coverImageUrl = body.coverImageUrl?.trim() || null;
    
    // Player profile updates
    if (body.overallMinPlayers !== undefined) updates.overallMinPlayers = Number(body.overallMinPlayers);
    if (body.overallMaxPlayers !== undefined) updates.overallMaxPlayers = Number(body.overallMaxPlayers);
    if (body.supportsOnline !== undefined) updates.supportsOnline = Boolean(body.supportsOnline);
    if (body.supportsLocal !== undefined) updates.supportsLocal = Boolean(body.supportsLocal);
    if (body.supportsPhysical !== undefined) updates.supportsPhysical = Boolean(body.supportsPhysical);
    if (body.onlineMinPlayers !== undefined) updates.onlineMinPlayers = Number(body.onlineMinPlayers) || null;
    if (body.onlineMaxPlayers !== undefined) updates.onlineMaxPlayers = Number(body.onlineMaxPlayers) || null;
    if (body.localMinPlayers !== undefined) updates.localMinPlayers = Number(body.localMinPlayers) || null;
    if (body.localMaxPlayers !== undefined) updates.localMaxPlayers = Number(body.localMaxPlayers) || null;
    if (body.physicalMinPlayers !== undefined) updates.physicalMinPlayers = Number(body.physicalMinPlayers) || null;
    if (body.physicalMaxPlayers !== undefined) updates.physicalMaxPlayers = Number(body.physicalMaxPlayers) || null;
    
    await gameTitleService.updateGameTitle(id, updates);
}

export async function deleteGameTitle(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    await gameTitleService.deleteGameTitle(id);
}

/**
 * Bulk delete game titles
 * @param ids Array of game title IDs to delete
 * @param userId Owner user ID
 * @returns Number of titles deleted
 */
export async function bulkDeleteGameTitles(ids: string[], userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    
    if (!ids || ids.length === 0) {
        throw new ExpectedError('No game titles selected', 'error', 400);
    }
    
    let deleted = 0;
    for (const id of ids) {
        const title = await gameTitleService.getGameTitleById(id);
        if (title && title.ownerId === userId) {
            await gameTitleService.deleteGameTitle(id);
            deleted++;
        }
    }
    
    return deleted;
}

/**
 * Fetch metadata for a single game title
 * Uses appropriate metadata provider based on game type
 * 
 * Strategy:
 * 1. Get basic metadata from primary provider (Steam/RAWG/BGG based on game type)
 * 2. If multiplayer but missing player counts, enrich from IGDB
 */
export async function fetchMetadataForTitle(
    titleId: string,
    userId: number,
    searchQuery?: string
): Promise<{updated: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    
    const title = await gameTitleService.getGameTitleById(titleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
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
            // Search for the game
            const searchResults = await provider.searchGames(query, 5);
            if (searchResults.length === 0) continue;
            
            // Get full metadata for best match
            const metadata = await provider.getGameMetadata(searchResults[0].externalId);
            if (!metadata) continue;
            
            foundMetadata = metadata;
            primaryProviderName = provider.getManifest().name;
            break; // Found metadata, stop searching
        } catch (error) {
            console.warn(`Metadata fetch from ${provider.getManifest().id} failed:`, error);
            // Continue to next provider
        }
    }
    
    if (!foundMetadata) {
        return {updated: false, message: 'No metadata found from any provider'};
    }
    
    // Step 2: If game supports multiplayer but lacks specific player counts, enrich from IGDB
    const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
    const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                              foundMetadata.playerInfo?.localMaxPlayers !== undefined;
    
    if (hasMultiplayer && !hasSpecificCounts) {
        const igdbProvider = metadataProviderRegistry.getById('igdb');
        if (igdbProvider) {
            try {
                console.log(`Enriching "${title.name}" with player counts from IGDB`);
                const igdbResults = await igdbProvider.searchGames(query, 1);
                if (igdbResults.length > 0) {
                    const igdbMeta = await igdbProvider.getGameMetadata(igdbResults[0].externalId);
                    if (igdbMeta?.playerInfo) {
                        // Merge IGDB player counts into metadata using utility
                        foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, igdbMeta.playerInfo);
                        primaryProviderName += ' + IGDB';
                    }
                }
            } catch (error) {
                console.warn('IGDB enrichment failed:', error);
                // Continue with original metadata
            }
        }
    }
    
    // Step 3: Apply metadata updates to title
    // Update fields even if they exist, to allow refresh with better data
    const updates: Partial<GameTitle> = {};
    
    // Always update description if we found a better one
    if (foundMetadata.shortDescription || foundMetadata.description) {
        const newDescription = foundMetadata.shortDescription || foundMetadata.description;
        // Update if no existing description OR if existing one is very short/placeholder
        if (!title.description || title.description.length < MIN_VALID_DESCRIPTION_LENGTH || title.description === title.name) {
            updates.description = newDescription;
        }
    }
    
    // Update cover image if we found one and don't have one
    if (foundMetadata.coverImageUrl && !title.coverImageUrl) {
        updates.coverImageUrl = foundMetadata.coverImageUrl;
    }
    
    if (foundMetadata.playerInfo) {
        if (foundMetadata.playerInfo.overallMinPlayers) {
            updates.overallMinPlayers = foundMetadata.playerInfo.overallMinPlayers;
        }
        if (foundMetadata.playerInfo.overallMaxPlayers) {
            updates.overallMaxPlayers = foundMetadata.playerInfo.overallMaxPlayers;
        }
        
        // Handle online mode - only set player counts if supportsOnline is true
        if (foundMetadata.playerInfo.supportsOnline !== undefined) {
            updates.supportsOnline = foundMetadata.playerInfo.supportsOnline;
            // When setting supportsOnline to false, clear the player counts
            if (!foundMetadata.playerInfo.supportsOnline) {
                updates.onlineMinPlayers = null;
                updates.onlineMaxPlayers = null;
            }
        }
        // Only set online player counts if supportsOnline is or will be true
        const willSupportOnline = updates.supportsOnline ?? title.supportsOnline;
        if (willSupportOnline) {
            if (foundMetadata.playerInfo.onlineMaxPlayers !== undefined && foundMetadata.playerInfo.onlineMaxPlayers !== null) {
                updates.onlineMaxPlayers = foundMetadata.playerInfo.onlineMaxPlayers;
            }
        }
        
        // Handle local mode - only set player counts if supportsLocal is true
        if (foundMetadata.playerInfo.supportsLocal !== undefined) {
            updates.supportsLocal = foundMetadata.playerInfo.supportsLocal;
            if (!foundMetadata.playerInfo.supportsLocal) {
                updates.localMinPlayers = null;
                updates.localMaxPlayers = null;
            }
        }
        const willSupportLocal = updates.supportsLocal ?? title.supportsLocal;
        if (willSupportLocal) {
            if (foundMetadata.playerInfo.localMaxPlayers !== undefined && foundMetadata.playerInfo.localMaxPlayers !== null) {
                updates.localMaxPlayers = foundMetadata.playerInfo.localMaxPlayers;
            }
        }
        
        // Handle physical mode
        if (foundMetadata.playerInfo.supportsPhysical !== undefined) {
            updates.supportsPhysical = foundMetadata.playerInfo.supportsPhysical;
            if (!foundMetadata.playerInfo.supportsPhysical) {
                updates.physicalMinPlayers = null;
                updates.physicalMaxPlayers = null;
            }
        }
        const willSupportPhysical = updates.supportsPhysical ?? title.supportsPhysical;
        if (willSupportPhysical) {
            if (foundMetadata.playerInfo.physicalMaxPlayers !== undefined && foundMetadata.playerInfo.physicalMaxPlayers !== null) {
                updates.physicalMaxPlayers = foundMetadata.playerInfo.physicalMaxPlayers;
            }
        }
    }
    
    if (Object.keys(updates).length > 0) {
        await gameTitleService.updateGameTitle(titleId, updates);
        return {
            updated: true, 
            message: `Updated from ${primaryProviderName}: ${Object.keys(updates).join(', ')}`
        };
    }
    
    return {updated: false, message: `No new data from ${primaryProviderName}`};
}

/**
 * Search for metadata options for a game title
 * Returns a list of potential matches so the user can select the correct one
 */
export async function searchMetadataOptions(
    titleId: string,
    userId: number,
    searchQuery?: string
): Promise<{title: GameTitle; options: MetadataSearchResult[]}> {
    requireAuthenticatedUser(userId);
    
    const title = await gameTitleService.getGameTitleById(titleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    // Get providers based on game type
    const providers = metadataProviderRegistry.getByGameType(title.type);
    if (providers.length === 0) {
        return {title, options: []};
    }
    
    // Search query defaults to game name
    const query = searchQuery?.trim() || title.name;
    
    // Collect all search results from all providers
    const allResults: MetadataSearchResult[] = [];
    
    for (const provider of providers) {
        try {
            const results = await provider.searchGames(query, 10);
            allResults.push(...results);
        } catch (error) {
            console.warn(`Metadata search from ${provider.getManifest().id} failed:`, error);
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
    
    return {title, options: uniqueResults.slice(0, 15)};
}

/**
 * Apply metadata from a selected provider result to a game title
 */
export async function applyMetadataOption(
    titleId: string,
    userId: number,
    providerId: string,
    externalId: string
): Promise<{updated: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    
    const title = await gameTitleService.getGameTitleById(titleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    // Get the specific provider
    const provider = metadataProviderRegistry.getById(providerId);
    if (!provider) {
        return {updated: false, message: `Provider '${providerId}' not found`};
    }
    
    // Fetch full metadata
    let foundMetadata: GameMetadata | null = null;
    let primaryProviderName = provider.getManifest().name;
    
    try {
        foundMetadata = await provider.getGameMetadata(externalId);
    } catch (error) {
        console.warn(`Metadata fetch from ${providerId} failed:`, error);
        return {updated: false, message: `Failed to fetch metadata from ${primaryProviderName}`};
    }
    
    if (!foundMetadata) {
        return {updated: false, message: `No metadata found for ID ${externalId}`};
    }
    
    // Enrich with IGDB if needed
    const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
    const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                              foundMetadata.playerInfo?.localMaxPlayers !== undefined;
    
    if (hasMultiplayer && !hasSpecificCounts) {
        const igdbProvider = metadataProviderRegistry.getById('igdb');
        if (igdbProvider) {
            try {
                const igdbResults = await igdbProvider.searchGames(foundMetadata.name, 1);
                if (igdbResults.length > 0) {
                    const igdbMeta = await igdbProvider.getGameMetadata(igdbResults[0].externalId);
                    if (igdbMeta?.playerInfo) {
                        foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, igdbMeta.playerInfo);
                        primaryProviderName += ' + IGDB';
                    }
                }
            } catch (error) {
                console.warn('IGDB enrichment failed:', error);
            }
        }
    }
    
    // Apply metadata updates to title
    const updates: Partial<GameTitle> = {};
    
    if (foundMetadata.description) {
        updates.description = foundMetadata.shortDescription || foundMetadata.description;
    }
    
    if (foundMetadata.coverImageUrl) {
        updates.coverImageUrl = foundMetadata.coverImageUrl;
    }
    
    if (foundMetadata.playerInfo) {
        if (foundMetadata.playerInfo.overallMinPlayers) {
            updates.overallMinPlayers = foundMetadata.playerInfo.overallMinPlayers;
        }
        if (foundMetadata.playerInfo.overallMaxPlayers) {
            updates.overallMaxPlayers = foundMetadata.playerInfo.overallMaxPlayers;
        }
        
        // Handle online mode
        if (foundMetadata.playerInfo.supportsOnline !== undefined) {
            updates.supportsOnline = foundMetadata.playerInfo.supportsOnline;
            if (!foundMetadata.playerInfo.supportsOnline) {
                updates.onlineMinPlayers = null;
                updates.onlineMaxPlayers = null;
            }
        }
        const willSupportOnline = updates.supportsOnline ?? title.supportsOnline;
        if (willSupportOnline) {
            if (foundMetadata.playerInfo.onlineMaxPlayers !== undefined && foundMetadata.playerInfo.onlineMaxPlayers !== null) {
                updates.onlineMaxPlayers = foundMetadata.playerInfo.onlineMaxPlayers;
            }
        }
        
        // Handle local mode
        if (foundMetadata.playerInfo.supportsLocal !== undefined) {
            updates.supportsLocal = foundMetadata.playerInfo.supportsLocal;
            if (!foundMetadata.playerInfo.supportsLocal) {
                updates.localMinPlayers = null;
                updates.localMaxPlayers = null;
            }
        }
        const willSupportLocal = updates.supportsLocal ?? title.supportsLocal;
        if (willSupportLocal) {
            if (foundMetadata.playerInfo.localMaxPlayers !== undefined && foundMetadata.playerInfo.localMaxPlayers !== null) {
                updates.localMaxPlayers = foundMetadata.playerInfo.localMaxPlayers;
            }
        }
        
        // Handle physical mode
        if (foundMetadata.playerInfo.supportsPhysical !== undefined) {
            updates.supportsPhysical = foundMetadata.playerInfo.supportsPhysical;
            if (!foundMetadata.playerInfo.supportsPhysical) {
                updates.physicalMinPlayers = null;
                updates.physicalMaxPlayers = null;
            }
        }
        const willSupportPhysical = updates.supportsPhysical ?? title.supportsPhysical;
        if (willSupportPhysical) {
            if (foundMetadata.playerInfo.physicalMaxPlayers !== undefined && foundMetadata.playerInfo.physicalMaxPlayers !== null) {
                updates.physicalMaxPlayers = foundMetadata.playerInfo.physicalMaxPlayers;
            }
        }
    }
    
    if (Object.keys(updates).length > 0) {
        await gameTitleService.updateGameTitle(titleId, updates);
        return {
            updated: true, 
            message: `Updated from ${primaryProviderName}: ${Object.keys(updates).join(', ')}`
        };
    }
    
    return {updated: false, message: `No new data from ${primaryProviderName}`};
}

/**
 * Resync metadata for all game titles (runs in background)
 * Updates games with missing descriptions, cover images, or player info
 */
export async function resyncAllMetadataAsync(userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const titles = await gameTitleService.getAllGameTitles(userId);
    
    console.log(`Starting metadata resync for ${titles.length} games for user ${userId}`);
    
    let updated = 0;
    let failed = 0;
    
    for (const title of titles) {
        try {
            const result = await fetchMetadataForTitle(title.id, userId);
            if (result.updated) {
                updated++;
                console.log(`Updated metadata for: ${title.name}`);
            }
        } catch (error) {
            failed++;
            console.warn(`Failed to fetch metadata for ${title.name}:`, error);
        }
        
        // Rate limit: wait 500ms between games to avoid API bans
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`Metadata resync complete: ${updated} updated, ${failed} failed out of ${titles.length} games`);
}

// ============ Game Releases ============

export async function createGameRelease(body: CreateGameReleaseBody, ownerId: number): Promise<GameRelease> {
    requireAuthenticatedUser(ownerId);
    
    // Verify title ownership
    const title = await gameTitleService.getGameTitleById(body.gameTitleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, ownerId);
    
    return await gameReleaseService.createGameRelease({
        gameTitleId: body.gameTitleId,
        platform: body.platform?.trim() || 'PC', // Now a user-defined string
        edition: body.edition?.trim() || null,
        region: body.region?.trim() || null,
        releaseDate: body.releaseDate || null,
        playersOverrideMin: body.playersOverrideMin ? Number(body.playersOverrideMin) : null,
        playersOverrideMax: body.playersOverrideMax ? Number(body.playersOverrideMax) : null,
        // Mode-specific overrides
        overrideSupportsOnline: parseOptionalCheckboxBoolean(body.overrideSupportsOnline),
        overrideSupportsLocal: parseOptionalCheckboxBoolean(body.overrideSupportsLocal),
        overrideSupportsPhysical: parseOptionalCheckboxBoolean(body.overrideSupportsPhysical),
        overrideOnlineMin: body.overrideOnlineMin ? Number(body.overrideOnlineMin) : null,
        overrideOnlineMax: body.overrideOnlineMax ? Number(body.overrideOnlineMax) : null,
        overrideLocalMin: body.overrideLocalMin ? Number(body.overrideLocalMin) : null,
        overrideLocalMax: body.overrideLocalMax ? Number(body.overrideLocalMax) : null,
        overridePhysicalMin: body.overridePhysicalMin ? Number(body.overridePhysicalMin) : null,
        overridePhysicalMax: body.overridePhysicalMax ? Number(body.overridePhysicalMax) : null,
        ownerId,
    });
}

export async function getGameReleaseDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const release = await gameReleaseService.getGameReleaseById(id);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, userId);
    
    // Use itemService to get game items linked to this release
    const copies = await itemService.getGameItemsByReleaseId(id);
    const locations = await locationService.getAllLocations(userId);
    const accounts = await externalAccountService.getAllExternalAccounts(userId);
    // Get all releases for the same title (for merge dropdown, excluding current)
    const allReleases = (await gameReleaseService.getGameReleasesByTitleId(release.gameTitleId))
        .filter(r => r.id !== id);
    return {release, copies, locations, accounts, allReleases};
}

export async function deleteGameRelease(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const release = await gameReleaseService.getGameReleaseById(id);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, userId);
    await gameReleaseService.deleteGameRelease(id);
}

export async function updateGameRelease(
    id: string,
    body: Partial<CreateGameReleaseBody>,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const release = await gameReleaseService.getGameReleaseById(id);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, userId);
    
    const updates: Record<string, unknown> = {};
    
    if (body.platform !== undefined) updates.platform = body.platform.trim() || 'PC';
    if (body.edition !== undefined) updates.edition = body.edition?.trim() || null;
    if (body.region !== undefined) updates.region = body.region?.trim() || null;
    if (body.releaseDate !== undefined) updates.releaseDate = body.releaseDate || null;
    if (body.playersOverrideMin !== undefined) updates.playersOverrideMin = body.playersOverrideMin ? Number(body.playersOverrideMin) : null;
    if (body.playersOverrideMax !== undefined) updates.playersOverrideMax = body.playersOverrideMax ? Number(body.playersOverrideMax) : null;
    
    // Mode-specific overrides
    if (body.overrideSupportsOnline !== undefined) updates.overrideSupportsOnline = parseOptionalCheckboxBoolean(body.overrideSupportsOnline);
    if (body.overrideSupportsLocal !== undefined) updates.overrideSupportsLocal = parseOptionalCheckboxBoolean(body.overrideSupportsLocal);
    if (body.overrideSupportsPhysical !== undefined) updates.overrideSupportsPhysical = parseOptionalCheckboxBoolean(body.overrideSupportsPhysical);
    if (body.overrideOnlineMin !== undefined) updates.overrideOnlineMin = body.overrideOnlineMin ? Number(body.overrideOnlineMin) : null;
    if (body.overrideOnlineMax !== undefined) updates.overrideOnlineMax = body.overrideOnlineMax ? Number(body.overrideOnlineMax) : null;
    if (body.overrideLocalMin !== undefined) updates.overrideLocalMin = body.overrideLocalMin ? Number(body.overrideLocalMin) : null;
    if (body.overrideLocalMax !== undefined) updates.overrideLocalMax = body.overrideLocalMax ? Number(body.overrideLocalMax) : null;
    if (body.overridePhysicalMin !== undefined) updates.overridePhysicalMin = body.overridePhysicalMin ? Number(body.overridePhysicalMin) : null;
    if (body.overridePhysicalMax !== undefined) updates.overridePhysicalMax = body.overridePhysicalMax ? Number(body.overridePhysicalMax) : null;
    
    await gameReleaseService.updateGameRelease(id, updates);
}

// ============ Game Copies (stored as Items) ============

export async function listGameCopies(ownerId: number, options?: {
    copyType?: string;
    locationFilter?: string;
    providerFilter?: string;
    page?: number;
    limit?: number;
}) {
    requireAuthenticatedUser(ownerId);
    let copies = await itemService.getGameItems(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    
    // Apply filters
    if (options?.copyType) {
        copies = copies.filter(c => c.gameCopyType === options.copyType);
    }
    
    if (options?.locationFilter) {
        if (options.locationFilter === 'unassigned') {
            copies = copies.filter(c => !c.locationId);
        } else {
            copies = copies.filter(c => c.locationId === options.locationFilter);
        }
    }
    
    if (options?.providerFilter) {
        copies = copies.filter(c => 
            c.externalAccount?.provider === options.providerFilter
        );
    }
    
    // Apply pagination
    const page = options?.page || 1;
    const limit = options?.limit || 24;
    const totalCount = copies.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;
    copies = copies.slice(offset, offset + limit);
    
    return {
        copies,
        locations,
        accounts,
        pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

export async function getGameCopyDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Use existing Loan and Barcode services since items integrate with them
    const loans = await loanService.getLoansByItemId(id);
    const barcodes = await barcodeService.getBarcodesByItemId(id);
    const locations = await locationService.getAllLocations(userId);
    const parties = await partyService.getAllParties(userId);
    // Get accounts for manual linking (digital copies only)
    const accounts = await externalAccountService.getAllExternalAccounts(userId);
    
    return {copy, loans, barcodes, locations, parties, accounts};
}

export async function createGameCopy(body: CreateGameCopyBody, ownerId: number): Promise<Item> {
    requireAuthenticatedUser(ownerId);
    
    // Verify release ownership
    const release = await gameReleaseService.getGameReleaseById(body.gameReleaseId);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, ownerId);
    
    // Get the game title name for the item name
    const gameName = release.gameTitle?.name || 'Game Copy';
    
    // Parse lendable properly - for physical copies, default to true if checkbox is checked
    // HTML checkboxes send 'true' when checked, undefined when unchecked
    // For physical copies, default to true; for digital, default to false
    const copyType = body.copyType as GameCopyType;
    let lendable: boolean;
    if (body.lendable !== undefined) {
        lendable = parseCheckboxBoolean(body.lendable);
    } else {
        // Default based on copy type: physical = true, digital = false
        lendable = copyType === GameCopyType.PHYSICAL_COPY;
    }
    
    // Create game item using itemService
    return await itemService.createGameItem({
        name: gameName,
        gameReleaseId: body.gameReleaseId,
        gameCopyType: copyType,
        externalAccountId: body.externalAccountId || null,
        externalGameId: body.externalGameId || null,
        locationId: body.locationId || null,
        condition: (body.condition as ItemCondition) || null,
        description: body.notes?.trim() || null,
        lendable,
        acquiredAt: body.acquiredAt || null,
        ownerId,
    });
}

export async function moveGameCopy(
    id: string,
    body: MoveGameCopyBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.gameCopyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot move a digital copy', 'error', 400);
    }
    
    await itemService.updateItemLocation(id, body.locationId || null);
}

/**
 * Update a game copy's editable fields
 */
export async function updateGameCopy(
    id: string,
    body: {
        condition?: string | null;
        lendable?: boolean;
        notes?: string | null;
        storeUrl?: string | null;
    },
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Only physical copies have condition and lendable settings
    const updateData: Record<string, unknown> = {};
    
    if (body.notes !== undefined) {
        const trimmed = typeof body.notes === 'string' ? body.notes.trim() : null;
        updateData.notes = trimmed || null;
    }
    
    if (copy.gameCopyType === GameCopyType.PHYSICAL_COPY) {
        if (body.condition !== undefined) {
            updateData.condition = body.condition || null;
        }
        if (body.lendable !== undefined) {
            updateData.lendable = body.lendable;
        }
    }
    
    // Digital licenses can have store URL
    if (copy.gameCopyType === GameCopyType.DIGITAL_LICENSE) {
        if (body.storeUrl !== undefined) {
            const trimmed = typeof body.storeUrl === 'string' ? body.storeUrl.trim() : null;
            // Validate URL if provided - only allow HTTPS for security
            if (trimmed) {
                try {
                    const url = new URL(trimmed);
                    if (url.protocol !== 'https:') {
                        throw new Error('Only HTTPS URLs are allowed');
                    }
                    updateData.storeUrl = trimmed;
                } catch {
                    // Invalid URL or not HTTPS, skip
                }
            } else {
                updateData.storeUrl = null;
            }
        }
    }
    
    await itemService.updateItem(id, updateData);
}

export async function deleteGameCopy(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Delete associated barcodes (using existing Barcode service)
    await barcodeService.deleteBarcodesByItemId(id);
    await itemService.deleteItem(id);
}

// ============ Physical Copy Lending (uses existing Loan entity) ============

export async function lendGameCopy(body: LendGameCopyBody, ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    const copy = await itemService.getItemById(body.gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, ownerId);
    
    if (copy.gameCopyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot lend a digital copy', 'error', 400);
    }
    
    if (!copy.lendable) {
        throw new ExpectedError('This copy is not lendable', 'error', 400);
    }
    
    // Check for active loan using existing LoanService
    const activeLoan = await loanService.getActiveLoanByItemId(body.gameCopyId);
    if (activeLoan) {
        throw new ExpectedError('This copy is already on loan', 'error', 400);
    }
    
    // Use existing LoanService to create the loan
    return await loanService.createLoan({
        itemId: body.gameCopyId,
        partyId: body.partyId,
        direction: LoanDirection.LEND,
        dueAt: body.dueAt || null,
        conditionOut: (body.conditionOut as ItemCondition) || null,
        notes: body.notes?.trim() || null,
        ownerId,
    });
}

export async function returnGameCopy(loanId: string, conditionIn: string | undefined, userId: number) {
    requireAuthenticatedUser(userId);
    
    const loan = await loanService.getLoanById(loanId);
    if (!loan) {
        throw new ExpectedError('Loan not found', 'error', 404);
    }
    checkOwnership(loan, userId);
    
    await loanService.returnLoan(loanId, (conditionIn as ItemCondition) || null);
}

// ============ Barcode Management (uses existing Barcode entity) ============

export async function mapBarcodeToGameCopy(
    gameCopyId: string,
    code: string,
    symbology: string,
    userId: number
): Promise<{success: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    
    if (!code || code.trim() === '') {
        throw new ExpectedError('Barcode is required', 'error', 400);
    }
    
    const copy = await itemService.getItemById(gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.gameCopyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot add barcode to a digital copy', 'error', 400);
    }
    
    // Check if barcode is already mapped using existing BarcodeService
    const existing = await barcodeService.getBarcodeByCode(code.trim());
    if (existing && existing.itemId && existing.itemId !== gameCopyId) {
        return {
            success: false,
            message: `Barcode already mapped to another item`,
        };
    }
    
    // Use existing BarcodeService to map barcode to item
    await barcodeService.mapBarcodeToItem(code.trim(), gameCopyId, symbology);
    return {success: true, message: 'Barcode mapped successfully'};
}

// ============ External Accounts ============

export async function listExternalAccounts(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    const connectors = connectorRegistry.getAllManifests();
    
    return {accounts, connectors};
}

export async function createExternalAccount(body: CreateExternalAccountBody, ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    if (!body.accountName || body.accountName.trim() === '') {
        throw new ExpectedError('Account name is required', 'error', 400);
    }
    
    if (!body.provider || body.provider.trim() === '') {
        throw new ExpectedError('Provider is required', 'error', 400);
    }
    
    return await externalAccountService.createExternalAccount({
        provider: body.provider.trim(), // Now a user-defined string
        accountName: body.accountName.trim(),
        externalUserId: body.externalUserId?.trim() || null,
        tokenRef: body.tokenRef || null,
        ownerId,
    });
}

export async function deleteExternalAccount(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const account = await externalAccountService.getExternalAccountById(id);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    await externalAccountService.deleteExternalAccount(id);
}

// ============ Sync ============

export async function triggerSync(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    return await gameSyncService.syncExternalAccount(accountId, userId);
}

/**
 * Trigger sync asynchronously (for background execution)
 * Same as triggerSync but designed to be called without awaiting
 */
export async function triggerSyncAsync(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        console.error(`Async sync failed: Account ${accountId} not found`);
        return;
    }
    
    if (account.ownerId !== userId) {
        console.error(`Async sync failed: Access denied for account ${accountId}`);
        return;
    }
    
    // Run sync and log result
    const result = await gameSyncService.syncExternalAccount(accountId, userId);
    if (result.success) {
        console.log(`Async sync completed for account ${accountId}: ${result.stats?.entriesProcessed || 0} games`);
    } else {
        console.error(`Async sync failed for account ${accountId}: ${result.error}`);
    }
}

export async function getSyncStatus(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    return await gameSyncService.getSyncStatus(accountId);
}

// ============ Mapping Queue ============

// Helper function to create game title and release from a mapping
async function createTitleAndReleaseFromMapping(
    externalGameName: string | null | undefined,
    externalGameId: string,
    mappingId: string,
    userId: number
): Promise<{title: GameTitle; release: GameRelease}> {
    // Create a new game title from the mapping
    const title = await gameTitleService.createGameTitle({
        name: externalGameName || `Game ${externalGameId}`,
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
    
    // Create a release for this title
    const release = await gameReleaseService.createGameRelease({
        gameTitleId: title.id,
        platform: 'PC', // Default to PC for digital games
        ownerId: userId,
    });
    
    // Update the mapping
    await gameMappingService.updateMapping(mappingId, {
        gameTitleId: title.id,
        gameReleaseId: release.id,
        status: MappingStatus.MAPPED,
    });
    
    return {title, release};
}

export async function getPendingMappings(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const mappings = await gameMappingService.getPendingMappings(ownerId);
    const titles = await gameTitleService.getAllGameTitles(ownerId);
    return {mappings, titles};
}

export async function resolveMappings(id: string, body: ResolveMappingBody, userId: number) {
    requireAuthenticatedUser(userId);
    
    const mapping = await gameMappingService.getMappingById(id);
    if (!mapping) {
        throw new ExpectedError('Mapping not found', 'error', 404);
    }
    checkOwnership(mapping, userId);
    
    if (body.action === 'ignore') {
        await gameMappingService.updateMapping(id, {
            status: MappingStatus.IGNORED,
        });
    } else if (body.action === 'create') {
        // Auto-create a new game title from the mapping using helper
        await createTitleAndReleaseFromMapping(
            mapping.externalGameName,
            mapping.externalGameId,
            id,
            userId
        );
    } else {
        // Map to existing title
        if (!body.gameTitleId && !body.gameReleaseId) {
            throw new ExpectedError('Either title or release ID is required', 'error', 400);
        }
        
        await gameMappingService.updateMapping(id, {
            gameTitleId: body.gameTitleId || null,
            gameReleaseId: body.gameReleaseId || null,
            status: MappingStatus.MAPPED,
        });
    }
}

export async function bulkCreateMappings(userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    const mappings = await gameMappingService.getPendingMappings(userId);
    let created = 0;
    
    for (const mapping of mappings) {
        await createTitleAndReleaseFromMapping(
            mapping.externalGameName,
            mapping.externalGameId,
            mapping.id,
            userId
        );
        created++;
    }
    
    return created;
}

export async function bulkIgnoreMappings(userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    const mappings = await gameMappingService.getPendingMappings(userId);
    let ignored = 0;
    
    for (const mapping of mappings) {
        await gameMappingService.updateMapping(mapping.id, {
            status: MappingStatus.IGNORED,
        });
        ignored++;
    }
    
    return ignored;
}

// ============ Connectors ============

export function getConnectorManifests() {
    return connectorRegistry.getAllManifests();
}

// ============ Merge Operations ============

/**
 * Merge two game titles without losing information
 * All releases from source are moved to target
 */
export async function mergeGameTitles(body: MergeGameTitlesBody, userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership of both titles
    const source = await gameTitleService.getGameTitleById(body.sourceId);
    const target = await gameTitleService.getGameTitleById(body.targetId);
    
    if (!source) {
        throw new ExpectedError('Source game title not found', 'error', 404);
    }
    if (!target) {
        throw new ExpectedError('Target game title not found', 'error', 404);
    }
    
    checkOwnership(source, userId);
    checkOwnership(target, userId);
    
    return await gameTitleService.mergeGameTitles(body.sourceId, body.targetId);
}

/**
 * Merge two game releases without losing information
 * All copies from source are moved to target
 */
export async function mergeGameReleases(body: MergeGameReleasesBody, userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership of both releases
    const source = await gameReleaseService.getGameReleaseById(body.sourceId);
    const target = await gameReleaseService.getGameReleaseById(body.targetId);
    
    if (!source) {
        throw new ExpectedError('Source game release not found', 'error', 404);
    }
    if (!target) {
        throw new ExpectedError('Target game release not found', 'error', 404);
    }
    
    checkOwnership(source, userId);
    checkOwnership(target, userId);
    
    return await gameReleaseService.mergeGameReleases(body.sourceId, body.targetId);
}

// ============ Manual Digital License Linking ============

/**
 * Link a digital copy to an external account manually
 * Use this when no connector exists for a platform
 */
export async function linkDigitalCopyToAccount(
    copyId: string,
    body: LinkDigitalCopyToAccountBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const copy = await itemService.getItemById(copyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.gameCopyType !== GameCopyType.DIGITAL_LICENSE) {
        throw new ExpectedError('Can only link digital licenses to external accounts', 'error', 400);
    }
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(body.externalAccountId);
    if (!account) {
        throw new ExpectedError('External account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    await itemService.updateItem(copyId, {
        externalAccountId: body.externalAccountId,
        externalGameId: body.externalGameId || null,
    });
}

// ============ Scheduled Sync ============

/**
 * Schedule periodic sync for an account
 */
export async function scheduleAccountSync(
    accountId: string,
    body: ScheduleSyncBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    if (body.intervalMinutes < 5) {
        throw new ExpectedError('Minimum sync interval is 5 minutes', 'error', 400);
    }
    
    gameSyncService.scheduleSync(accountId, userId, body.intervalMinutes);
}

/**
 * Cancel scheduled sync for an account
 */
export async function cancelScheduledSync(accountId: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    gameSyncService.cancelScheduledSync(accountId);
}

/**
 * Get list of scheduled syncs
 */
export function getScheduledSyncs(): string[] {
    return gameSyncService.getScheduledSyncs();
}

// ============ Platforms ============

/**
 * Get all platforms for user
 */
export async function listPlatforms(userId: number) {
    requireAuthenticatedUser(userId);
    // Ensure default platforms exist
    await platformService.ensureDefaultPlatforms(userId);
    const platforms = await platformService.getAllPlatforms(userId);
    return {platforms};
}

/**
 * Create a new platform
 */
export async function createPlatform(body: {name: string; description?: string; aliases?: string}, userId: number) {
    requireAuthenticatedUser(userId);
    
    if (!body.name || body.name.trim() === '') {
        throw new ExpectedError('Platform name is required', 'error', 400);
    }
    
    try {
        // First create the platform
        const platform = await platformService.createPlatform({
            name: body.name.trim(),
            description: body.description?.trim() || null,
        }, userId);
        
        // Then update aliases if provided
        if (body.aliases?.trim()) {
            await platformService.updatePlatformAliases(platform.id, body.aliases.trim(), userId);
        }
        
        return platform;
    } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Delete a platform (non-default only)
 */
export async function deletePlatform(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    try {
        await platformService.deletePlatform(id, userId);
    } catch (error) {
        if (error instanceof Error) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Update a platform
 * Aliases can be updated on both default and custom platforms.
 * Name and description can only be updated on custom platforms.
 */
export async function updatePlatform(id: string, body: {name?: string; description?: string; aliases?: string}, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    try {
        const platform = await platformService.getPlatformById(id, userId);
        if (!platform) {
            throw new ExpectedError('Platform not found', 'error', 404);
        }
        
        // For default platforms, only allow updating aliases
        if (platform.isDefault) {
            // Update aliases only
            await platformService.updatePlatformAliases(id, body.aliases?.trim() || null, userId);
        } else {
            // For custom platforms, update all fields
            if (body.name !== undefined && !body.name.trim()) {
                throw new ExpectedError('Platform name is required', 'error', 400);
            }
            
            await platformService.updatePlatform(id, {
                name: body.name?.trim(),
                description: body.description?.trim() || null,
            }, userId);
            
            // Update aliases
            await platformService.updatePlatformAliases(id, body.aliases?.trim() || null, userId);
        }
    } catch (error) {
        if (error instanceof Error && !(error instanceof ExpectedError)) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Register a new device for an account
 */
export async function registerDevice(accountId: string, deviceName: string): Promise<DeviceRegistrationResult> {
    if (!deviceName || deviceName.trim() === '') {
    throw new ExpectedError('Device name is required');
}

const result = await connectorDeviceService.createDevice(accountId, deviceName.trim());

return {
    deviceId: result.deviceId,
    deviceName: deviceName.trim(),
    token: result.token,
};
}

/**
 * List all devices for an account
 */
export async function listDevices(accountId: string): Promise<ConnectorDevice[]> {
    const devices = await connectorDeviceService.getDevicesByAccountId(accountId);

    return devices.map(device => ({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt || null,
        lastImportAt: device.lastImportAt || null,
        status: device.revokedAt ? 'revoked' as const : 'active' as const,
    }));
}

/**
 * Revoke a device (soft delete)
 */
export async function revokeDevice(accountId: string, deviceId: string): Promise<void> {
    const device = await connectorDeviceService.getDeviceById(deviceId);
    if (!device || device.externalAccountId !== accountId) {
    throw new ExpectedError('Device not found', "error", 404);
}
await connectorDeviceService.revokeDevice(deviceId);
}

/**
 * Delete a device permanently
 */
export async function deleteDevice(accountId: string, deviceId: string): Promise<void> {
    const device = await connectorDeviceService.getDeviceById(deviceId);
    if (!device || device.externalAccountId !== accountId) {
    throw new ExpectedError('Device not found', "error", 404);
}
await connectorDeviceService.deleteDevice(deviceId);
}

/**
 * Verify a device token
 */
export async function verifyDeviceToken(token: string): Promise<{deviceId: string; accountId: string} | null> {
    if (!token) {
    return null;
}

const device = await connectorDeviceService.verifyDeviceToken(token);
if (!device) {
    return null;
}

return {
    deviceId: device.id,
    accountId: device.externalAccountId,
};
}
