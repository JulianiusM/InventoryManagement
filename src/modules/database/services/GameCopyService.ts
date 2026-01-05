import {AppDataSource} from '../dataSource';
import {GameCopy} from '../entities/gameCopy/GameCopy';
import {GameRelease} from '../entities/gameRelease/GameRelease';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';
import {Location} from '../entities/location/Location';
import {User} from '../entities/user/User';
import {GameCopyType, ItemCondition} from '../../../types/InventoryEnums';

export interface CreateGameCopyData {
    gameReleaseId: string;
    copyType: GameCopyType;
    // Digital license fields
    externalAccountId?: string | null;
    externalGameId?: string | null;
    entitlementId?: string | null;
    playtimeMinutes?: number | null;
    lastPlayedAt?: Date | null;
    isInstalled?: boolean | null;
    // Physical copy fields
    locationId?: string | null;
    condition?: ItemCondition | null;
    notes?: string | null;
    // Common fields
    lendable?: boolean;
    acquiredAt?: string | null;
    ownerId: number;
}

export async function createGameCopy(data: CreateGameCopyData): Promise<GameCopy> {
    const repo = AppDataSource.getRepository(GameCopy);
    const copy = new GameCopy();
    copy.gameRelease = {id: data.gameReleaseId} as GameRelease;
    copy.copyType = data.copyType;
    
    // Digital license fields
    if (data.externalAccountId) {
        copy.externalAccount = {id: data.externalAccountId} as ExternalAccount;
    }
    copy.externalGameId = data.externalGameId ?? null;
    copy.entitlementId = data.entitlementId ?? null;
    copy.playtimeMinutes = data.playtimeMinutes ?? null;
    copy.lastPlayedAt = data.lastPlayedAt ?? null;
    copy.isInstalled = data.isInstalled ?? null;
    
    // Physical copy fields
    if (data.locationId) {
        copy.location = {id: data.locationId} as Location;
    }
    copy.condition = data.condition ?? null;
    copy.notes = data.notes ?? null;
    
    // Common fields
    // Default lendable based on copy type
    if (data.lendable !== undefined) {
        copy.lendable = data.lendable;
    } else {
        copy.lendable = data.copyType === GameCopyType.PHYSICAL_COPY;
    }
    copy.acquiredAt = data.acquiredAt ?? null;
    copy.owner = {id: data.ownerId} as User;
    
    return await repo.save(copy);
}

export async function getGameCopyById(id: string): Promise<GameCopy | null> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.findOne({
        where: {id},
        relations: ['gameRelease', 'gameRelease.gameTitle', 'externalAccount', 'location', 'owner', 'loans', 'barcodes'],
    });
}

export async function getGameCopiesByReleaseId(releaseId: string): Promise<GameCopy[]> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.find({
        where: {gameRelease: {id: releaseId}},
        relations: ['externalAccount', 'location', 'loans'],
        order: {createdAt: 'DESC'},
    });
}

export async function getAllGameCopies(ownerId: number): Promise<GameCopy[]> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['gameRelease', 'gameRelease.gameTitle', 'externalAccount', 'location'],
        order: {createdAt: 'DESC'},
    });
}

export async function getPhysicalGameCopies(ownerId: number): Promise<GameCopy[]> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            copyType: GameCopyType.PHYSICAL_COPY,
        },
        relations: ['gameRelease', 'gameRelease.gameTitle', 'location', 'barcodes'],
        order: {createdAt: 'DESC'},
    });
}

export async function getDigitalGameCopies(ownerId: number): Promise<GameCopy[]> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            copyType: GameCopyType.DIGITAL_LICENSE,
        },
        relations: ['gameRelease', 'gameRelease.gameTitle', 'externalAccount'],
        order: {createdAt: 'DESC'},
    });
}

export async function updateGameCopy(id: string, data: Partial<Omit<GameCopy, 'gameRelease' | 'externalAccount' | 'location' | 'owner' | 'loans' | 'barcodes'>>): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopy);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function updateGameCopyLocation(id: string, locationId: string | null): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopy);
    const copy = await repo.findOne({where: {id}});
    if (copy) {
        copy.location = locationId ? {id: locationId} as Location : null;
        await repo.save(copy);
    }
}

export async function deleteGameCopy(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopy);
    await repo.delete({id});
}

export async function getGameCopiesByExternalAccountId(accountId: string): Promise<GameCopy[]> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.find({
        where: {externalAccount: {id: accountId}},
        relations: ['gameRelease', 'gameRelease.gameTitle'],
        order: {createdAt: 'DESC'},
    });
}

export async function findGameCopyByExternalId(accountId: string, externalGameId: string): Promise<GameCopy | null> {
    const repo = AppDataSource.getRepository(GameCopy);
    return await repo.findOne({
        where: {
            externalAccount: {id: accountId},
            externalGameId: externalGameId,
        },
        relations: ['gameRelease', 'gameRelease.gameTitle'],
    });
}
