import {AppDataSource} from '../dataSource';
import {ItemMovement} from '../entities/itemMovement/ItemMovement';
import {Item} from '../entities/item/Item';
import {Location} from '../entities/location/Location';
import {User} from '../entities/user/User';

export async function createMovement(data: Partial<ItemMovement>): Promise<ItemMovement> {
    const repo = AppDataSource.getRepository(ItemMovement);
    const movement = repo.create(data);
    return await repo.save(movement);
}

export async function getMovementsByItemId(itemId: string): Promise<ItemMovement[]> {
    const repo = AppDataSource.getRepository(ItemMovement);
    return await repo.find({
        where: {item: {id: itemId}},
        relations: ['fromLocation', 'toLocation'],
        order: {movedAt: 'DESC'},
    });
}

export async function getRecentMovements(limit = 20): Promise<ItemMovement[]> {
    const repo = AppDataSource.getRepository(ItemMovement);
    return await repo.find({
        relations: ['item', 'fromLocation', 'toLocation'],
        order: {movedAt: 'DESC'},
        take: limit,
    });
}

/**
 * Record a movement from one location to another
 */
export async function recordMovement(
    itemId: string,
    fromLocationId: string | null,
    toLocationId: string | null,
    note?: string | null,
    movedByUserId?: number | null
): Promise<ItemMovement> {
    const repo = AppDataSource.getRepository(ItemMovement);
    const movement = new ItemMovement();
    movement.item = {id: itemId} as Item;
    if (fromLocationId) {
        movement.fromLocation = {id: fromLocationId} as Location;
    }
    if (toLocationId) {
        movement.toLocation = {id: toLocationId} as Location;
    }
    movement.note = note ?? null;
    if (movedByUserId) {
        movement.movedByUser = {id: movedByUserId} as User;
    }
    return await repo.save(movement);
}

export async function deleteMovementsByItemId(itemId: string): Promise<void> {
    const repo = AppDataSource.getRepository(ItemMovement);
    await repo.delete({item: {id: itemId}});
}
