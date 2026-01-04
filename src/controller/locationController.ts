import * as locationService from '../modules/database/services/LocationService';
import * as itemService from '../modules/database/services/ItemService';
import {ExpectedError} from '../modules/lib/errors';
import {Location} from '../modules/database/entities/location/Location';

export async function listLocations() {
    const locations = await locationService.getAllLocations();
    const tree = await locationService.getLocationTree();
    return {locations, tree};
}

export async function getLocationDetail(id: number) {
    const location = await locationService.getLocationById(id);
    if (!location) {
        throw new ExpectedError('Location not found', 'error', 404);
    }
    
    const items = await itemService.getItemsByLocation(id);
    const allLocations = await locationService.getAllLocations();
    
    return {location, items, locations: allLocations};
}

export async function createLocation(body: {
    name: string;
    kind?: string;
    parentId?: string | number;
    qrCode?: string;
}): Promise<Location> {
    const {name, kind = 'other', parentId, qrCode} = body;
    
    if (!name || name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    // Validate parent exists if provided
    if (parentId) {
        const parent = await locationService.getLocationById(Number(parentId));
        if (!parent) {
            throw new ExpectedError('Parent location not found', 'error', 400);
        }
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
        kind,
        parentId: parentId ? Number(parentId) : null,
        qrCode: qrCode?.trim() || null,
    });
}

export async function updateLocation(
    id: number,
    body: {name?: string; kind?: string; parentId?: string | number; qrCode?: string}
): Promise<void> {
    const location = await locationService.getLocationById(id);
    if (!location) {
        throw new ExpectedError('Location not found', 'error', 404);
    }
    
    const updates: Partial<Location> = {};
    
    if (body.name !== undefined) {
        if (!body.name.trim()) {
            throw new ExpectedError('Name is required', 'error', 400);
        }
        updates.name = body.name.trim();
    }
    
    if (body.kind !== undefined) {
        updates.kind = body.kind;
    }
    
    if (body.parentId !== undefined) {
        const newParentId = body.parentId ? Number(body.parentId) : null;
        
        // Prevent circular reference
        if (newParentId === id) {
            throw new ExpectedError('Location cannot be its own parent', 'error', 400);
        }
        
        if (newParentId) {
            const parent = await locationService.getLocationById(newParentId);
            if (!parent) {
                throw new ExpectedError('Parent location not found', 'error', 400);
            }
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
