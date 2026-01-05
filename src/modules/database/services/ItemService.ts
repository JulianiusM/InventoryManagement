import {AppDataSource} from '../dataSource';
import {Item} from '../entities/item/Item';
import {Location} from '../entities/location/Location';
import {User} from '../entities/user/User';
import {GameRelease} from '../entities/gameRelease/GameRelease';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';
import {ItemType, ItemCondition, GameCopyType} from '../../../types/InventoryEnums';

export async function createItem(data: {
    name: string;
    type?: ItemType;
    description?: string | null;
    condition?: ItemCondition | null;
    serialNumber?: string | null;
    tags?: string[] | null;
    locationId?: string | null;
    ownerId: number;
    // Game-specific fields
    gameReleaseId?: string | null;
    gameCopyType?: GameCopyType | null;
    externalAccountId?: string | null;
    externalGameId?: string | null;
    entitlementId?: string | null;
    playtimeMinutes?: number | null;
    lastPlayedAt?: Date | null;
    isInstalled?: boolean | null;
    lendable?: boolean;
    acquiredAt?: string | null;
}): Promise<Item> {
    const repo = AppDataSource.getRepository(Item);
    const item = new Item();
    item.name = data.name;
    item.type = data.type || ItemType.OTHER;
    item.description = data.description ?? null;
    item.condition = data.condition ?? null;
    item.serialNumber = data.serialNumber ?? null;
    item.tags = data.tags ?? null;
    if (data.locationId) {
        item.location = {id: data.locationId} as Location;
    }
    item.owner = {id: data.ownerId} as User;
    
    // Game-specific fields
    if (data.gameReleaseId) {
        item.gameRelease = {id: data.gameReleaseId} as GameRelease;
    }
    item.gameCopyType = data.gameCopyType ?? null;
    if (data.externalAccountId) {
        item.externalAccount = {id: data.externalAccountId} as ExternalAccount;
    }
    item.externalGameId = data.externalGameId ?? null;
    item.entitlementId = data.entitlementId ?? null;
    item.playtimeMinutes = data.playtimeMinutes ?? null;
    item.lastPlayedAt = data.lastPlayedAt ?? null;
    item.isInstalled = data.isInstalled ?? null;
    item.lendable = data.lendable !== undefined ? data.lendable : true;
    item.acquiredAt = data.acquiredAt ?? null;
    
    return await repo.save(item);
}

export async function getItemById(id: string): Promise<Item | null> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.findOne({
        where: {id},
        relations: ['location', 'owner', 'gameRelease', 'gameRelease.gameTitle', 'externalAccount'],
    });
}

export async function getAllItems(ownerId: number): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {owner: {id: ownerId}},
        relations: ['location'],
        order: {createdAt: 'DESC'},
    });
}

export async function updateItem(id: string, data: Partial<Omit<Item, 'location' | 'owner' | 'gameRelease' | 'externalAccount'>>): Promise<void> {
    const repo = AppDataSource.getRepository(Item);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteItem(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Item);
    await repo.delete({id});
}

export async function updateItemLocation(id: string, locationId: string | null): Promise<void> {
    const repo = AppDataSource.getRepository(Item);
    const item = await repo.findOne({where: {id}});
    if (item) {
        item.location = locationId ? {id: locationId} as Location : null;
        await repo.save(item);
    }
}

export async function getItemsByLocation(locationId: string): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {location: {id: locationId}},
        relations: ['location'],
        order: {name: 'ASC'},
    });
}

// ============ Game-specific Item Functions ============

export async function getGameItems(ownerId: number): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: [
            {owner: {id: ownerId}, type: ItemType.GAME},
            {owner: {id: ownerId}, type: ItemType.GAME_DIGITAL},
        ],
        relations: ['location', 'gameRelease', 'gameRelease.gameTitle', 'externalAccount'],
        order: {createdAt: 'DESC'},
    });
}

export async function getGameItemsByReleaseId(releaseId: string): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {gameRelease: {id: releaseId}},
        relations: ['location', 'externalAccount'],
        order: {createdAt: 'DESC'},
    });
}

export async function getPhysicalGameItems(ownerId: number): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            type: ItemType.GAME,
            gameCopyType: GameCopyType.PHYSICAL_COPY,
        },
        relations: ['location', 'gameRelease', 'gameRelease.gameTitle'],
        order: {createdAt: 'DESC'},
    });
}

export async function getDigitalGameItems(ownerId: number): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            type: ItemType.GAME_DIGITAL,
            gameCopyType: GameCopyType.DIGITAL_LICENSE,
        },
        relations: ['gameRelease', 'gameRelease.gameTitle', 'externalAccount'],
        order: {createdAt: 'DESC'},
    });
}

export async function getGameItemsByExternalAccountId(accountId: string): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {externalAccount: {id: accountId}},
        relations: ['gameRelease', 'gameRelease.gameTitle'],
        order: {createdAt: 'DESC'},
    });
}

export async function findGameItemByExternalId(accountId: string, externalGameId: string): Promise<Item | null> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.findOne({
        where: {
            externalAccount: {id: accountId},
            externalGameId: externalGameId,
        },
        relations: ['gameRelease', 'gameRelease.gameTitle'],
    });
}

export async function createGameItem(data: {
    name: string;
    gameReleaseId: string;
    gameCopyType: GameCopyType;
    externalAccountId?: string | null;
    externalGameId?: string | null;
    entitlementId?: string | null;
    playtimeMinutes?: number | null;
    lastPlayedAt?: Date | null;
    isInstalled?: boolean | null;
    locationId?: string | null;
    condition?: ItemCondition | null;
    description?: string | null;
    lendable?: boolean;
    acquiredAt?: string | null;
    ownerId: number;
}): Promise<Item> {
    // Determine item type based on copy type
    const type = data.gameCopyType === GameCopyType.DIGITAL_LICENSE 
        ? ItemType.GAME_DIGITAL 
        : ItemType.GAME;
    
    // Default lendable based on copy type
    const lendable = data.lendable !== undefined 
        ? data.lendable 
        : (data.gameCopyType === GameCopyType.PHYSICAL_COPY);

    return await createItem({
        name: data.name,
        type,
        description: data.description,
        condition: data.condition,
        locationId: data.locationId,
        ownerId: data.ownerId,
        gameReleaseId: data.gameReleaseId,
        gameCopyType: data.gameCopyType,
        externalAccountId: data.externalAccountId,
        externalGameId: data.externalGameId,
        entitlementId: data.entitlementId,
        playtimeMinutes: data.playtimeMinutes,
        lastPlayedAt: data.lastPlayedAt,
        isInstalled: data.isInstalled,
        lendable,
        acquiredAt: data.acquiredAt,
    });
}
