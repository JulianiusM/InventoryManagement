import * as itemService from '../modules/database/services/ItemService';
import * as locationService from '../modules/database/services/LocationService';
import * as barcodeService from '../modules/database/services/BarcodeService';
import * as itemMovementService from '../modules/database/services/ItemMovementService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {Item} from '../modules/database/entities/item/Item';
import {ItemType} from '../types/InventoryEnums';

export async function listItems(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const items = await itemService.getAllItems(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    return {items, locations};
}

export async function getItemDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const item = await itemService.getItemById(id);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, userId);
    
    const locations = await locationService.getAllLocations(userId);
    const barcodes = await barcodeService.getBarcodesByItemId(id);
    const movements = await itemMovementService.getMovementsByItemId(id);
    return {item, locations, barcodes, movements};
}

export async function createItem(body: {
    name: string;
    type?: string;
    description?: string;
    locationId?: string;
}, ownerId: number): Promise<Item> {
    requireAuthenticatedUser(ownerId);
    const {name, type = 'other', description, locationId} = body;
    
    if (!name || name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    const item = await itemService.createItem({
        name: name.trim(),
        type: type as ItemType,
        description: description?.trim() || null,
        locationId: locationId || null,
        ownerId,
    });
    
    // Record initial placement if location is set
    if (item.locationId) {
        await itemMovementService.recordMovement(
            item.id,
            null,
            item.locationId,
            'Initial placement',
            ownerId
        );
    }
    
    return item;
}

export async function moveItem(
    id: string,
    body: {locationId?: string; note?: string},
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const item = await itemService.getItemById(id);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, userId);
    
    const oldLocationId = item.locationId || null;
    const newLocationId = body.locationId || null;
    
    if (oldLocationId === newLocationId) {
        return; // No change
    }
    
    // Update item location
    await itemService.updateItemLocation(id, newLocationId);
    
    // Record movement
    await itemMovementService.recordMovement(
        id,
        oldLocationId,
        newLocationId,
        body.note?.trim() || null,
        userId
    );
}

export async function mapBarcodeToItem(
    itemId: string,
    code: string,
    symbology = 'unknown',
    userId: number
): Promise<{success: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    if (!code || code.trim() === '') {
        throw new ExpectedError('Barcode is required', 'error', 400);
    }
    
    const item = await itemService.getItemById(itemId);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, userId);
    
    // Check if barcode is already mapped to another item
    const existingBarcode = await barcodeService.getBarcodeByCode(code.trim());
    if (existingBarcode && existingBarcode.itemId && existingBarcode.itemId !== itemId) {
        return {
            success: false,
            message: `Barcode already mapped to: ${existingBarcode.item?.name || 'another item'}`,
        };
    }
    
    await barcodeService.mapBarcodeToItem(code.trim(), itemId, symbology);
    return {success: true, message: 'Barcode mapped successfully'};
}
