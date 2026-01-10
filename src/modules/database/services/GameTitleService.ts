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
    overallMinPlayers: number;
    overallMaxPlayers: number;
    supportsOnline: boolean;
    supportsLocal: boolean;
    supportsPhysical: boolean;
    onlineMinPlayers?: number | null;
    onlineMaxPlayers?: number | null;
    localMinPlayers?: number | null;
    localMaxPlayers?: number | null;
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
    title.overallMinPlayers = data.overallMinPlayers;
    title.overallMaxPlayers = data.overallMaxPlayers;
    title.supportsOnline = data.supportsOnline;
    title.supportsLocal = data.supportsLocal;
    title.supportsPhysical = data.supportsPhysical;
    title.onlineMinPlayers = data.onlineMinPlayers ?? null;
    title.onlineMaxPlayers = data.onlineMaxPlayers ?? null;
    title.localMinPlayers = data.localMinPlayers ?? null;
    title.localMaxPlayers = data.localMaxPlayers ?? null;
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
        data.supportsLocal !== undefined ||
        data.supportsPhysical !== undefined) {
        
        const repo = AppDataSource.getRepository(GameTitle);
        const existing = await repo.findOne({where: {id}});
        if (existing) {
            const merged = {...existing, ...data};
            validatePlayerProfile({
                overallMinPlayers: merged.overallMinPlayers,
                overallMaxPlayers: merged.overallMaxPlayers,
                supportsOnline: merged.supportsOnline,
                supportsLocal: merged.supportsLocal,
                supportsPhysical: merged.supportsPhysical,
                onlineMinPlayers: merged.onlineMinPlayers,
                onlineMaxPlayers: merged.onlineMaxPlayers,
                localMinPlayers: merged.localMinPlayers,
                localMaxPlayers: merged.localMaxPlayers,
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
