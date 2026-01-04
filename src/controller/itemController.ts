import * as itemService from '../modules/database/services/ItemService';
import * as locationService from '../modules/database/services/LocationService';
import * as barcodeService from '../modules/database/services/BarcodeService';
import * as itemMovementService from '../modules/database/services/ItemMovementService';
import {ExpectedError} from '../modules/lib/errors';
import {Item} from '../modules/database/entities/item/Item';

export async function listItems(ownerId?: number) {
    const items = await itemService.getAllItems(ownerId);
    const locations = await locationService.getAllLocations();
    return {items, locations};
}

export async function getItemDetail(id: number) {
    const item = await itemService.getItemById(id);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    const locations = await locationService.getAllLocations();
    const barcodes = await barcodeService.getBarcodesByItemId(id);
    const movements = await itemMovementService.getMovementsByItemId(id);
    return {item, locations, barcodes, movements};
}

export async function createItem(body: {
    name: string;
    type?: string;
    description?: string;
    locationId?: string | number;
}, ownerId?: number): Promise<Item> {
    const {name, type = 'other', description, locationId} = body;
    
    if (!name || name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    const item = await itemService.createItem({
        name: name.trim(),
        type,
        description: description?.trim() || null,
        locationId: locationId ? Number(locationId) : null,
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
    id: number,
    body: {locationId?: string | number; note?: string},
    userId?: number
): Promise<void> {
    const item = await itemService.getItemById(id);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    
    const oldLocationId = item.locationId || null;
    const newLocationId = body.locationId ? Number(body.locationId) : null;
    
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
    itemId: number,
    code: string,
    symbology = 'unknown'
): Promise<{success: boolean; message: string}> {
    if (!code || code.trim() === '') {
        throw new ExpectedError('Barcode is required', 'error', 400);
    }
    
    const item = await itemService.getItemById(itemId);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    
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
