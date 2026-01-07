import express, {Request, Response} from 'express';
import * as gamesController from '../controller/gamesController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';
import {requireAuth} from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all games routes
router.use(requireAuth);

// ============ Games Hub ============

// List all game titles
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const search = (req.query.search as string) || '';
    const typeFilter = (req.query.type as string) || '';
    const playersFilter = req.query.players ? parseInt(req.query.players as string) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    
    const data = await gamesController.listGameTitles(ownerId, {
        search,
        typeFilter,
        playersFilter,
        page
    });
    renderer.renderWithData(res, 'games/list', {...data, search, typeFilter});
}));

// Create game title
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const title = await gamesController.createGameTitle(req.body, ownerId);
    req.flash('success', 'Game title created successfully');
    res.redirect(`/games/titles/${title.id}`);
}));

// ============ Merge Operations ============
// NOTE: These must be defined BEFORE :id routes to prevent "merge" being parsed as an ID

// Merge game titles
router.post('/titles/merge', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const releasesMoved = await gamesController.mergeGameTitles(req.body, userId);
    req.flash('success', `Merge complete: ${releasesMoved} release(s) moved`);
    res.redirect(`/games/titles/${req.body.targetId}`);
}));

// Merge game releases
router.post('/releases/merge', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const copiesMoved = await gamesController.mergeGameReleases(req.body, userId);
    req.flash('success', `Merge complete: ${copiesMoved} copy(ies) moved`);
    res.redirect(`/games/releases/${req.body.targetId}`);
}));

// ============ Game Titles ============

// Get game title detail
router.get('/titles/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameTitleDetail(id, userId);
    renderer.renderWithData(res, 'games/title-detail', data);
}));

// Update game title
router.post('/titles/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.updateGameTitle(id, req.body, userId);
    req.flash('success', 'Game title updated successfully');
    res.redirect(`/games/titles/${id}`);
}));

// Delete game title
router.post('/titles/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deleteGameTitle(id, userId);
    req.flash('success', 'Game title deleted successfully');
    res.redirect('/games');
}));

// Fetch metadata for a single game title
router.post('/titles/:id/fetch-metadata', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const searchQuery = req.body.searchQuery;
    const result = await gamesController.fetchMetadataForTitle(id, userId, searchQuery);
    if (result.updated) {
        req.flash('success', result.message);
    } else {
        req.flash('info', result.message);
    }
    res.redirect(`/games/titles/${id}`);
}));

// Bulk delete game titles
router.post('/titles/bulk-delete', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const ids = req.body.ids;
    // Handle both array and single value
    const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    const deleted = await gamesController.bulkDeleteGameTitles(idsArray, userId);
    req.flash('success', `Deleted ${deleted} game(s)`);
    res.redirect('/games');
}));

// Resync metadata for all games (async - runs in background)
router.post('/resync-metadata', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    
    // Start resync in background - don't wait for completion
    gamesController.resyncAllMetadataAsync(userId)
        .catch(err => console.error(`Background metadata resync error for user ${userId}:`, err));
    
    req.flash('success', 'Metadata resync started in background. Refresh to see updates.');
    res.redirect('/games');
}));

// ============ Game Releases ============

// Create release for title
router.post('/titles/:id/releases', asyncHandler(async (req: Request, res: Response) => {
    const titleId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.createGameRelease({...req.body, gameTitleId: titleId}, userId);
    req.flash('success', 'Release created successfully');
    res.redirect(`/games/titles/${titleId}`);
}));

// Get release detail
router.get('/releases/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameReleaseDetail(id, userId);
    renderer.renderWithData(res, 'games/release-detail', data);
}));

// Delete release
router.post('/releases/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const release = await gamesController.getGameReleaseDetail(id, userId);
    await gamesController.deleteGameRelease(id, userId);
    req.flash('success', 'Release deleted successfully');
    res.redirect(`/games/titles/${release.release.gameTitleId}`);
}));

// Update release
router.post('/releases/:id/update', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.updateGameRelease(id, req.body, userId);
    req.flash('success', 'Release updated successfully');
    res.redirect(`/games/releases/${id}`);
}));

// ============ Game Copies ============

// List all copies
router.get('/copies', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const copyType = (req.query.copyType as string) || '';
    const locationFilter = (req.query.location as string) || '';
    const providerFilter = (req.query.provider as string) || '';
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    
    const data = await gamesController.listGameCopies(ownerId, {
        copyType,
        locationFilter,
        providerFilter,
        page
    });
    renderer.renderWithData(res, 'games/copies', {...data, copyType, locationFilter, providerFilter});
}));

// Create copy for release
router.post('/releases/:id/copies', asyncHandler(async (req: Request, res: Response) => {
    const releaseId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.createGameCopy({...req.body, gameReleaseId: releaseId}, userId);
    req.flash('success', 'Copy created successfully');
    res.redirect(`/games/releases/${releaseId}`);
}));

// Get copy detail
router.get('/copies/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameCopyDetail(id, userId);
    renderer.renderWithData(res, 'games/copy-detail', data);
}));

// Move copy
router.post('/copies/:id/move', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.moveGameCopy(id, req.body, userId);
    req.flash('success', 'Copy moved successfully');
    res.redirect(`/games/copies/${id}`);
}));

// Delete copy
router.post('/copies/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deleteGameCopy(id, userId);
    req.flash('success', 'Copy deleted successfully');
    res.redirect('/games/copies');
}));

// ============ Lending ============

// Lend copy
router.post('/copies/:id/lend', asyncHandler(async (req: Request, res: Response) => {
    const copyId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.lendGameCopy({...req.body, gameCopyId: copyId}, userId);
    req.flash('success', 'Copy lent successfully');
    res.redirect(`/games/copies/${copyId}`);
}));

// Return copy
router.post('/loans/:id/return', asyncHandler(async (req: Request, res: Response) => {
    const loanId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.returnGameCopy(loanId, req.body.conditionIn, userId);
    req.flash('success', 'Copy returned successfully');
    res.redirect('back');
}));

// ============ Accounts & Connectors ============

// List external accounts
router.get('/accounts', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await gamesController.listExternalAccounts(ownerId);
    renderer.renderWithData(res, 'games/accounts', data);
}));

// Create external account
router.post('/accounts', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    await gamesController.createExternalAccount(req.body, ownerId);
    req.flash('success', 'Account linked successfully');
    res.redirect('/games/accounts');
}));

// Delete external account
router.post('/accounts/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deleteExternalAccount(id, userId);
    req.flash('success', 'Account removed successfully');
    res.redirect('/games/accounts');
}));

// Trigger sync (async - starts job in background)
router.post('/accounts/:id/sync', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    
    // Start sync in background - don't wait for completion
    gamesController.triggerSyncAsync(id, userId)
        .catch(err => console.error(`Background sync error for account ${id}:`, err));
    
    req.flash('success', 'Sync started in background. Refresh to see progress.');
    res.redirect('/games/accounts');
}));

// ============ Mapping Queue ============

// List pending mappings
router.get('/mappings', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await gamesController.getPendingMappings(ownerId);
    renderer.renderWithData(res, 'games/mappings', data);
}));

// Bulk create all pending mappings
router.post('/mappings/bulk-create', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const created = await gamesController.bulkCreateMappings(userId);
    req.flash('success', `Created ${created} new game titles`);
    res.redirect('/games/mappings');
}));

// Bulk ignore all pending mappings
router.post('/mappings/bulk-ignore', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const ignored = await gamesController.bulkIgnoreMappings(userId);
    req.flash('success', `Ignored ${ignored} mappings`);
    res.redirect('/games/mappings');
}));

// Resolve mapping
router.post('/mappings/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.resolveMappings(id, req.body, userId);
    req.flash('success', 'Mapping resolved');
    res.redirect('/games/mappings');
}));

// ============ Manual Account Linking ============

// Link digital copy to external account
router.post('/copies/:id/link-account', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.linkDigitalCopyToAccount(id, req.body, userId);
    req.flash('success', 'Copy linked to external account');
    res.redirect(`/games/copies/${id}`);
}));

// ============ Scheduled Sync ============

// Schedule sync for account
router.post('/accounts/:id/schedule', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.scheduleAccountSync(id, req.body, userId);
    req.flash('success', 'Scheduled sync enabled');
    res.redirect('/games/accounts');
}));

// Cancel scheduled sync
router.post('/accounts/:id/unschedule', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.cancelScheduledSync(id, userId);
    req.flash('success', 'Scheduled sync cancelled');
    res.redirect('/games/accounts');
}));

// ============ Platforms ============

// List platforms
router.get('/platforms', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const data = await gamesController.listPlatforms(userId);
    renderer.renderWithData(res, 'games/platforms', data);
}));

// Create platform
router.post('/platforms', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    await gamesController.createPlatform(req.body, userId);
    req.flash('success', 'Platform created successfully');
    res.redirect('/games/platforms');
}));

// Delete platform
router.post('/platforms/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deletePlatform(id, userId);
    req.flash('success', 'Platform deleted successfully');
    res.redirect('/games/platforms');
}));

// Update platform
router.post('/platforms/:id/update', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.updatePlatform(id, req.body, userId);
    req.flash('success', 'Platform updated successfully');
    res.redirect('/games/platforms');
}));

export default router;
