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
import * as platformService from '../modules/database/services/PlatformService';
import {connectorRegistry, initializeConnectors} from '../modules/games/connectors/ConnectorRegistry';
import {validatePlayerProfile, PlayerProfileValidationError} from '../modules/database/services/GameValidationService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {GameTitle} from '../modules/database/entities/gameTitle/GameTitle';
import {GameRelease} from '../modules/database/entities/gameRelease/GameRelease';
import {Item} from '../modules/database/entities/item/Item';
import {
    GameType, 
    GameCopyType, 
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
    ResolveMappingBody,
    MergeGameTitlesBody,
    MergeGameReleasesBody,
    LinkDigitalCopyToAccountBody,
    ScheduleSyncBody
} from '../types/GamesTypes';

// Ensure connectors are initialized
initializeConnectors();

/**
 * Helper to parse checkbox boolean from form submissions
 * HTML checkboxes submit 'true' string when checked, undefined when unchecked
 */
function parseCheckboxBoolean(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
}

/**
 * Helper to parse optional checkbox boolean (can be null)
 * Returns true/false if value is present, null if undefined
 */
function parseOptionalCheckboxBoolean(value: boolean | string | undefined): boolean | null {
    if (value === undefined) return null;
    return value === true || value === 'true';
}

// ============ Game Titles ============

export async function listGameTitles(ownerId: number, options?: {
    search?: string;
    typeFilter?: string;
    playersFilter?: number;
    page?: number;
    limit?: number;
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
    
    // Apply pagination
    const page = options?.page || 1;
    const limit = options?.limit || 24;
    const totalCount = titles.length;
    const totalPages = Math.ceil(totalCount / limit);
    const offset = (page - 1) * limit;
    titles = titles.slice(offset, offset + limit);
    
    return {
        titles,
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

export async function getGameTitleDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const title = await gameTitleService.getGameTitleById(id);
    if (!title) {
        throw new ExpectedError('Game title not found', 'error', 404);
    }
    checkOwnership(title, userId);
    
    // Ensure default platforms exist for user
    await platformService.ensureDefaultPlatforms(userId);
    
    const releases = await gameReleaseService.getGameReleasesByTitleId(id);
    // Get all titles for merge dropdown (excluding current)
    const allTitles = (await gameTitleService.getAllGameTitles(userId))
        .filter(t => t.id !== id);
    // Get all platforms for dropdown
    const platforms = await platformService.getAllPlatforms(userId);
    return {title, releases, allTitles, platforms};
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
        supportsOnline: parseCheckboxBoolean(body.supportsOnline),
        supportsLocal: parseCheckboxBoolean(body.supportsLocal),
        supportsPhysical: parseCheckboxBoolean(body.supportsPhysical),
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
        platform: body.platform?.trim() || 'PC', // Now a user-defined string
        edition: body.edition?.trim() || null,
        region: body.region?.trim() || null,
        releaseDate: body.releaseDate || null,
        playersOverrideMin: body.playersOverrideMin ? Number(body.playersOverrideMin) : null,
        playersOverrideMax: body.playersOverrideMax ? Number(body.playersOverrideMax) : null,
        // Mode-specific overrides
        overrideSupportsOnline: parseOptionalCheckboxBoolean(body.overrideSupportsOnline),
        overrideSupportsLocal: parseOptionalCheckboxBoolean(body.overrideSupportsLocal),
        overrideSupportsPhysical: parseOptionalCheckboxBoolean(body.overrideSupportsPhysical),
        overrideOnlineMin: body.overrideOnlineMin ? Number(body.overrideOnlineMin) : null,
        overrideOnlineMax: body.overrideOnlineMax ? Number(body.overrideOnlineMax) : null,
        overrideLocalMin: body.overrideLocalMin ? Number(body.overrideLocalMin) : null,
        overrideLocalMax: body.overrideLocalMax ? Number(body.overrideLocalMax) : null,
        overridePhysicalMin: body.overridePhysicalMin ? Number(body.overridePhysicalMin) : null,
        overridePhysicalMax: body.overridePhysicalMax ? Number(body.overridePhysicalMax) : null,
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
    // Get all releases for the same title (for merge dropdown, excluding current)
    const allReleases = (await gameReleaseService.getGameReleasesByTitleId(release.gameTitleId))
        .filter(r => r.id !== id);
    return {release, copies, locations, accounts, allReleases};
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

export async function updateGameRelease(
    id: string,
    body: Partial<CreateGameReleaseBody>,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const release = await gameReleaseService.getGameReleaseById(id);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, userId);
    
    const updates: Record<string, unknown> = {};
    
    if (body.platform !== undefined) updates.platform = body.platform.trim() || 'PC';
    if (body.edition !== undefined) updates.edition = body.edition?.trim() || null;
    if (body.region !== undefined) updates.region = body.region?.trim() || null;
    if (body.releaseDate !== undefined) updates.releaseDate = body.releaseDate || null;
    if (body.playersOverrideMin !== undefined) updates.playersOverrideMin = body.playersOverrideMin ? Number(body.playersOverrideMin) : null;
    if (body.playersOverrideMax !== undefined) updates.playersOverrideMax = body.playersOverrideMax ? Number(body.playersOverrideMax) : null;
    
    // Mode-specific overrides
    if (body.overrideSupportsOnline !== undefined) updates.overrideSupportsOnline = parseOptionalCheckboxBoolean(body.overrideSupportsOnline);
    if (body.overrideSupportsLocal !== undefined) updates.overrideSupportsLocal = parseOptionalCheckboxBoolean(body.overrideSupportsLocal);
    if (body.overrideSupportsPhysical !== undefined) updates.overrideSupportsPhysical = parseOptionalCheckboxBoolean(body.overrideSupportsPhysical);
    if (body.overrideOnlineMin !== undefined) updates.overrideOnlineMin = body.overrideOnlineMin ? Number(body.overrideOnlineMin) : null;
    if (body.overrideOnlineMax !== undefined) updates.overrideOnlineMax = body.overrideOnlineMax ? Number(body.overrideOnlineMax) : null;
    if (body.overrideLocalMin !== undefined) updates.overrideLocalMin = body.overrideLocalMin ? Number(body.overrideLocalMin) : null;
    if (body.overrideLocalMax !== undefined) updates.overrideLocalMax = body.overrideLocalMax ? Number(body.overrideLocalMax) : null;
    if (body.overridePhysicalMin !== undefined) updates.overridePhysicalMin = body.overridePhysicalMin ? Number(body.overridePhysicalMin) : null;
    if (body.overridePhysicalMax !== undefined) updates.overridePhysicalMax = body.overridePhysicalMax ? Number(body.overridePhysicalMax) : null;
    
    await gameReleaseService.updateGameRelease(id, updates);
}

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
    const limit = options?.limit || 24;
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
    
    if (!body.provider || body.provider.trim() === '') {
        throw new ExpectedError('Provider is required', 'error', 400);
    }
    
    return await externalAccountService.createExternalAccount({
        provider: body.provider.trim(), // Now a user-defined string
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

// Helper function to create game title and release from a mapping
async function createTitleAndReleaseFromMapping(
    externalGameName: string | null | undefined,
    externalGameId: string,
    mappingId: string,
    userId: number
): Promise<{title: GameTitle; release: GameRelease}> {
    // Create a new game title from the mapping
    const title = await gameTitleService.createGameTitle({
        name: externalGameName || `Game ${externalGameId}`,
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
        platform: 'PC', // Default to PC for digital games
        ownerId: userId,
    });
    
    // Update the mapping
    await gameMappingService.updateMapping(mappingId, {
        gameTitleId: title.id,
        gameReleaseId: release.id,
        status: MappingStatus.MAPPED,
    });
    
    return {title, release};
}

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
        // Auto-create a new game title from the mapping using helper
        await createTitleAndReleaseFromMapping(
            mapping.externalGameName,
            mapping.externalGameId,
            id,
            userId
        );
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
        await createTitleAndReleaseFromMapping(
            mapping.externalGameName,
            mapping.externalGameId,
            mapping.id,
            userId
        );
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

// ============ Merge Operations ============

/**
 * Merge two game titles without losing information
 * All releases from source are moved to target
 */
export async function mergeGameTitles(body: MergeGameTitlesBody, userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership of both titles
    const source = await gameTitleService.getGameTitleById(body.sourceId);
    const target = await gameTitleService.getGameTitleById(body.targetId);
    
    if (!source) {
        throw new ExpectedError('Source game title not found', 'error', 404);
    }
    if (!target) {
        throw new ExpectedError('Target game title not found', 'error', 404);
    }
    
    checkOwnership(source, userId);
    checkOwnership(target, userId);
    
    return await gameTitleService.mergeGameTitles(body.sourceId, body.targetId);
}

/**
 * Merge two game releases without losing information
 * All copies from source are moved to target
 */
export async function mergeGameReleases(body: MergeGameReleasesBody, userId: number): Promise<number> {
    requireAuthenticatedUser(userId);
    
    // Verify ownership of both releases
    const source = await gameReleaseService.getGameReleaseById(body.sourceId);
    const target = await gameReleaseService.getGameReleaseById(body.targetId);
    
    if (!source) {
        throw new ExpectedError('Source game release not found', 'error', 404);
    }
    if (!target) {
        throw new ExpectedError('Target game release not found', 'error', 404);
    }
    
    checkOwnership(source, userId);
    checkOwnership(target, userId);
    
    return await gameReleaseService.mergeGameReleases(body.sourceId, body.targetId);
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

// ============ Scheduled Sync ============

/**
 * Schedule periodic sync for an account
 */
export async function scheduleAccountSync(
    accountId: string,
    body: ScheduleSyncBody,
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    if (body.intervalMinutes < 5) {
        throw new ExpectedError('Minimum sync interval is 5 minutes', 'error', 400);
    }
    
    gameSyncService.scheduleSync(accountId, userId, body.intervalMinutes);
}

/**
 * Cancel scheduled sync for an account
 */
export async function cancelScheduledSync(accountId: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const account = await externalAccountService.getExternalAccountById(accountId);
    if (!account) {
        throw new ExpectedError('Account not found', 'error', 404);
    }
    checkOwnership(account, userId);
    
    gameSyncService.cancelScheduledSync(accountId);
}

/**
 * Get list of scheduled syncs
 */
export function getScheduledSyncs(): string[] {
    return gameSyncService.getScheduledSyncs();
}

// ============ Platforms ============

/**
 * Get all platforms for user
 */
export async function listPlatforms(userId: number) {
    requireAuthenticatedUser(userId);
    // Ensure default platforms exist
    await platformService.ensureDefaultPlatforms(userId);
    const platforms = await platformService.getAllPlatforms(userId);
    return {platforms};
}

/**
 * Create a new platform
 */
export async function createPlatform(body: {name: string; description?: string}, userId: number) {
    requireAuthenticatedUser(userId);
    
    if (!body.name || body.name.trim() === '') {
        throw new ExpectedError('Platform name is required', 'error', 400);
    }
    
    try {
        return await platformService.createPlatform({
            name: body.name.trim(),
            description: body.description?.trim() || null,
        }, userId);
    } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Delete a platform (non-default only)
 */
export async function deletePlatform(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    try {
        await platformService.deletePlatform(id, userId);
    } catch (error) {
        if (error instanceof Error) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}

/**
 * Update a platform (non-default only)
 */
export async function updatePlatform(id: string, body: {name?: string; description?: string}, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    if (body.name !== undefined && !body.name.trim()) {
        throw new ExpectedError('Platform name is required', 'error', 400);
    }
    
    try {
        await platformService.updatePlatform(id, {
            name: body.name?.trim(),
            description: body.description?.trim() || null,
        }, userId);
    } catch (error) {
        if (error instanceof Error) {
            throw new ExpectedError(error.message, 'error', 400);
        }
        throw error;
    }
}
