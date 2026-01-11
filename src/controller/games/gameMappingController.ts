/**
 * Game Mapping Controller
 * Business logic for game mapping queue operations
 */

import * as gameMappingService from '../../modules/database/services/GameExternalMappingService';
import * as gameTitleService from '../../modules/database/services/GameTitleService';
import * as gameReleaseService from '../../modules/database/services/GameReleaseService';
import {ExpectedError} from '../../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {GameTitle} from '../../modules/database/entities/gameTitle/GameTitle';
import {GameRelease} from '../../modules/database/entities/gameRelease/GameRelease';
import {GameType, MappingStatus} from '../../types/InventoryEnums';
import {ResolveMappingBody} from '../../types/GamesTypes';

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

// ============ Metadata Management ============

/**
 * Get all metadata management data for the mappings page.
 * Includes pending mappings, similar titles, missing metadata, and invalid player counts.
 */
export async function getMetadataManagementData(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    const [
        mappings,
        titles,
        similarGroups,
        missingMetadata,
        invalidPlayers,
        counts,
    ] = await Promise.all([
        gameMappingService.getPendingMappings(ownerId),
        gameTitleService.getAllGameTitles(ownerId),
        gameTitleService.findSimilarTitles(ownerId, false),
        gameTitleService.findTitlesMissingMetadata(ownerId, false),
        gameTitleService.findTitlesWithInvalidPlayerCounts(ownerId, false),
        gameTitleService.getMetadataIssueCounts(ownerId),
    ]);
    
    return {
        mappings,
        titles,
        similarGroups,
        missingMetadata,
        invalidPlayers,
        counts: {
            ...counts,
            pendingMappings: mappings.length,
        },
    };
}

/**
 * Dismiss a title from a specific issue type.
 */
export async function dismissTitle(
    titleId: string, 
    dismissalType: gameTitleService.DismissalType,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership
    const title = await gameTitleService.getGameTitleById(titleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    await gameTitleService.dismissTitle(titleId, dismissalType);
}

/**
 * Undismiss a title from a specific issue type.
 */
export async function undismissTitle(
    titleId: string, 
    dismissalType: gameTitleService.DismissalType,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership
    const title = await gameTitleService.getGameTitleById(titleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    await gameTitleService.undismissTitle(titleId, dismissalType);
}

/**
 * Reset all dismissals for a user.
 */
export async function resetDismissals(
    userId: number,
    dismissalType?: gameTitleService.DismissalType
): Promise<number> {
    requireAuthenticatedUser(userId);
    return await gameTitleService.resetDismissals(userId, dismissalType);
}
