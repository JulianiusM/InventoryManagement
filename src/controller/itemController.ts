import * as itemService from '../modules/database/services/ItemService';
import * as locationService from '../modules/database/services/LocationService';
import * as barcodeService from '../modules/database/services/BarcodeService';
import * as itemMovementService from '../modules/database/services/ItemMovementService';
import * as loanService from '../modules/database/services/LoanService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {Item} from '../modules/database/entities/item/Item';
import {ItemType, ItemCondition} from '../types/InventoryEnums';
import settings from '../modules/settings';

export async function listItems(ownerId: number, options?: {
    page?: number;
    perPage?: number;
    search?: string;
    typeFilter?: string;
    locationFilter?: string;
}) {
    requireAuthenticatedUser(ownerId);
    const page = options?.page || 1;
    const perPage = Math.min(options?.perPage || settings.value.paginationDefaultItems, settings.value.paginationMaxPerPage);
    const skip = (page - 1) * perPage;
    
    // Get all items first (we'll add pagination to service layer later)
    let items = await itemService.getAllItems(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    
    // Apply filters
    if (options?.search) {
        const searchLower = options.search.toLowerCase();
        items = items.filter(item => 
            item.name.toLowerCase().includes(searchLower) ||
            (item.description && item.description.toLowerCase().includes(searchLower)) ||
            (item.tags && item.tags.some(tag => tag.toLowerCase().includes(searchLower)))
        );
    }
    
    if (options?.typeFilter) {
        items = items.filter(item => item.type === options.typeFilter);
    }
    
    if (options?.locationFilter) {
        if (options.locationFilter === 'unassigned') {
            items = items.filter(item => !item.locationId);
        } else {
            items = items.filter(item => item.locationId === options.locationFilter);
        }
    }
    
    // Calculate pagination
    const totalItems = items.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const paginatedItems = items.slice(skip, skip + perPage);
    
    return {
        items: paginatedItems,
        locations,
        pagination: {
            page,
            perPage,
            totalItems,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        },
        filters: {
            search: options?.search || '',
            type: options?.typeFilter || '',
            location: options?.locationFilter || ''
        }
    };
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
    const loans = await loanService.getLoansByItemId(id);
    return {item, locations, barcodes, movements, loans};
}

export async function createItem(body: {
    name: string;
    type?: string;
    description?: string;
    condition?: string;
    serialNumber?: string;
    tags?: string;
    locationId?: string;
}, ownerId: number): Promise<Item> {
    requireAuthenticatedUser(ownerId);
    const {name, type = 'other', description, condition, serialNumber, tags, locationId} = body;
    
    if (!name || name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    // Parse tags from comma-separated string
    let parsedTags: string[] | null = null;
    if (tags && tags.trim()) {
        parsedTags = tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }
    
    const item = await itemService.createItem({
        name: name.trim(),
        type: type as ItemType,
        description: description?.trim() || null,
        condition: condition as ItemCondition || null,
        serialNumber: serialNumber?.trim() || null,
        tags: parsedTags,
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

export async function updateItem(
    id: string,
    body: {
        name?: string;
        type?: string;
        description?: string;
        condition?: string;
        serialNumber?: string;
        tags?: string;
    },
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const item = await itemService.getItemById(id);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, userId);
    
    const updates: Partial<Item> = {};
    
    if (body.name !== undefined) {
        if (!body.name.trim()) {
            throw new ExpectedError('Name is required', 'error', 400);
        }
        updates.name = body.name.trim();
    }
    
    if (body.type !== undefined) {
        updates.type = body.type as ItemType;
    }
    
    if (body.description !== undefined) {
        updates.description = body.description.trim() || null;
    }
    
    if (body.condition !== undefined) {
        updates.condition = body.condition as ItemCondition || null;
    }
    
    if (body.serialNumber !== undefined) {
        updates.serialNumber = body.serialNumber.trim() || null;
    }
    
    if (body.tags !== undefined) {
        if (body.tags.trim()) {
            updates.tags = body.tags.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } else {
            updates.tags = null;
        }
    }
    
    await itemService.updateItem(id, updates);
}

export async function deleteItem(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const item = await itemService.getItemById(id);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, userId);
    
    // Delete associated barcodes first
    await barcodeService.deleteBarcodesByItemId(id);
    
    // Delete movements
    await itemMovementService.deleteMovementsByItemId(id);
    
    // Delete the item
    await itemService.deleteItem(id);
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

export async function deleteBarcodeFromItem(
    itemId: string,
    barcodeId: string,
    userId: number
): Promise<{success: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    
    const item = await itemService.getItemById(itemId);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, userId);
    
    // Delete the barcode
    await barcodeService.deleteBarcode(barcodeId);
    return {success: true, message: 'Barcode removed successfully'};
}
