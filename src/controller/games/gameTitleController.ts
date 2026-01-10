/**
 * Game Title Controller
 * Business logic for game title operations
 */

import * as gameTitleService from '../../modules/database/services/GameTitleService';
import * as gameReleaseService from '../../modules/database/services/GameReleaseService';
import * as platformService from '../../modules/database/services/PlatformService';
import {metadataProviderRegistry} from '../../modules/games/metadata/MetadataProviderRegistry';
import {mergePlayerCounts, type GameMetadata, type MetadataSearchResult} from '../../modules/games/metadata/MetadataProviderInterface';
import {validatePlayerProfile, PlayerProfileValidationError} from '../../modules/database/services/GameValidationService';
import {ExpectedError} from '../../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {GameTitle} from '../../modules/database/entities/gameTitle/GameTitle';
import {GameType} from '../../types/InventoryEnums';
import {CreateGameTitleBody, MergeGameTitlesBody} from '../../types/GamesTypes';
import {fuzzySearchGames} from '../../modules/games/GameNameUtils';
import {parseCheckboxBoolean, MIN_VALID_DESCRIPTION_LENGTH} from './helpers';

// ============ Game Titles ============

export async function listGameTitles(ownerId: number, options?: {
    search?: string;
    typeFilter?: string;
    platformFilter?: string;
    playersFilter?: number;
    page?: number;
    limit?: number | 'all';
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
    
    // Filter by platform (check if any release has this platform)
    if (options?.platformFilter) {
        titles = titles.filter(t => 
            t.releases && t.releases.some(r => r.platform === options.platformFilter)
        );
    }
    
    if (options?.playersFilter) {
        const count = options.playersFilter;
        titles = titles.filter(t => 
            count >= t.overallMinPlayers && count <= t.overallMaxPlayers
        );
    }
    
    // Get all platforms for filter dropdown
    const platforms = await platformService.getAllPlatforms(ownerId);
    
    // Apply pagination (unless 'all' is specified)
    const page = options?.page || 1;
    const showAll = options?.limit === 'all';
    const limit = showAll ? titles.length : (typeof options?.limit === 'number' ? options.limit : 24);
    const totalCount = titles.length;
    const totalPages = showAll ? 1 : Math.ceil(totalCount / limit);
    const offset = showAll ? 0 : (page - 1) * limit;
    titles = titles.slice(offset, offset + limit);
    
    return {
        titles,
        platforms,
        perPage: options?.limit || 24,
        platformFilter: options?.platformFilter || '',
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
 * Merge a game title as a release of another title
 * This is useful for resolving edition duplicates (e.g., "The Sims 4" and "The Sims 4 Premium Edition")
 */
export async function mergeGameTitleAsRelease(
    body: {
        sourceId: string;
        targetId: string;
        platform: string;
        edition?: string;
        region?: string;
        releaseDate?: string;
    }, 
    userId: number
): Promise<string> {
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
    
    if (!body.platform) {
        throw new ExpectedError('Platform is required', 'error', 400);
    }
    
    return await gameTitleService.mergeGameTitleAsRelease(body.sourceId, body.targetId, {
        platform: body.platform,
        edition: body.edition,
        region: body.region,
        releaseDate: body.releaseDate,
    });
}

// ============ Metadata Operations ============

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
        // Use capability-based lookup for player count enrichment
        const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
        for (const provider of playerCountProviders) {
            try {
                const providerName = provider.getManifest().name;
                console.log(`Enriching "${title.name}" with player counts from ${providerName}`);
                const results = await provider.searchGames(query, 1);
                if (results.length > 0) {
                    const playerMeta = await provider.getGameMetadata(results[0].externalId);
                    if (playerMeta?.playerInfo) {
                        // Merge player counts into metadata using utility
                        foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, playerMeta.playerInfo);
                        primaryProviderName += ` + ${providerName}`;
                        break; // Stop after first successful enrichment
                    }
                }
            } catch (error) {
                console.warn(`${provider.getManifest().name} enrichment failed:`, error);
                // Continue with next provider
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
    
    // Enrich with player count providers if needed
    const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
    const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                              foundMetadata.playerInfo?.localMaxPlayers !== undefined;
    
    if (hasMultiplayer && !hasSpecificCounts) {
        // Use capability-based lookup for player count enrichment
        const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
        for (const pcProvider of playerCountProviders) {
            try {
                const results = await pcProvider.searchGames(foundMetadata.name, 1);
                if (results.length > 0) {
                    const playerMeta = await pcProvider.getGameMetadata(results[0].externalId);
                    if (playerMeta?.playerInfo) {
                        foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, playerMeta.playerInfo);
                        primaryProviderName += ` + ${pcProvider.getManifest().name}`;
                        break; // Stop after first successful enrichment
                    }
                }
            } catch (error) {
                console.warn(`${pcProvider.getManifest().name} enrichment failed:`, error);
                // Continue with next provider
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
