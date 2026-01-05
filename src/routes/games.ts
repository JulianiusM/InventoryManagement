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
    
    const data = await gamesController.listGameTitles(ownerId, {
        search,
        typeFilter,
        playersFilter
    });
    renderer.renderWithData(res, 'games/list', data);
}));

// Create game title
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const title = await gamesController.createGameTitle(req.body, ownerId);
    req.flash('success', 'Game title created successfully');
    res.redirect(`/games/titles/${title.id}`);
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

// ============ Game Copies ============

// List all copies
router.get('/copies', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const copyType = (req.query.copyType as string) || '';
    const locationFilter = (req.query.location as string) || '';
    const providerFilter = (req.query.provider as string) || '';
    
    const data = await gamesController.listGameCopies(ownerId, {
        copyType,
        locationFilter,
        providerFilter
    });
    renderer.renderWithData(res, 'games/copies', data);
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

// Trigger sync
router.post('/accounts/:id/sync', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const result = await gamesController.triggerSync(id, userId);
    if (result.success) {
        req.flash('success', `Sync completed: ${result.stats?.entriesProcessed || 0} games processed`);
    } else {
        req.flash('error', `Sync failed: ${result.error}`);
    }
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

export default router;
