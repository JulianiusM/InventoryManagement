/**
 * Games Controller
 * Business logic for games module
 * 
 * Game copies are now stored as Items with type=GAME or GAME_DIGITAL,
 * using the existing Barcode and Loan entities for integration.
 */

import * as gameTitleService from '../modules/database/services/GameTitleService';
import * as gameReleaseService from '../modules/database/services/GameReleaseService';
import * as itemService from '../modules/database/services/ItemService';
import * as barcodeService from '../modules/database/services/BarcodeService';
import * as loanService from '../modules/database/services/LoanService';
import * as externalAccountService from '../modules/database/services/ExternalAccountService';
import * as gameMappingService from '../modules/database/services/GameExternalMappingService';
import * as locationService from '../modules/database/services/LocationService';
import * as partyService from '../modules/database/services/PartyService';
import * as gameSyncService from '../modules/games/GameSyncService';
import {connectorRegistry, initializeConnectors} from '../modules/games/connectors/ConnectorRegistry';
import {validatePlayerProfile, PlayerProfileValidationError} from '../modules/database/services/GameValidationService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {GameTitle} from '../modules/database/entities/gameTitle/GameTitle';
import {GameRelease} from '../modules/database/entities/gameRelease/GameRelease';
import {Item} from '../modules/database/entities/item/Item';
import {
    GameType, 
    GamePlatform, 
    GameCopyType, 
    GameProvider, 
    ItemCondition,
    ItemType,
    LoanDirection,
    MappingStatus
} from '../types/InventoryEnums';
import {
    CreateGameTitleBody,
    CreateGameReleaseBody,
    CreateGameCopyBody,
    MoveGameCopyBody,
    LendGameCopyBody,
    CreateExternalAccountBody,
    ResolveMappingBody
} from '../types/GamesTypes';

// Ensure connectors are initialized
initializeConnectors();

// ============ Game Titles ============

export async function listGameTitles(ownerId: number, options?: {
    search?: string;
    typeFilter?: string;
    playersFilter?: number;
}) {
    requireAuthenticatedUser(ownerId);
    let titles = await gameTitleService.getAllGameTitles(ownerId);
    
    // Apply filters
    if (options?.search) {
        const searchLower = options.search.toLowerCase();
        titles = titles.filter(t => t.name.toLowerCase().includes(searchLower));
    }
    
    if (options?.typeFilter) {
        titles = titles.filter(t => t.type === options.typeFilter);
    }
    
    if (options?.playersFilter) {
        const count = options.playersFilter;
        titles = titles.filter(t => 
            count >= t.overallMinPlayers && count <= t.overallMaxPlayers
        );
    }
    
    return {titles};
}

export async function getGameTitleDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    const releases = await gameReleaseService.getGameReleasesByTitleId(id);
    return {title, releases};
}

export async function createGameTitle(body: CreateGameTitleBody, ownerId: number): Promise<GameTitle> {
    requireAuthenticatedUser(ownerId);
    
    if (!body.name || body.name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    // Parse player profile
    const profile = {
        overallMinPlayers: Number(body.overallMinPlayers) || 1,
        overallMaxPlayers: Number(body.overallMaxPlayers) || 1,
        supportsOnline: Boolean(body.supportsOnline),
        supportsLocal: Boolean(body.supportsLocal),
        supportsPhysical: Boolean(body.supportsPhysical),
        onlineMinPlayers: body.onlineMinPlayers ? Number(body.onlineMinPlayers) : null,
        onlineMaxPlayers: body.onlineMaxPlayers ? Number(body.onlineMaxPlayers) : null,
        localMinPlayers: body.localMinPlayers ? Number(body.localMinPlayers) : null,
        localMaxPlayers: body.localMaxPlayers ? Number(body.localMaxPlayers) : null,
        physicalMinPlayers: body.physicalMinPlayers ? Number(body.physicalMinPlayers) : null,
        physicalMaxPlayers: body.physicalMaxPlayers ? Number(body.physicalMaxPlayers) : null,
    };
    
    try {
        validatePlayerProfile(profile);
    } catch (err) {
        if (err instanceof PlayerProfileValidationError) {
            throw new ExpectedError(err.message, 'error', 400);
        }
        throw err;
    }
    
    return await gameTitleService.createGameTitle({
        name: body.name.trim(),
        type: (body.type as GameType) || GameType.VIDEO_GAME,
        description: body.description?.trim() || null,
        coverImageUrl: body.coverImageUrl?.trim() || null,
        ...profile,
        ownerId,
    });
}

export async function updateGameTitle(
    id: string,
    body: Partial<GameTitle>,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    const updates: Partial<GameTitle> = {};
    
    if (body.name !== undefined) {
        if (!body.name.trim()) {
            throw new ExpectedError('Name is required', 'error', 400);
        }
        updates.name = body.name.trim();
    }
    
    if (body.type !== undefined) updates.type = body.type;
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.coverImageUrl !== undefined) updates.coverImageUrl = body.coverImageUrl?.trim() || null;
    
    // Player profile updates
    if (body.overallMinPlayers !== undefined) updates.overallMinPlayers = Number(body.overallMinPlayers);
    if (body.overallMaxPlayers !== undefined) updates.overallMaxPlayers = Number(body.overallMaxPlayers);
    if (body.supportsOnline !== undefined) updates.supportsOnline = body.supportsOnline;
    if (body.supportsLocal !== undefined) updates.supportsLocal = body.supportsLocal;
    if (body.supportsPhysical !== undefined) updates.supportsPhysical = body.supportsPhysical;
    if (body.onlineMinPlayers !== undefined) updates.onlineMinPlayers = body.onlineMinPlayers;
    if (body.onlineMaxPlayers !== undefined) updates.onlineMaxPlayers = body.onlineMaxPlayers;
    if (body.localMinPlayers !== undefined) updates.localMinPlayers = body.localMinPlayers;
    if (body.localMaxPlayers !== undefined) updates.localMaxPlayers = body.localMaxPlayers;
    if (body.physicalMinPlayers !== undefined) updates.physicalMinPlayers = body.physicalMinPlayers;
    if (body.physicalMaxPlayers !== undefined) updates.physicalMaxPlayers = body.physicalMaxPlayers;
    
    await gameTitleService.updateGameTitle(id, updates);
}

export async function deleteGameTitle(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    await gameTitleService.deleteGameTitle(id);
}

// ============ Game Releases ============

export async function createGameRelease(body: CreateGameReleaseBody, ownerId: number): Promise<GameRelease> {
    requireAuthenticatedUser(ownerId);
    
    // Verify title ownership
    const title = await gameTitleService.getGameTitleById(body.gameTitleId);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, ownerId);
    
    return await gameReleaseService.createGameRelease({
        gameTitleId: body.gameTitleId,
        platform: (body.platform as GamePlatform) || GamePlatform.OTHER,
        edition: body.edition?.trim() || null,
        region: body.region?.trim() || null,
        releaseDate: body.releaseDate || null,
        playersOverrideMin: body.playersOverrideMin ? Number(body.playersOverrideMin) : null,
        playersOverrideMax: body.playersOverrideMax ? Number(body.playersOverrideMax) : null,
        ownerId,
    });
}

export async function getGameReleaseDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const release = await gameReleaseService.getGameReleaseById(id);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, userId);
    
    // Use itemService to get game items linked to this release
    const copies = await itemService.getGameItemsByReleaseId(id);
    const locations = await locationService.getAllLocations(userId);
    const accounts = await externalAccountService.getAllExternalAccounts(userId);
    return {release, copies, locations, accounts};
}

export async function deleteGameRelease(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const release = await gameReleaseService.getGameReleaseById(id);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, userId);
    await gameReleaseService.deleteGameRelease(id);
}

// ============ Game Copies (stored as Items) ============

export async function listGameCopies(ownerId: number, options?: {
    copyType?: string;
    locationFilter?: string;
    providerFilter?: string;
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
    
    return {copies, locations, accounts};
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
    
    return {copy, loans, barcodes, locations, parties};
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
    
    // Create game item using itemService
    return await itemService.createGameItem({
        name: gameName,
        gameReleaseId: body.gameReleaseId,
        gameCopyType: body.copyType as GameCopyType,
        externalAccountId: body.externalAccountId || null,
        externalGameId: body.externalGameId || null,
        locationId: body.locationId || null,
        condition: (body.condition as ItemCondition) || null,
        description: body.notes?.trim() || null,
        lendable: body.lendable,
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

// ============ External Accounts ============

export async function listExternalAccounts(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    const connectors = connectorRegistry.getAllManifests();
    return {accounts, connectors};
}

export async function createExternalAccount(body: CreateExternalAccountBody, ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    if (!body.accountName || body.accountName.trim() === '') {
        throw new ExpectedError('Account name is required', 'error', 400);
    }
    
    return await externalAccountService.createExternalAccount({
        provider: body.provider as GameProvider,
        accountName: body.accountName.trim(),
        externalUserId: body.externalUserId?.trim() || null,
        tokenRef: body.tokenRef || null,
        ownerId,
    });
}

export async function deleteExternalAccount(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const account = await externalAccountService.getExternalAccountById(id);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    await externalAccountService.deleteExternalAccount(id);
}

// ============ Sync ============

export async function triggerSync(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    return await gameSyncService.syncExternalAccount(accountId, userId);
}

export async function getSyncStatus(accountId: string, userId: number) {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    return await gameSyncService.getSyncStatus(accountId);
}

// ============ Mapping Queue ============

export async function getPendingMappings(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const mappings = await gameMappingService.getPendingMappings(ownerId);
    const titles = await gameTitleService.getAllGameTitles(ownerId);
    return {mappings, titles};
}

export async function resolveMappings(id: string, body: ResolveMappingBody, userId: number) {
    requireAuthenticatedUser(userId);
    
    const mapping = await gameMappingService.getMappingById(id);
    if (!mapping) {
        throw new ExpectedError('Mapping not found', 'error', 404);
    }
    checkOwnership(mapping, userId);
    
    if (body.action === 'ignore') {
        await gameMappingService.updateMapping(id, {
            status: MappingStatus.IGNORED,
        });
    } else if (body.action === 'create') {
        // Auto-create a new game title from the mapping
        const title = await gameTitleService.createGameTitle({
            name: mapping.externalGameName || `Game ${mapping.externalGameId}`,
            type: GameType.VIDEO_GAME,
            description: null,
            coverImageUrl: null,
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocal: false,
            supportsPhysical: false,
            onlineMinPlayers: null,
            onlineMaxPlayers: null,
            localMinPlayers: null,
            localMaxPlayers: null,
            physicalMinPlayers: null,
            physicalMaxPlayers: null,
            ownerId: userId,
        });
        
        // Create a release for this title
        const release = await gameReleaseService.createGameRelease({
            gameTitleId: title.id,
            platform: GamePlatform.PC, // Default to PC for digital games
            ownerId: userId,
        });
        
        // Update the mapping
        await gameMappingService.updateMapping(id, {
            gameTitleId: title.id,
            gameReleaseId: release.id,
            status: MappingStatus.MAPPED,
        });
    } else {
        // Map to existing title
        if (!body.gameTitleId && !body.gameReleaseId) {
            throw new ExpectedError('Either title or release ID is required', 'error', 400);
        }
        
        await gameMappingService.updateMapping(id, {
            gameTitleId: body.gameTitleId || null,
            gameReleaseId: body.gameReleaseId || null,
            status: MappingStatus.MAPPED,
        });
    }
}

export async function bulkCreateMappings(userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    const mappings = await gameMappingService.getPendingMappings(userId);
    let created = 0;
    
    for (const mapping of mappings) {
        // Create a new game title from the mapping
        const title = await gameTitleService.createGameTitle({
            name: mapping.externalGameName || `Game ${mapping.externalGameId}`,
            type: GameType.VIDEO_GAME,
            description: null,
            coverImageUrl: null,
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocal: false,
            supportsPhysical: false,
            onlineMinPlayers: null,
            onlineMaxPlayers: null,
            localMinPlayers: null,
            localMaxPlayers: null,
            physicalMinPlayers: null,
            physicalMaxPlayers: null,
            ownerId: userId,
        });
        
        // Create a release for this title
        const release = await gameReleaseService.createGameRelease({
            gameTitleId: title.id,
            platform: GamePlatform.PC,
            ownerId: userId,
        });
        
        // Update the mapping
        await gameMappingService.updateMapping(mapping.id, {
            gameTitleId: title.id,
            gameReleaseId: release.id,
            status: MappingStatus.MAPPED,
        });
        
        created++;
    }
    
    return created;
}

export async function bulkIgnoreMappings(userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    const mappings = await gameMappingService.getPendingMappings(userId);
    let ignored = 0;
    
    for (const mapping of mappings) {
        await gameMappingService.updateMapping(mapping.id, {
            status: MappingStatus.IGNORED,
        });
        ignored++;
    }
    
    return ignored;
}

// ============ Connectors ============

export function getConnectorManifests() {
    return connectorRegistry.getAllManifests();
}
