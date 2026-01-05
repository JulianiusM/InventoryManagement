import {AppDataSource} from '../dataSource';
import {GameRelease} from '../entities/gameRelease/GameRelease';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {User} from '../entities/user/User';
import {GamePlatform} from '../../../types/InventoryEnums';

export interface CreateGameReleaseData {
    gameTitleId: string;
    platform?: GamePlatform;
    edition?: string | null;
    region?: string | null;
    releaseDate?: string | null;
    playersOverrideMin?: number | null;
    playersOverrideMax?: number | null;
    ownerId: number;
}

export async function createGameRelease(data: CreateGameReleaseData): Promise<GameRelease> {
    const repo = AppDataSource.getRepository(GameRelease);
    const release = new GameRelease();
    release.gameTitle = {id: data.gameTitleId} as GameTitle;
    release.platform = data.platform || GamePlatform.OTHER;
    release.edition = data.edition ?? null;
    release.region = data.region ?? null;
    release.releaseDate = data.releaseDate ?? null;
    release.playersOverrideMin = data.playersOverrideMin ?? null;
    release.playersOverrideMax = data.playersOverrideMax ?? null;
    release.owner = {id: data.ownerId} as User;
    return await repo.save(release);
}

export async function getGameReleaseById(id: string): Promise<GameRelease | null> {
    const repo = AppDataSource.getRepository(GameRelease);
    return await repo.findOne({
        where: {id},
        relations: ['gameTitle', 'owner', 'items'],
    });
}

export async function getGameReleasesByTitleId(titleId: string): Promise<GameRelease[]> {
    const repo = AppDataSource.getRepository(GameRelease);
    return await repo.find({
        where: {gameTitle: {id: titleId}},
        relations: ['items'],
        order: {platform: 'ASC'},
    });
}

export async function getAllGameReleases(ownerId: number): Promise<GameRelease[]> {
    const repo = AppDataSource.getRepository(GameRelease);
    return await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['gameTitle', 'items'],
        order: {createdAt: 'DESC'},
    });
}

export async function updateGameRelease(id: string, data: Partial<Omit<GameRelease, 'gameTitle' | 'owner' | 'copies'>>): Promise<void> {
    const repo = AppDataSource.getRepository(GameRelease);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteGameRelease(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameRelease);
    await repo.delete({id});
}

/**
 * Merge two game releases without losing information
 * Moves all copies (items) from source to target, then deletes source
 * Also updates mappings pointing to the source release
 * @param sourceId The release to merge FROM (will be deleted)
 * @param targetId The release to merge INTO (will be kept)
 * @returns Number of copies moved
 */
export async function mergeGameReleases(sourceId: string, targetId: string): Promise<number> {
    const repo = AppDataSource.getRepository(GameRelease);
    const itemRepo = AppDataSource.getRepository('Item');
    const gameMappingRepo = AppDataSource.getRepository('GameExternalMapping');
    
    // Get source with items
    const source = await repo.findOne({where: {id: sourceId}, relations: ['items']});
    const target = await repo.findOne({where: {id: targetId}});
    
    if (!source || !target) {
        throw new Error('Source or target game release not found');
    }
    
    if (sourceId === targetId) {
        throw new Error('Cannot merge a release with itself');
    }
    
    // Move all items (copies) from source to target
    const itemsToMove = source.items || [];
    for (const item of itemsToMove) {
        await itemRepo.update({id: item.id}, {gameRelease: {id: targetId}});
    }
    
    // Update mappings to point to target release
    await gameMappingRepo
        .createQueryBuilder()
        .update()
        .set({gameRelease: {id: targetId}})
        .where('game_release_id = :sourceId', {sourceId})
        .execute();
    
    // Delete the source release (copies are already moved)
    await repo.delete({id: sourceId});
    
    return itemsToMove.length;
}
