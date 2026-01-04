import {AppDataSource} from '../dataSource';
import {Item} from '../entities/item/Item';
import {FindOptionsWhere} from 'typeorm';

export async function createItem(data: Partial<Item>): Promise<Item> {
    const repo = AppDataSource.getRepository(Item);
    const item = repo.create(data);
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
        where: {ownerId},
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
    await repo.update({id}, {locationId} as Record<string, unknown>);
}

export async function getItemsByLocation(locationId: string): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {locationId},
        relations: ['location'],
        order: {name: 'ASC'},
    });
}
