/**
 * Game Title Controller
 * Business logic for game title operations
 * 
 * Metadata operations are delegated to the centralized MetadataService
 * to maintain DRY and separation of concerns principles.
 */

import * as gameTitleService from '../../modules/database/services/GameTitleService';
import * as gameReleaseService from '../../modules/database/services/GameReleaseService';
import * as platformService from '../../modules/database/services/PlatformService';
import * as syncJobService from '../../modules/database/services/SyncJobService';
import * as metadataService from '../../modules/games/metadata/MetadataService';
import {type MetadataSearchResult} from '../../modules/games/metadata/MetadataProviderInterface';
import {validatePlayerProfile, PlayerProfileValidationError} from '../../modules/database/services/GameValidationService';
import {ExpectedError} from '../../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {GameTitle} from '../../modules/database/entities/gameTitle/GameTitle';
import {GameType} from '../../types/InventoryEnums';
import {CreateGameTitleBody, MergeGameTitlesBody} from '../../types/GamesTypes';
import {fuzzySearchGames} from '../../modules/games/GameNameUtils';
import {parseCheckboxBoolean} from './helpers';

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
 * Uses centralized MetadataService for consistency
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
    
    // Use centralized metadata service
    const result = await metadataService.fetchMetadata(title, searchQuery);
    
    if (!result.metadata) {
        return {updated: false, message: result.message};
    }
    
    // Apply metadata using centralized service
    const {fieldsUpdated} = await metadataService.applyMetadataToTitle(titleId, title, result.metadata);
    
    if (fieldsUpdated.length > 0) {
        return {
            updated: true, 
            message: `Updated from ${result.providerName}: ${fieldsUpdated.join(', ')}`
        };
    }
    
    return {updated: false, message: `No new data from ${result.providerName}`};
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
    
    // Use centralized metadata service
    const options = await metadataService.searchMetadataOptions(title, searchQuery);
    
    return {title, options};
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
    
    // Use centralized metadata service
    const result = await metadataService.fetchMetadataFromProvider(providerId, externalId);
    
    if (!result.metadata) {
        return {updated: false, message: result.message};
    }
    
    // Apply metadata using centralized service
    const {fieldsUpdated} = await metadataService.applyMetadataToTitle(titleId, title, result.metadata);
    
    if (fieldsUpdated.length > 0) {
        return {
            updated: true, 
            message: `Updated from ${result.providerName}: ${fieldsUpdated.join(', ')}`
        };
    }
    
    return {updated: false, message: `No new data from ${result.providerName}`};
}

/**
 * Resync metadata for all game titles (runs in background with job tracking)
 * Updates games with missing descriptions, cover images, or player info
 */
export async function resyncAllMetadataAsync(userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    // Create a job to track this operation
    const job = await syncJobService.createMetadataResyncJob(userId);
    await syncJobService.startSyncJob(job.id);
    
    const titles = await gameTitleService.getAllGameTitles(userId);
    
    console.log(`Starting metadata resync (job ${job.id}) for ${titles.length} games for user ${userId}`);
    
    let updated = 0;
    let failed = 0;
    
    try {
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
        
        // Mark job as completed
        await syncJobService.completeSyncJob(job.id, {
            entriesProcessed: titles.length,
            entriesAdded: 0,
            entriesUpdated: updated,
        });
        
        console.log(`Metadata resync (job ${job.id}) complete: ${updated} updated, ${failed} failed out of ${titles.length} games`);
    } catch (error) {
        // Mark job as failed
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await syncJobService.failSyncJob(job.id, errorMessage);
        console.error(`Metadata resync (job ${job.id}) failed:`, error);
    }
}
