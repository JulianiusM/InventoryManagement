/**
 * Game Copy Controller
 * Business logic for game copy (Item) operations
 */

import * as itemService from '../../modules/database/services/ItemService';
import * as gameReleaseService from '../../modules/database/services/GameReleaseService';
import * as barcodeService from '../../modules/database/services/BarcodeService';
import * as loanService from '../../modules/database/services/LoanService';
import * as locationService from '../../modules/database/services/LocationService';
import * as partyService from '../../modules/database/services/PartyService';
import * as externalAccountService from '../../modules/database/services/ExternalAccountService';
import {ExpectedError} from '../../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {Item} from '../../modules/database/entities/item/Item';
import {
    GameCopyType, 
    ItemCondition,
    LoanDirection
} from '../../types/InventoryEnums';
import settings from '../../modules/settings';
import {
    CreateGameCopyBody,
    MoveGameCopyBody,
    LendGameCopyBody,
    LinkDigitalCopyToAccountBody
} from '../../types/GamesTypes';
import {parseCheckboxBoolean} from './helpers';

// ============ Game Copies (stored as Items) ============

export async function listGameCopies(ownerId: number, options?: {
    copyType?: string;
    locationFilter?: string;
    providerFilter?: string;
    page?: number;
    limit?: number;
}) {
    requireAuthenticatedUser(ownerId);
    let copies = await itemService.getGameItems(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    
    // Apply filters
    if (options?.copyType) {
        copies = copies.filter(c => c.gameCopyType === options.copyType);
    }
    
    if (options?.locationFilter) {
        if (options.locationFilter === 'unassigned') {
            copies = copies.filter(c => !c.locationId);
        } else {
            copies = copies.filter(c => c.locationId === options.locationFilter);
        }
    }
    
    if (options?.providerFilter) {
        copies = copies.filter(c => 
            c.externalAccount?.provider === options.providerFilter
        );
    }
    
    // Apply pagination
    const page = options?.page || 1;
    const limit = options?.limit || settings.value.paginationDefaultGames;
    const totalCount = copies.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;
    copies = copies.slice(offset, offset + limit);
    
    return {
        copies,
        locations,
        accounts,
        pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        }
    };
}

export async function getGameCopyDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Use existing Loan and Barcode services since items integrate with them
    const loans = await loanService.getLoansByItemId(id);
    const barcodes = await barcodeService.getBarcodesByItemId(id);
    const locations = await locationService.getAllLocations(userId);
    const parties = await partyService.getAllParties(userId);
    // Get accounts for manual linking (digital copies only)
    const accounts = await externalAccountService.getAllExternalAccounts(userId);
    
    return {copy, loans, barcodes, locations, parties, accounts};
}

export async function createGameCopy(body: CreateGameCopyBody, ownerId: number): Promise<Item> {
    requireAuthenticatedUser(ownerId);
    
    // Verify release ownership
    const release = await gameReleaseService.getGameReleaseById(body.gameReleaseId);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, ownerId);
    
    // Get the game title name for the item name
    const gameName = release.gameTitle?.name || 'Game Copy';
    
    // Parse lendable properly - for physical copies, default to true if checkbox is checked
    // HTML checkboxes send 'true' when checked, undefined when unchecked
    // For physical copies, default to true; for digital, default to false
    const copyType = body.copyType as GameCopyType;
    let lendable: boolean;
    if (body.lendable !== undefined) {
        lendable = parseCheckboxBoolean(body.lendable);
    } else {
        // Default based on copy type: physical = true, digital = false
        lendable = copyType === GameCopyType.PHYSICAL_COPY;
    }
    
    // Create game item using itemService
    return await itemService.createGameItem({
        name: gameName,
        gameReleaseId: body.gameReleaseId,
        gameCopyType: copyType,
        externalAccountId: body.externalAccountId || null,
        externalGameId: body.externalGameId || null,
        locationId: body.locationId || null,
        condition: (body.condition as ItemCondition) || null,
        description: body.notes?.trim() || null,
        lendable,
        acquiredAt: body.acquiredAt || null,
        ownerId,
    });
}

export async function moveGameCopy(
    id: string,
    body: MoveGameCopyBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.gameCopyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot move a digital copy', 'error', 400);
    }
    
    await itemService.updateItemLocation(id, body.locationId || null);
}

/**
 * Update a game copy's editable fields
 */
export async function updateGameCopy(
    id: string,
    body: {
        condition?: string | null;
        lendable?: boolean;
        notes?: string | null;
        storeUrl?: string | null;
    },
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Only physical copies have condition and lendable settings
    const updateData: Record<string, unknown> = {};
    
    if (body.notes !== undefined) {
        const trimmed = typeof body.notes === 'string' ? body.notes.trim() : null;
        updateData.notes = trimmed || null;
    }
    
    if (copy.gameCopyType === GameCopyType.PHYSICAL_COPY) {
        if (body.condition !== undefined) {
            updateData.condition = body.condition || null;
        }
        if (body.lendable !== undefined) {
            updateData.lendable = body.lendable;
        }
    }
    
    // Digital licenses can have store URL
    if (copy.gameCopyType === GameCopyType.DIGITAL_LICENSE) {
        if (body.storeUrl !== undefined) {
            const trimmed = typeof body.storeUrl === 'string' ? body.storeUrl.trim() : null;
            // Validate URL if provided - only allow HTTPS for security
            if (trimmed) {
                try {
                    const url = new URL(trimmed);
                    if (url.protocol !== 'https:') {
                        throw new Error('Only HTTPS URLs are allowed');
                    }
                    updateData.storeUrl = trimmed;
                } catch {
                    // Invalid URL or not HTTPS, skip
                }
            } else {
                updateData.storeUrl = null;
            }
        }
    }
    
    await itemService.updateItem(id, updateData);
}

export async function deleteGameCopy(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await itemService.getItemById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Delete associated barcodes (using existing Barcode service)
    await barcodeService.deleteBarcodesByItemId(id);
    await itemService.deleteItem(id);
}

// ============ Physical Copy Lending (uses existing Loan entity) ============

export async function lendGameCopy(body: LendGameCopyBody, ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    const copy = await itemService.getItemById(body.gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, ownerId);
    
    if (copy.gameCopyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot lend a digital copy', 'error', 400);
    }
    
    if (!copy.lendable) {
        throw new ExpectedError('This copy is not lendable', 'error', 400);
    }
    
    // Check for active loan using existing LoanService
    const activeLoan = await loanService.getActiveLoanByItemId(body.gameCopyId);
    if (activeLoan) {
        throw new ExpectedError('This copy is already on loan', 'error', 400);
    }
    
    // Use existing LoanService to create the loan
    return await loanService.createLoan({
        itemId: body.gameCopyId,
        partyId: body.partyId,
        direction: LoanDirection.LEND,
        dueAt: body.dueAt || null,
        conditionOut: (body.conditionOut as ItemCondition) || null,
        notes: body.notes?.trim() || null,
        ownerId,
    });
}

export async function returnGameCopy(loanId: string, conditionIn: string | undefined, userId: number) {
    requireAuthenticatedUser(userId);
    
    const loan = await loanService.getLoanById(loanId);
    if (!loan) {
        throw new ExpectedError('Loan not found', 'error', 404);
    }
    checkOwnership(loan, userId);
    
    await loanService.returnLoan(loanId, (conditionIn as ItemCondition) || null);
}

// ============ Barcode Management (uses existing Barcode entity) ============

export async function mapBarcodeToGameCopy(
    gameCopyId: string,
    code: string,
    symbology: string,
    userId: number
): Promise<{success: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    
    if (!code || code.trim() === '') {
        throw new ExpectedError('Barcode is required', 'error', 400);
    }
    
    const copy = await itemService.getItemById(gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.gameCopyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot add barcode to a digital copy', 'error', 400);
    }
    
    // Check if barcode is already mapped using existing BarcodeService
    const existing = await barcodeService.getBarcodeByCode(code.trim());
    if (existing && existing.itemId && existing.itemId !== gameCopyId) {
        return {
            success: false,
            message: `Barcode already mapped to another item`,
        };
    }
    
    // Use existing BarcodeService to map barcode to item
    await barcodeService.mapBarcodeToItem(code.trim(), gameCopyId, symbology);
    return {success: true, message: 'Barcode mapped successfully'};
}

export async function deleteBarcodeFromGameCopy(
    gameCopyId: string,
    barcodeId: string,
    userId: number
): Promise<{success: boolean; message: string}> {
    requireAuthenticatedUser(userId);
    
    const copy = await itemService.getItemById(gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Delete the barcode
    await barcodeService.deleteBarcode(barcodeId);
    return {success: true, message: 'Barcode removed successfully'};
}

// ============ Manual Digital License Linking ============

/**
 * Link a digital copy to an external account manually
 * Use this when no connector exists for a platform
 */
export async function linkDigitalCopyToAccount(
    copyId: string,
    body: LinkDigitalCopyToAccountBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const copy = await itemService.getItemById(copyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.gameCopyType !== GameCopyType.DIGITAL_LICENSE) {
        throw new ExpectedError('Can only link digital licenses to external accounts', 'error', 400);
    }
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(body.externalAccountId);
    if (!account) {
        throw new ExpectedError('External account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    await itemService.updateItem(copyId, {
        externalAccountId: body.externalAccountId,
        externalGameId: body.externalGameId || null,
    });
}
