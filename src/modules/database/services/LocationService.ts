import {AppDataSource} from '../dataSource';
import {Location} from '../entities/location/Location';
import {IsNull} from 'typeorm';

export async function createLocation(data: Partial<Location>): Promise<Location> {
    const repo = AppDataSource.getRepository(Location);
    const location = repo.create(data);
    return await repo.save(location);
}

export async function getLocationById(id: string): Promise<Location | null> {
    const repo = AppDataSource.getRepository(Location);
    return await repo.findOne({
        where: {id},
        relations: ['parent', 'children', 'owner'],
    });
}

export async function getAllLocations(ownerId: number): Promise<Location[]> {
    const repo = AppDataSource.getRepository(Location);
    return await repo.find({
        where: {ownerId},
        order: {name: 'ASC'},
    });
}

export async function getLocationByQrCode(qrCode: string): Promise<Location | null> {
    const repo = AppDataSource.getRepository(Location);
    return await repo.findOne({
        where: {qrCode},
        relations: ['owner'],
    });
}

export async function updateLocation(id: string, data: Partial<Omit<Location, 'parent' | 'children' | 'owner'>>): Promise<void> {
    const repo = AppDataSource.getRepository(Location);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteLocation(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Location);
    await repo.delete({id});
}

/**
 * Build a hierarchical tree structure from flat location list
 */
export async function getLocationTree(ownerId: number): Promise<Location[]> {
    const repo = AppDataSource.getRepository(Location);
    const allLocations = await repo.find({
        where: {ownerId},
        order: {name: 'ASC'},
    });

    const locationMap = new Map<string, Location>();
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
export async function getDescendantIds(locationId: string, ownerId: number): Promise<string[]> {
    const tree = await getLocationTree(ownerId);
    const result: string[] = [];

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
