import {AppDataSource} from '../dataSource';
import {ItemMovement} from '../entities/itemMovement/ItemMovement';

export async function createMovement(data: Partial<ItemMovement>): Promise<ItemMovement> {
    const repo = AppDataSource.getRepository(ItemMovement);
    const movement = repo.create(data);
    return await repo.save(movement);
}

export async function getMovementsByItemId(itemId: number): Promise<ItemMovement[]> {
    const repo = AppDataSource.getRepository(ItemMovement);
    return await repo.find({
        where: {itemId},
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
    itemId: number,
    fromLocationId: number | null,
    toLocationId: number | null,
    note?: string | null,
    movedByUserId?: number | null
): Promise<ItemMovement> {
    return await createMovement({
        itemId,
        fromLocationId,
        toLocationId,
        note,
        movedByUserId,
    });
}
