/**
 * Games Controller
 * Business logic for games module
 */

import * as gameTitleService from '../modules/database/services/GameTitleService';
import * as gameReleaseService from '../modules/database/services/GameReleaseService';
import * as gameCopyService from '../modules/database/services/GameCopyService';
import * as externalAccountService from '../modules/database/services/ExternalAccountService';
import * as gameMappingService from '../modules/database/services/GameExternalMappingService';
import * as gameCopyLoanService from '../modules/database/services/GameCopyLoanService';
import * as gameCopyBarcodeService from '../modules/database/services/GameCopyBarcodeService';
import * as locationService from '../modules/database/services/LocationService';
import * as partyService from '../modules/database/services/PartyService';
import * as gameSyncService from '../modules/games/GameSyncService';
import {connectorRegistry, initializeConnectors} from '../modules/games/connectors/ConnectorRegistry';
import {validatePlayerProfile, PlayerProfileValidationError} from '../modules/database/services/GameValidationService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {GameTitle} from '../modules/database/entities/gameTitle/GameTitle';
import {GameRelease} from '../modules/database/entities/gameRelease/GameRelease';
import {GameCopy} from '../modules/database/entities/gameCopy/GameCopy';
import {
    GameType, 
    GamePlatform, 
    GameCopyType, 
    GameProvider, 
    ItemCondition,
    LoanDirection,
    MappingStatus
} from '../types/InventoryEnums';

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

export async function createGameTitle(body: {
    name: string;
    type?: string;
    description?: string;
    coverImageUrl?: string;
    overallMinPlayers: number;
    overallMaxPlayers: number;
    supportsOnline?: boolean;
    supportsLocal?: boolean;
    supportsPhysical?: boolean;
    onlineMinPlayers?: number;
    onlineMaxPlayers?: number;
    localMinPlayers?: number;
    localMaxPlayers?: number;
    physicalMinPlayers?: number;
    physicalMaxPlayers?: number;
}, ownerId: number): Promise<GameTitle> {
    requireAuthenticatedUser(ownerId);
    
    if (!body.name || body.name.trim() === '') {
        throw new ExpectedError('Name is required', 'error', 400);
    }
    
    // Parse player profile
    const profile = {
        overallMinPlayers: Number(body.overallMinPlayers) || 1,
        overallMaxPlayers: Number(body.overallMaxPlayers) || 1,
        supportsOnline: body.supportsOnline === true || body.supportsOnline === 'true' as unknown,
        supportsLocal: body.supportsLocal === true || body.supportsLocal === 'true' as unknown,
        supportsPhysical: body.supportsPhysical === true || body.supportsPhysical === 'true' as unknown,
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

export async function createGameRelease(body: {
    gameTitleId: string;
    platform?: string;
    edition?: string;
    region?: string;
    releaseDate?: string;
    playersOverrideMin?: number;
    playersOverrideMax?: number;
}, ownerId: number): Promise<GameRelease> {
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
    
    const copies = await gameCopyService.getGameCopiesByReleaseId(id);
    return {release, copies};
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

// ============ Game Copies ============

export async function listGameCopies(ownerId: number, options?: {
    copyType?: string;
    locationFilter?: string;
    providerFilter?: string;
}) {
    requireAuthenticatedUser(ownerId);
    let copies = await gameCopyService.getAllGameCopies(ownerId);
    const locations = await locationService.getAllLocations(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    
    // Apply filters
    if (options?.copyType) {
        copies = copies.filter(c => c.copyType === options.copyType);
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
    const copy = await gameCopyService.getGameCopyById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    const loans = await gameCopyLoanService.getLoansByGameCopyId(id);
    const barcodes = await gameCopyBarcodeService.getBarcodesByGameCopyId(id);
    const locations = await locationService.getAllLocations(userId);
    const parties = await partyService.getAllParties(userId);
    
    return {copy, loans, barcodes, locations, parties};
}

export async function createGameCopy(body: {
    gameReleaseId: string;
    copyType: string;
    externalAccountId?: string;
    externalGameId?: string;
    locationId?: string;
    condition?: string;
    notes?: string;
    lendable?: boolean;
    acquiredAt?: string;
}, ownerId: number): Promise<GameCopy> {
    requireAuthenticatedUser(ownerId);
    
    // Verify release ownership
    const release = await gameReleaseService.getGameReleaseById(body.gameReleaseId);
    if (!release) {
        throw new ExpectedError('Game release not found', 'error', 404);
    }
    checkOwnership(release, ownerId);
    
    return await gameCopyService.createGameCopy({
        gameReleaseId: body.gameReleaseId,
        copyType: body.copyType as GameCopyType,
        externalAccountId: body.externalAccountId || null,
        externalGameId: body.externalGameId || null,
        locationId: body.locationId || null,
        condition: (body.condition as ItemCondition) || null,
        notes: body.notes?.trim() || null,
        lendable: body.lendable !== undefined ? body.lendable : undefined,
        acquiredAt: body.acquiredAt || null,
        ownerId,
    });
}

export async function moveGameCopy(
    id: string,
    body: {locationId?: string},
    userId: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await gameCopyService.getGameCopyById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.copyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot move a digital copy', 'error', 400);
    }
    
    await gameCopyService.updateGameCopyLocation(id, body.locationId || null);
}

export async function deleteGameCopy(id: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    const copy = await gameCopyService.getGameCopyById(id);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    // Delete associated barcodes
    await gameCopyBarcodeService.deleteBarcodesByGameCopyId(id);
    await gameCopyService.deleteGameCopy(id);
}

// ============ Physical Copy Lending ============

export async function lendGameCopy(body: {
    gameCopyId: string;
    partyId: string;
    dueAt?: string;
    conditionOut?: string;
    notes?: string;
}, ownerId: number) {
    requireAuthenticatedUser(ownerId);
    
    const copy = await gameCopyService.getGameCopyById(body.gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, ownerId);
    
    if (copy.copyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot lend a digital copy', 'error', 400);
    }
    
    if (!copy.lendable) {
        throw new ExpectedError('This copy is not lendable', 'error', 400);
    }
    
    // Check for active loan
    const activeLoan = await gameCopyLoanService.getActiveLoanByGameCopyId(body.gameCopyId);
    if (activeLoan) {
        throw new ExpectedError('This copy is already on loan', 'error', 400);
    }
    
    return await gameCopyLoanService.createGameCopyLoan({
        gameCopyId: body.gameCopyId,
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
    
    const loan = await gameCopyLoanService.getGameCopyLoanById(loanId);
    if (!loan) {
        throw new ExpectedError('Loan not found', 'error', 404);
    }
    checkOwnership(loan, userId);
    
    await gameCopyLoanService.returnGameCopyLoan(loanId, (conditionIn as ItemCondition) || null);
}

// ============ Barcode Management ============

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
    
    const copy = await gameCopyService.getGameCopyById(gameCopyId);
    if (!copy) {
        throw new ExpectedError('Game copy not found', 'error', 404);
    }
    checkOwnership(copy, userId);
    
    if (copy.copyType !== GameCopyType.PHYSICAL_COPY) {
        throw new ExpectedError('Cannot add barcode to a digital copy', 'error', 400);
    }
    
    // Check if barcode is already mapped
    const existing = await gameCopyBarcodeService.getGameCopyBarcodeByCode(code.trim());
    if (existing && existing.gameCopyId && existing.gameCopyId !== gameCopyId) {
        return {
            success: false,
            message: `Barcode already mapped to another game copy`,
        };
    }
    
    await gameCopyBarcodeService.mapBarcodeToGameCopy(code.trim(), gameCopyId, symbology);
    return {success: true, message: 'Barcode mapped successfully'};
}

// ============ External Accounts ============

export async function listExternalAccounts(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const accounts = await externalAccountService.getAllExternalAccounts(ownerId);
    const connectors = connectorRegistry.getAllManifests();
    return {accounts, connectors};
}

export async function createExternalAccount(body: {
    provider: string;
    accountName: string;
    externalUserId?: string;
    tokenRef?: string;
}, ownerId: number) {
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

export async function resolveMappings(id: string, body: {
    gameTitleId?: string;
    gameReleaseId?: string;
    action: 'map' | 'ignore';
}, userId: number) {
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
    } else {
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

// ============ Connectors ============

export function getConnectorManifests() {
    return connectorRegistry.getAllManifests();
}
