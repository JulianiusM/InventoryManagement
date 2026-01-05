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
        relations: ['gameTitle', 'owner', 'copies'],
    });
}

export async function getGameReleasesByTitleId(titleId: string): Promise<GameRelease[]> {
    const repo = AppDataSource.getRepository(GameRelease);
    return await repo.find({
        where: {gameTitle: {id: titleId}},
        relations: ['copies'],
        order: {platform: 'ASC'},
    });
}

export async function getAllGameReleases(ownerId: number): Promise<GameRelease[]> {
    const repo = AppDataSource.getRepository(GameRelease);
    return await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['gameTitle', 'copies'],
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
