import {AppDataSource} from '../dataSource';
import {Location} from '../entities/location/Location';
import {IsNull} from 'typeorm';

export async function createLocation(data: Partial<Location>): Promise<Location> {
    const repo = AppDataSource.getRepository(Location);
    const location = repo.create(data);
    return await repo.save(location);
}

export async function getLocationById(id: number): Promise<Location | null> {
    const repo = AppDataSource.getRepository(Location);
    return await repo.findOne({
        where: {id},
        relations: ['parent', 'children'],
    });
}

export async function getAllLocations(): Promise<Location[]> {
    const repo = AppDataSource.getRepository(Location);
    return await repo.find({
        order: {name: 'ASC'},
    });
}

export async function getLocationByQrCode(qrCode: string): Promise<Location | null> {
    const repo = AppDataSource.getRepository(Location);
    return await repo.findOne({
        where: {qrCode},
    });
}

export async function updateLocation(id: number, data: Partial<Location>): Promise<void> {
    const repo = AppDataSource.getRepository(Location);
    await repo.update({id}, data);
}

export async function deleteLocation(id: number): Promise<void> {
    const repo = AppDataSource.getRepository(Location);
    await repo.delete({id});
}

/**
 * Build a hierarchical tree structure from flat location list
 */
export async function getLocationTree(): Promise<Location[]> {
    const repo = AppDataSource.getRepository(Location);
    const allLocations = await repo.find({
        order: {name: 'ASC'},
    });

    const locationMap = new Map<number, Location>();
    for (const loc of allLocations) {
        loc.childrenNodes = [];
        locationMap.set(loc.id, loc);
    }

    const roots: Location[] = [];

    for (const loc of allLocations) {
        if (loc.parentId && locationMap.has(loc.parentId)) {
            const parent = locationMap.get(loc.parentId)!;
            parent.childrenNodes!.push(loc);
        } else {
            roots.push(loc);
        }
    }

    return roots;
}

/**
 * Get all descendant location IDs for a given location
 */
export async function getDescendantIds(locationId: number): Promise<number[]> {
    const tree = await getLocationTree();
    const result: number[] = [];

    function collectDescendants(nodes: Location[], collecting: boolean): void {
        for (const node of nodes) {
            if (node.id === locationId || collecting) {
                if (collecting) {
                    result.push(node.id);
                }
                if (node.childrenNodes) {
                    collectDescendants(node.childrenNodes, node.id === locationId || collecting);
                }
            } else if (node.childrenNodes) {
                collectDescendants(node.childrenNodes, false);
            }
        }
    }

    collectDescendants(tree, false);
    return result;
}
