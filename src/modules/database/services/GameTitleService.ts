import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {GameRelease} from '../entities/gameRelease/GameRelease';
import {GameExternalMapping} from '../entities/gameExternalMapping/GameExternalMapping';
import {Item} from '../entities/item/Item';
import {Barcode} from '../entities/barcode/Barcode';
import {User} from '../entities/user/User';
import {GameType} from '../../../types/InventoryEnums';
import {validatePlayerProfile} from './GameValidationService';
import {normalizeGameTitle, extractEdition} from '../../games/GameNameUtils';

export interface CreateGameTitleData {
    name: string;
    type?: GameType;
    description?: string | null;
    coverImageUrl?: string | null;
    // Overall player counts - null means "unknown"
    overallMinPlayers?: number | null;
    overallMaxPlayers?: number | null;
    supportsOnline: boolean;
    supportsLocalCouch: boolean;
    supportsLocalLAN: boolean;
    supportsPhysical: boolean;
    // Mode-specific counts - null means "unknown for this mode"
    onlineMinPlayers?: number | null;
    onlineMaxPlayers?: number | null;
    couchMinPlayers?: number | null;
    couchMaxPlayers?: number | null;
    lanMinPlayers?: number | null;
    lanMaxPlayers?: number | null;
    physicalMinPlayers?: number | null;
    physicalMaxPlayers?: number | null;
    ownerId: number;
}

export async function createGameTitle(data: CreateGameTitleData): Promise<GameTitle> {
    // Validate player profile
    validatePlayerProfile(data);
    
    const repo = AppDataSource.getRepository(GameTitle);
    const title = new GameTitle();
    title.name = data.name;
    title.type = data.type || GameType.VIDEO_GAME;
    title.description = data.description ?? null;
    title.coverImageUrl = data.coverImageUrl ?? null;
    // Player counts: null means "unknown" - preserve this distinction
    title.overallMinPlayers = data.overallMinPlayers ?? null;
    title.overallMaxPlayers = data.overallMaxPlayers ?? null;
    title.supportsOnline = data.supportsOnline;
    title.supportsLocalCouch = data.supportsLocalCouch;
    title.supportsLocalLAN = data.supportsLocalLAN;
    title.supportsPhysical = data.supportsPhysical;
    title.onlineMinPlayers = data.onlineMinPlayers ?? null;
    title.onlineMaxPlayers = data.onlineMaxPlayers ?? null;
    title.couchMinPlayers = data.couchMinPlayers ?? null;
    title.couchMaxPlayers = data.couchMaxPlayers ?? null;
    title.lanMinPlayers = data.lanMinPlayers ?? null;
    title.lanMaxPlayers = data.lanMaxPlayers ?? null;
    title.physicalMinPlayers = data.physicalMinPlayers ?? null;
    title.physicalMaxPlayers = data.physicalMaxPlayers ?? null;
    title.owner = {id: data.ownerId} as User;
    return await repo.save(title);
}

export async function getGameTitleById(id: string): Promise<GameTitle | null> {
    const repo = AppDataSource.getRepository(GameTitle);
    return await repo.findOne({
        where: {id},
        relations: ['owner', 'releases'],
    });
}

export async function getAllGameTitles(ownerId: number): Promise<GameTitle[]> {
    const repo = AppDataSource.getRepository(GameTitle);
    return await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['releases'],
        order: {name: 'ASC'},
    });
}

export async function updateGameTitle(id: string, data: Partial<Omit<GameTitle, 'owner' | 'releases'>>): Promise<void> {
    // If player profile fields are being updated, validate them
    if (data.overallMinPlayers !== undefined || 
        data.overallMaxPlayers !== undefined ||
        data.supportsOnline !== undefined ||
        data.supportsLocalCouch !== undefined ||
        data.supportsLocalLAN !== undefined ||
        data.supportsPhysical !== undefined) {
        
        const repo = AppDataSource.getRepository(GameTitle);
        const existing = await repo.findOne({where: {id}});
        if (existing) {
            const merged = {...existing, ...data};
            validatePlayerProfile({
                overallMinPlayers: merged.overallMinPlayers,
                overallMaxPlayers: merged.overallMaxPlayers,
                supportsOnline: merged.supportsOnline,
                supportsLocalCouch: merged.supportsLocalCouch,
                supportsLocalLAN: merged.supportsLocalLAN,
                supportsPhysical: merged.supportsPhysical,
                onlineMinPlayers: merged.onlineMinPlayers,
                onlineMaxPlayers: merged.onlineMaxPlayers,
                couchMinPlayers: merged.couchMinPlayers,
                couchMaxPlayers: merged.couchMaxPlayers,
                lanMinPlayers: merged.lanMinPlayers,
                lanMaxPlayers: merged.lanMaxPlayers,
                physicalMinPlayers: merged.physicalMinPlayers,
                physicalMaxPlayers: merged.physicalMaxPlayers,
            });
        }
    }
    
    const repo = AppDataSource.getRepository(GameTitle);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteGameTitle(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameTitle);
    const gameReleaseRepo = AppDataSource.getRepository(GameRelease);
    const gameMappingRepo = AppDataSource.getRepository(GameExternalMapping);
    const itemRepo = AppDataSource.getRepository(Item);
    const barcodeRepo = AppDataSource.getRepository(Barcode);
    
    // Get title with all releases
    const title = await repo.findOne({where: {id}, relations: ['releases', 'releases.items']});
    
    if (title && title.releases) {
        // Delete all copies (items) and their barcodes for each release
        for (const release of title.releases) {
            if (release.items) {
                for (const item of release.items) {
                    await barcodeRepo.delete({item: {id: item.id}});
                }
            }
            await itemRepo.delete({gameRelease: {id: release.id}});
        }
        // Delete all releases
        await gameReleaseRepo.delete({gameTitle: {id}});
    }
    
    // Delete associated mappings so that re-sync can recreate the games
    await gameMappingRepo.delete({gameTitle: {id}});
    
    // Delete the title
    await repo.delete({id});
}

export async function searchGameTitles(ownerId: number, search: string): Promise<GameTitle[]> {
    const repo = AppDataSource.getRepository(GameTitle);
    return await repo.createQueryBuilder('title')
        .where('title.owner_id = :ownerId', {ownerId})
        .andWhere('title.name LIKE :search', {search: `%${search}%`})
        .orderBy('title.name', 'ASC')
        .getMany();
}

/**
 * Merge two game titles without losing information
 * Moves all releases from source to target, then deletes source
 * @param sourceId The title to merge FROM (will be deleted)
 * @param targetId The title to merge INTO (will be kept)
 * @returns Number of releases moved
 */
export async function mergeGameTitles(sourceId: string, targetId: string): Promise<number> {
    const repo = AppDataSource.getRepository(GameTitle);
    const gameReleaseRepo = AppDataSource.getRepository(GameRelease);
    const gameMappingRepo = AppDataSource.getRepository(GameExternalMapping);
    
    // Get source with releases
    const source = await repo.findOne({where: {id: sourceId}, relations: ['releases']});
    const target = await repo.findOne({where: {id: targetId}});
    
    if (!source || !target) {
        throw new Error('Source or target game title not found');
    }
    
    if (sourceId === targetId) {
        throw new Error('Cannot merge a title with itself');
    }
    
    // Move all releases from source to target
    const releasesToMove = source.releases || [];
    for (const release of releasesToMove) {
        await gameReleaseRepo.update({id: release.id}, {gameTitle: {id: targetId}});
    }
    
    // Update mappings to point to target
    await gameMappingRepo
        .createQueryBuilder()
        .update()
        .set({gameTitle: {id: targetId}})
        .where('game_title_id = :sourceId', {sourceId})
        .execute();
    
    // Delete the source title (releases are already moved)
    await repo.delete({id: sourceId});
    
    return releasesToMove.length;
}

/**
 * Find an existing game title by normalized name
 * Uses normalizeGameTitle to match titles like "The Sims 4" and "The Sims™ 4"
 * 
 * @param name The game name (can include trademark symbols, punctuation variants, etc.)
 * @param ownerId The owner ID
 * @returns The matching game title if found, null otherwise
 */
export async function findGameTitleByNormalizedName(name: string, ownerId: number): Promise<GameTitle | null> {
    const repo = AppDataSource.getRepository(GameTitle);
    
    // Extract edition from name first
    const {baseName} = extractEdition(name);
    const normalizedName = normalizeGameTitle(baseName);
    
    // Get all titles for owner
    const allTitles = await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['releases'],
    });
    
    // Find by normalized match
    for (const title of allTitles) {
        const {baseName: titleBaseName} = extractEdition(title.name);
        const titleNormalized = normalizeGameTitle(titleBaseName);
        
        if (titleNormalized === normalizedName) {
            return title;
        }
    }
    
    return null;
}

/**
 * Get or create game title by normalized name
 * If a title with matching normalized name exists, return it.
 * Otherwise create a new title.
 * 
 * @param data Title creation data
 * @returns Existing or new game title
 */
export async function getOrCreateGameTitle(data: CreateGameTitleData): Promise<{title: GameTitle; isNew: boolean}> {
    // Try to find existing title by normalized name
    const existing = await findGameTitleByNormalizedName(data.name, data.ownerId);
    
    if (existing) {
        return {title: existing, isNew: false};
    }
    
    // Create new title
    const title = await createGameTitle(data);
    return {title, isNew: true};
}

/**
 * Merge a game title as a release of another title
 * 
 * This is useful for resolving edition duplicates (e.g., "The Sims 4" and "The Sims 4 Premium Edition").
 * 
 * Requirements:
 * - Source title must have at most one release
 * - All copies from source release are moved to the new release on target
 * 
 * @param sourceId The title to merge FROM (will be deleted)
 * @param targetId The title to merge INTO
 * @param releaseData Data for the new release (platform, edition, etc.)
 * @returns The created release ID
 */
export async function mergeGameTitleAsRelease(
    sourceId: string, 
    targetId: string, 
    releaseData: {
        platform: string;
        edition?: string;
        region?: string;
        releaseDate?: string;
    }
): Promise<string> {
    const repo = AppDataSource.getRepository(GameTitle);
    const gameReleaseRepo = AppDataSource.getRepository(GameRelease);
    const gameMappingRepo = AppDataSource.getRepository(GameExternalMapping);
    const itemRepo = AppDataSource.getRepository(Item);
    
    // Get source with releases
    const source = await repo.findOne({
        where: {id: sourceId}, 
        relations: ['releases', 'releases.items', 'owner']
    });
    const target = await repo.findOne({where: {id: targetId}});
    
    if (!source || !target) {
        throw new Error('Source or target game title not found');
    }
    
    if (sourceId === targetId) {
        throw new Error('Cannot merge a title with itself');
    }
    
    // Check that source has at most one release
    if (source.releases && source.releases.length > 1) {
        throw new Error('Source title has multiple releases. Use standard merge instead, or merge releases individually.');
    }
    
    // Create a new release on the target title
    const newRelease = gameReleaseRepo.create({
        gameTitle: {id: targetId},
        platform: releaseData.platform,
        edition: releaseData.edition || null,
        region: releaseData.region || null,
        releaseDate: releaseData.releaseDate || null,
        owner: source.owner,
    });
    await gameReleaseRepo.save(newRelease);
    
    // Move all copies from source release(s) to the new release
    if (source.releases) {
        for (const oldRelease of source.releases) {
            if (oldRelease.items) {
                for (const item of oldRelease.items) {
                    await itemRepo.update({id: item.id}, {gameRelease: {id: newRelease.id}});
                }
            }
            
            // Delete the old release (items already moved)
            await gameReleaseRepo.delete({id: oldRelease.id});
        }
    }
    
    // Update mappings to point to target title with new release
    await gameMappingRepo
        .createQueryBuilder()
        .update()
        .set({
            gameTitle: {id: targetId},
            gameRelease: {id: newRelease.id},
        })
        .where('game_title_id = :sourceId', {sourceId})
        .execute();
    
    // Delete the source title
    await repo.delete({id: sourceId});
    
    return newRelease.id;
}

// ============ Metadata Management Functions ============

// NOTE: Similar titles functionality has been moved to SimilarTitlePairService
// which uses background jobs and per-pair dismissals.
// The functions below handle missing metadata and invalid player counts only.

/**
 * Find game titles that are missing essential metadata.
 * Missing metadata = no description AND no cover image.
 * 
 * @param ownerId Owner user ID
 * @param includeDismissed Whether to include dismissed items
 * @returns Titles missing metadata
 */
export async function findTitlesMissingMetadata(
    ownerId: number, 
    includeDismissed = false
): Promise<GameTitle[]> {
    const repo = AppDataSource.getRepository(GameTitle);
    
    // Get all titles for owner
    const titles = await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['releases'],
        order: {name: 'ASC'},
    });
    
    // Filter to those missing metadata
    return titles.filter(title => {
        // Skip dismissed if not including them
        if (!includeDismissed && title.dismissedMissingMetadata) {
            return false;
        }
        
        // Missing metadata = no description AND no cover image
        const missingDescription = !title.description || title.description.trim() === '';
        const missingCover = !title.coverImageUrl || title.coverImageUrl.trim() === '';
        
        return missingDescription && missingCover;
    });
}

/**
 * Find game titles with invalid or missing player counts.
 * 
 * **Player Count Logic:**
 * - **Singleplayer-only games** (no multiplayer modes enabled): Always considered valid.
 *   When no modes are enabled (supportsOnline=false, supportsLocalCouch=false, supportsLocalLAN=false, supportsPhysical=false),
 *   null overall player counts are treated as "implied 1 player" - this is not an issue.
 * 
 * - **Multiplayer games** (any mode enabled): Considered invalid if:
 *   1. Overall max player count is null (unknown total player capacity)
 *   2. Any enabled mode has null max player count (unknown mode-specific capacity)
 * 
 * This distinction helps users identify games that need metadata enrichment,
 * while not flagging every singleplayer game as "missing" player info.
 * 
 * @param ownerId Owner user ID
 * @param includeDismissed Whether to include dismissed items
 * @returns Titles with invalid player counts (multiplayer games with unknown counts)
 */
export async function findTitlesWithInvalidPlayerCounts(
    ownerId: number, 
    includeDismissed = false
): Promise<GameTitle[]> {
    const repo = AppDataSource.getRepository(GameTitle);
    
    // Get all titles for owner
    const titles = await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['releases'],
        order: {name: 'ASC'},
    });
    
    // Filter to those with invalid player counts
    return titles.filter(title => {
        // Skip dismissed if not including them
        if (!includeDismissed && title.dismissedInvalidPlayers) {
            return false;
        }
        
        // Check if this is a multiplayer game
        const isMultiplayer = title.supportsOnline || title.supportsLocalCouch || title.supportsLocalLAN || title.supportsPhysical;
        
        if (!isMultiplayer) {
            // Singleplayer-only: no issue (null overall = implied 1 player)
            return false;
        }
        
        // Multiplayer game: check for missing counts
        // Issue if overall max is null
        if (title.overallMaxPlayers === null) {
            return true;
        }
        
        // Issue if mode is enabled but mode-specific max is null
        if (title.supportsOnline && title.onlineMaxPlayers === null) {
            return true;
        }
        if (title.supportsLocalCouch && title.couchMaxPlayers === null) {
            return true;
        }
        if (title.supportsLocalLAN && title.lanMaxPlayers === null) {
            return true;
        }
        if (title.supportsPhysical && title.physicalMaxPlayers === null) {
            return true;
        }
        
        return false;
    });
}

// Note: 'similar' dismissal type is deprecated - similar titles now use per-pair dismissals
// via SimilarTitlePairService. Keeping 'similar' for backwards compatibility but it's no-op.
export type DismissalType = 'similar' | 'missing_metadata' | 'invalid_players';

/**
 * Dismiss a title from a specific issue type.
 * Note: 'similar' type is deprecated, use SimilarTitlePairService.dismissPair() instead.
 * 
 * @param titleId Title ID to dismiss
 * @param dismissalType Type of dismissal
 */
export async function dismissTitle(titleId: string, dismissalType: DismissalType): Promise<void> {
    const repo = AppDataSource.getRepository(GameTitle);
    
    const updates: Partial<GameTitle> = {};
    switch (dismissalType) {
        case 'similar':
            // Deprecated - similar titles now use per-pair dismissals
            // Keep for backwards compatibility but do nothing
            return;
        case 'missing_metadata':
            updates.dismissedMissingMetadata = true;
            break;
        case 'invalid_players':
            updates.dismissedInvalidPlayers = true;
            break;
    }
    
    await repo.update({id: titleId}, updates as Record<string, unknown>);
}

/**
 * Undismiss a title from a specific issue type.
 * Note: 'similar' type is deprecated, use SimilarTitlePairService.undismissPair() instead.
 * 
 * @param titleId Title ID to undismiss
 * @param dismissalType Type of dismissal to clear
 */
export async function undismissTitle(titleId: string, dismissalType: DismissalType): Promise<void> {
    const repo = AppDataSource.getRepository(GameTitle);
    
    const updates: Partial<GameTitle> = {};
    switch (dismissalType) {
        case 'similar':
            // Deprecated - similar titles now use per-pair dismissals
            return;
        case 'missing_metadata':
            updates.dismissedMissingMetadata = false;
            break;
        case 'invalid_players':
            updates.dismissedInvalidPlayers = false;
            break;
    }
    
    await repo.update({id: titleId}, updates as Record<string, unknown>);
}

/**
 * Reset all dismissals for a user (global reset).
 * Note: 'similar' dismissals are now handled by SimilarTitlePairService.resetSimilarDismissals()
 * 
 * @param ownerId Owner user ID
 * @param dismissalType Optional specific type to reset, or all if not provided
 * @returns Number of titles affected
 */
export async function resetDismissals(
    ownerId: number, 
    dismissalType?: DismissalType
): Promise<number> {
    const repo = AppDataSource.getRepository(GameTitle);
    
    const updates: Partial<GameTitle> = {};
    // Note: 'similar' is deprecated - use SimilarTitlePairService.resetSimilarDismissals()
    if (!dismissalType || dismissalType === 'missing_metadata') {
        updates.dismissedMissingMetadata = false;
    }
    if (!dismissalType || dismissalType === 'invalid_players') {
        updates.dismissedInvalidPlayers = false;
    }
    
    // Only update if there are fields to update
    if (Object.keys(updates).length === 0) {
        return 0;
    }
    
    const result = await repo
        .createQueryBuilder()
        .update()
        .set(updates as Record<string, unknown>)
        .where('owner_id = :ownerId', {ownerId})
        .execute();
    
    return result.affected || 0;
}

/**
 * Get counts for all metadata management issue types.
 * Note: similarCount now uses the pre-computed SimilarTitlePairService data.
 * 
 * @param ownerId Owner user ID
 * @returns Object with counts for each issue type
 */
export async function getMetadataIssueCounts(ownerId: number): Promise<{
    similarCount: number;
    missingMetadataCount: number;
    invalidPlayersCount: number;
    totalCount: number;
}> {
    // Import here to avoid circular dependency
    const {getSimilarPairCount} = await import('./SimilarTitlePairService');
    
    const [similarCount, missingMetadata, invalidPlayers] = await Promise.all([
        getSimilarPairCount(ownerId),
        findTitlesMissingMetadata(ownerId, false),
        findTitlesWithInvalidPlayerCounts(ownerId, false),
    ]);
    
    return {
        similarCount,
        missingMetadataCount: missingMetadata.length,
        invalidPlayersCount: invalidPlayers.length,
        totalCount: similarCount + missingMetadata.length + invalidPlayers.length,
    };
}
