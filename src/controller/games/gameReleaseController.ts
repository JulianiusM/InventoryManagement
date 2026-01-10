/**
 * Game Release Controller
 * Business logic for game release operations
 */

import * as gameReleaseService from '../../modules/database/services/GameReleaseService';
import * as gameTitleService from '../../modules/database/services/GameTitleService';
import * as itemService from '../../modules/database/services/ItemService';
import * as locationService from '../../modules/database/services/LocationService';
import * as externalAccountService from '../../modules/database/services/ExternalAccountService';
import {ExpectedError} from '../../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {GameRelease} from '../../modules/database/entities/gameRelease/GameRelease';
import {CreateGameReleaseBody, MergeGameReleasesBody} from '../../types/GamesTypes';
import {parseOptionalCheckboxBoolean} from './helpers';

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
