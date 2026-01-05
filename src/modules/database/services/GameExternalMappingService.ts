import {AppDataSource} from '../dataSource';
import {GameExternalMapping} from '../entities/gameExternalMapping/GameExternalMapping';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {GameRelease} from '../entities/gameRelease/GameRelease';
import {User} from '../entities/user/User';
import {GameProvider, MappingStatus} from '../../../types/InventoryEnums';

export interface CreateMappingData {
    provider: GameProvider;
    externalGameId: string;
    externalGameName?: string | null;
    gameTitleId?: string | null;
    gameReleaseId?: string | null;
    status?: MappingStatus;
    confidenceScore?: number | null;
    ownerId: number;
}

export async function createMapping(data: CreateMappingData): Promise<GameExternalMapping> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    const mapping = new GameExternalMapping();
    mapping.provider = data.provider;
    mapping.externalGameId = data.externalGameId;
    mapping.externalGameName = data.externalGameName ?? null;
    if (data.gameTitleId) {
        mapping.gameTitle = {id: data.gameTitleId} as GameTitle;
    }
    if (data.gameReleaseId) {
        mapping.gameRelease = {id: data.gameReleaseId} as GameRelease;
    }
    mapping.status = data.status || MappingStatus.PENDING;
    mapping.confidenceScore = data.confidenceScore ?? null;
    mapping.owner = {id: data.ownerId} as User;
    return await repo.save(mapping);
}

export async function getMappingById(id: string): Promise<GameExternalMapping | null> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    return await repo.findOne({
        where: {id},
        relations: ['gameTitle', 'gameRelease', 'owner'],
    });
}

export async function getMappingByExternalId(provider: GameProvider, externalGameId: string, ownerId: number): Promise<GameExternalMapping | null> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    return await repo.findOne({
        where: {
            provider: provider,
            externalGameId: externalGameId,
            owner: {id: ownerId},
        },
        relations: ['gameTitle', 'gameRelease'],
    });
}

export async function getPendingMappings(ownerId: number): Promise<GameExternalMapping[]> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            status: MappingStatus.PENDING,
        },
        order: {externalGameName: 'ASC'},
    });
}

export async function getAllMappings(ownerId: number): Promise<GameExternalMapping[]> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    return await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['gameTitle', 'gameRelease'],
        order: {createdAt: 'DESC'},
    });
}

export async function updateMapping(id: string, data: Partial<Omit<GameExternalMapping, 'owner' | 'gameTitle' | 'gameRelease'>> & {
    gameTitleId?: string | null;
    gameReleaseId?: string | null;
}): Promise<void> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    const mapping = await repo.findOne({where: {id}});
    if (mapping) {
        if (data.status !== undefined) {
            mapping.status = data.status;
        }
        if (data.externalGameName !== undefined) {
            mapping.externalGameName = data.externalGameName;
        }
        if (data.confidenceScore !== undefined) {
            mapping.confidenceScore = data.confidenceScore;
        }
        if (data.gameTitleId !== undefined) {
            mapping.gameTitle = data.gameTitleId ? {id: data.gameTitleId} as GameTitle : null;
        }
        if (data.gameReleaseId !== undefined) {
            mapping.gameRelease = data.gameReleaseId ? {id: data.gameReleaseId} as GameRelease : null;
        }
        mapping.updatedAt = new Date();
        await repo.save(mapping);
    }
}

export async function deleteMapping(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    await repo.delete({id});
}

export async function upsertMapping(data: CreateMappingData): Promise<GameExternalMapping> {
    const repo = AppDataSource.getRepository(GameExternalMapping);
    
    // Check if mapping exists
    let mapping = await repo.findOne({
        where: {
            provider: data.provider,
            externalGameId: data.externalGameId,
            owner: {id: data.ownerId},
        },
    });
    
    if (mapping) {
        // Update existing
        if (data.externalGameName !== undefined) {
            mapping.externalGameName = data.externalGameName;
        }
        if (data.gameTitleId !== undefined) {
            mapping.gameTitle = data.gameTitleId ? {id: data.gameTitleId} as GameTitle : null;
        }
        if (data.gameReleaseId !== undefined) {
            mapping.gameRelease = data.gameReleaseId ? {id: data.gameReleaseId} as GameRelease : null;
        }
        if (data.status !== undefined) {
            mapping.status = data.status;
        }
        if (data.confidenceScore !== undefined) {
            mapping.confidenceScore = data.confidenceScore;
        }
        mapping.updatedAt = new Date();
        return await repo.save(mapping);
    } else {
        return await createMapping(data);
    }
}
