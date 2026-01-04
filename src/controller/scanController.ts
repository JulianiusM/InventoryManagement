import * as barcodeService from '../modules/database/services/BarcodeService';
import * as locationService from '../modules/database/services/LocationService';
import * as itemService from '../modules/database/services/ItemService';
import {requireAuthenticatedUser} from '../middleware/authMiddleware';
import {Item} from '../modules/database/entities/item/Item';
import {Location} from '../modules/database/entities/location/Location';
import {BarcodeSymbology} from '../types/InventoryEnums';

export interface ScanResult {
    type: 'item' | 'location' | 'unknown';
    code: string;
    item?: Item | null;
    location?: Location | null;
    message?: string;
}

export async function listScanData(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const items = await itemService.getAllItems(ownerId);
    return {items};
}

/**
 * Resolve a barcode or QR code to an item or location
 * Only returns results that belong to the user
 */
export async function resolveCode(code: string, userId: number): Promise<ScanResult> {
    requireAuthenticatedUser(userId);
    
    if (!code || code.trim() === '') {
        return {
            type: 'unknown',
            code: '',
            message: 'No code provided',
        };
    }
    
    const trimmedCode = code.trim();
    
    // First, check if it's a known barcode mapped to an item
    const barcode = await barcodeService.getBarcodeByCode(trimmedCode);
    if (barcode && barcode.item) {
        // Only return if user owns the item
        if (barcode.item.ownerId === userId) {
            return {
                type: 'item',
                code: trimmedCode,
                item: barcode.item,
            };
        }
    }
    
    // Next, check if it's a location QR code
    const location = await locationService.getLocationByQrCode(trimmedCode);
    if (location) {
        // Only return if user owns the location
        if (location.ownerId === userId) {
            return {
                type: 'location',
                code: trimmedCode,
                location,
            };
        }
    }
    
    // If barcode exists but not mapped
    if (barcode && !barcode.item) {
        return {
            type: 'unknown',
            code: trimmedCode,
            message: 'Barcode exists but is not mapped to any item',
        };
    }
    
    // Unknown code
    return {
        type: 'unknown',
        code: trimmedCode,
        message: 'Code not found in database',
    };
}

/**
 * Create a new barcode entry (unmapped)
 */
export async function registerUnmappedBarcode(
    code: string,
    symbology = 'UNKNOWN'
): Promise<{success: boolean; message: string; barcodeId?: string}> {
    if (!code || code.trim() === '') {
        return {success: false, message: 'Barcode is required'};
    }
    
    const existing = await barcodeService.getBarcodeByCode(code.trim());
    if (existing) {
        return {
            success: false,
            message: existing.itemId 
                ? 'Barcode already mapped to an item'
                : 'Barcode already registered',
            barcodeId: existing.id,
        };
    }
    
    const barcode = await barcodeService.createBarcode({
        code: code.trim(),
        symbology: symbology as BarcodeSymbology,
    });
    
    return {
        success: true,
        message: 'Barcode registered',
        barcodeId: barcode.id,
    };
}
