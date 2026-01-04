import * as locationService from '../modules/database/services/LocationService';
import * as itemService from '../modules/database/services/ItemService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {Location} from '../modules/database/entities/location/Location';
import {LocationKind} from '../types/InventoryEnums';

export async function listLocations(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    const tree = await locationService.getLocationTree(ownerId);
    return {locations, tree};
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
