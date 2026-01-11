import * as locationService from '../modules/database/services/LocationService';
import * as itemService from '../modules/database/services/ItemService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {Location} from '../modules/database/entities/location/Location';
import {LocationKind} from '../types/InventoryEnums';
import settings from '../modules/settings';

export async function listLocations(ownerId: number, options?: {
    page?: number;
    perPage?: number;
    search?: string;
}) {
    requireAuthenticatedUser(ownerId);
    let locations = await locationService.getAllLocations(ownerId);
    let tree = await locationService.getLocationTree(ownerId);
    
    const page = options?.page || 1;
    const perPage = Math.min(options?.perPage || settings.value.paginationDefaultLocations, settings.value.paginationMaxPerPage);
    
    // Apply search filter
    if (options?.search) {
        const searchLower = options.search.toLowerCase();
        locations = locations.filter(loc =>
            loc.name.toLowerCase().includes(searchLower) ||
            (loc.qrCode && loc.qrCode.toLowerCase().includes(searchLower)) ||
            loc.kind.toLowerCase().includes(searchLower)
        );
        
        // Filter tree to only show matching locations and their ancestors
        const matchingIds = new Set(locations.map(l => l.id));
        tree = filterTree(tree, matchingIds);
    }
    
    // Calculate pagination
    const totalLocations = locations.length;
    const totalPages = Math.ceil(totalLocations / perPage);
    const skip = (page - 1) * perPage;
    const paginatedLocations = locations.slice(skip, skip + perPage);
    
    return {
        locations: paginatedLocations,
        tree, // Filtered tree for visualization
        pagination: {
            page,
            perPage,
            totalItems: totalLocations,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        },
        filters: {
            search: options?.search || ''
        }
    };
}

// Helper function to filter tree recursively
function filterTree(nodes: any[], matchingIds: Set<string>): any[] {
    const result: any[] = [];
    
    for (const node of nodes) {
        // Check if this node matches or has matching descendants
        const hasMatchingDescendants = node.childrenNodes && 
            node.childrenNodes.some((child: any) => 
                matchingIds.has(child.id) || hasDescendants(child, matchingIds)
            );
        
        if (matchingIds.has(node.id) || hasMatchingDescendants) {
            const filteredNode = { ...node };
            if (filteredNode.childrenNodes) {
                filteredNode.childrenNodes = filterTree(filteredNode.childrenNodes, matchingIds);
            }
            result.push(filteredNode);
        }
    }
    
    return result;
}

// Helper to check if node has any matching descendants
function hasDescendants(node: any, matchingIds: Set<string>): boolean {
    if (!node.childrenNodes) return false;
    
    for (const child of node.childrenNodes) {
        if (matchingIds.has(child.id) || hasDescendants(child, matchingIds)) {
            return true;
        }
    }
    return false;
}

export async function getLocationDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const location = await locationService.getLocationById(id);
    if (!location) {
        throw new ExpectedError('Location not found', 'error', 404);
    }
    checkOwnership(location, userId);
    
    const items = await itemService.getItemsByLocation(id);
    const allLocations = await locationService.getAllLocations(userId);
    
    return {location, items, locations: allLocations};
}

export async function createLocation(body: {
    name: string;
    kind?: string;
    parentId?: string;
    qrCode?: string;
}, ownerId: number): Promise<Location> {
    requireAuthenticatedUser(ownerId);
    const {name, kind = 'other', parentId, qrCode} = body;
    
    if (!name || name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    // Validate parent exists if provided and belongs to user
    if (parentId) {
        const parent = await locationService.getLocationById(parentId);
        if (!parent) {
            throw new ExpectedError('Parent location not found', 'error', 400);
        }
        checkOwnership(parent, ownerId);
    }
    
    // Check for duplicate QR code
    if (qrCode && qrCode.trim()) {
        const existingByQr = await locationService.getLocationByQrCode(qrCode.trim());
        if (existingByQr) {
            throw new ExpectedError('QR code already in use', 'error', 400);
        }
    }
    
    return await locationService.createLocation({
        name: name.trim(),
        kind: kind as LocationKind,
        parentId: parentId || null,
        qrCode: qrCode?.trim() || null,
        ownerId,
    });
}

export async function updateLocation(
    id: string,
    body: {name?: string; kind?: string; parentId?: string; qrCode?: string},
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const location = await locationService.getLocationById(id);
    if (!location) {
        throw new ExpectedError('Location not found', 'error', 404);
    }
    checkOwnership(location, userId);
    
    const updates: Partial<Location> = {};
    
    if (body.name !== undefined) {
        if (!body.name.trim()) {
            throw new ExpectedError('Name is required', 'error', 400);
        }
        updates.name = body.name.trim();
    }
    
    if (body.kind !== undefined) {
        updates.kind = body.kind as LocationKind;
    }
    
    if (body.parentId !== undefined) {
        const newParentId = body.parentId || null;
        
        // Prevent circular reference
        if (newParentId === id) {
            throw new ExpectedError('Location cannot be its own parent', 'error', 400);
        }
        
        if (newParentId) {
            const parent = await locationService.getLocationById(newParentId);
            if (!parent) {
                throw new ExpectedError('Parent location not found', 'error', 400);
            }
            checkOwnership(parent, userId);
        }
        
        updates.parentId = newParentId;
    }
    
    if (body.qrCode !== undefined) {
        const qrValue = body.qrCode.trim() || null;
        if (qrValue) {
            const existingByQr = await locationService.getLocationByQrCode(qrValue);
            if (existingByQr && existingByQr.id !== id) {
                throw new ExpectedError('QR code already in use', 'error', 400);
            }
        }
        updates.qrCode = qrValue;
    }
    
    await locationService.updateLocation(id, updates);
}

export async function deleteLocation(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const location = await locationService.getLocationById(id);
    if (!location) {
        throw new ExpectedError('Location not found', 'error', 404);
    }
    checkOwnership(location, userId);
    
    // Move child locations to top-level (remove parent)
    if (location.children && location.children.length > 0) {
        for (const child of location.children) {
            await locationService.updateLocation(child.id, {parentId: null});
        }
    }
    
    // Clear location from items (set to unassigned)
    const items = await itemService.getItemsByLocation(id);
    for (const item of items) {
        await itemService.updateItemLocation(item.id, null);
    }
    
    // Delete the location
    await locationService.deleteLocation(id);
}
