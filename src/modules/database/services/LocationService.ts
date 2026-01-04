import {AppDataSource} from '../dataSource';
import {Location} from '../entities/location/Location';
import {User} from '../entities/user/User';
import {LocationKind} from '../../../types/InventoryEnums';

export async function createLocation(data: {
    name: string;
    kind?: LocationKind;
    parentId?: string | null;
    qrCode?: string | null;
    ownerId: number;
}): Promise<Location> {
    const repo = AppDataSource.getRepository(Location);
    const location = new Location();
    location.name = data.name;
    location.kind = data.kind || LocationKind.OTHER;
    if (data.parentId) {
        location.parent = {id: data.parentId} as Location;
    }
    location.qrCode = data.qrCode ?? null;
    location.owner = {id: data.ownerId} as User;
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
        where: {owner: {id: ownerId}},
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

export async function updateLocation(id: string, data: {
    name?: string;
    kind?: LocationKind;
    parentId?: string | null;
    qrCode?: string | null;
}): Promise<void> {
    const repo = AppDataSource.getRepository(Location);
    const location = await repo.findOne({where: {id}});
    if (!location) return;
    
    if (data.name !== undefined) {
        location.name = data.name;
    }
    if (data.kind !== undefined) {
        location.kind = data.kind;
    }
    if (data.parentId !== undefined) {
        location.parent = data.parentId ? {id: data.parentId} as Location : null;
    }
    if (data.qrCode !== undefined) {
        location.qrCode = data.qrCode;
    }
    await repo.save(location);
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
        where: {owner: {id: ownerId}},
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
