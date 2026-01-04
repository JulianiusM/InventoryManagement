import {AppDataSource} from '../dataSource';
import {Item} from '../entities/item/Item';
import {Location} from '../entities/location/Location';
import {User} from '../entities/user/User';
import {ItemType, ItemCondition} from '../../../types/InventoryEnums';

export async function createItem(data: {
    name: string;
    type?: ItemType;
    description?: string | null;
    condition?: ItemCondition | null;
    serialNumber?: string | null;
    tags?: string[] | null;
    locationId?: string | null;
    ownerId: number;
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
    return await repo.save(item);
}

export async function getItemById(id: string): Promise<Item | null> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.findOne({
        where: {id},
        relations: ['location', 'owner'],
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

export async function updateItem(id: string, data: Partial<Omit<Item, 'location' | 'owner'>>): Promise<void> {
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
