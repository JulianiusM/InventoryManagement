import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {User} from '../entities/user/User';
import {GameType} from '../../../types/InventoryEnums';
import {validatePlayerProfile} from './GameValidationService';

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
    const gameReleaseRepo = AppDataSource.getRepository('GameRelease');
    const gameMappingRepo = AppDataSource.getRepository('GameExternalMapping');
    
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
