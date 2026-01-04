import {AppDataSource} from '../dataSource';
import {Item} from '../entities/item/Item';
import {FindOptionsWhere} from 'typeorm';

export async function createItem(data: Partial<Item>): Promise<Item> {
    const repo = AppDataSource.getRepository(Item);
    const item = repo.create(data);
    return await repo.save(item);
}

export async function getItemById(id: number): Promise<Item | null> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.findOne({
        where: {id},
        relations: ['location'],
    });
}

export async function getAllItems(ownerId?: number): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    const where: FindOptionsWhere<Item> = {};
    if (ownerId !== undefined) {
        where.ownerId = ownerId;
    }
    return await repo.find({
        where,
        relations: ['location'],
        order: {createdAt: 'DESC'},
    });
}

export async function updateItem(id: number, data: Partial<Omit<Item, 'location'>>): Promise<void> {
    const repo = AppDataSource.getRepository(Item);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteItem(id: number): Promise<void> {
    const repo = AppDataSource.getRepository(Item);
    await repo.delete({id});
}

export async function updateItemLocation(id: number, locationId: number | null): Promise<void> {
    const repo = AppDataSource.getRepository(Item);
    await repo.update({id}, {locationId});
}

export async function getItemsByLocation(locationId: number): Promise<Item[]> {
    const repo = AppDataSource.getRepository(Item);
    return await repo.find({
        where: {locationId},
        relations: ['location'],
        order: {name: 'ASC'},
    });
}
