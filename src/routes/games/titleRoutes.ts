/**
 * Game Title Routes
 * 
 * Routes for game title CRUD operations and metadata management
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// ============ Game Titles ============

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

// Merge game titles
router.post('/merge', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const releasesMoved = await gamesController.mergeGameTitles(req.body, userId);
    req.flash('success', `Merge complete: ${releasesMoved} release(s) moved`);
    res.redirect(`/games/titles/${req.body.targetId}`);
}));

// Merge game title as release (for edition duplicates)
router.post('/merge-as-release', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const releaseId = await gamesController.mergeGameTitleAsRelease(req.body, userId);
    req.flash('success', 'Title merged as new release');
    res.redirect(`/games/releases/${releaseId}`);
}));

// Bulk delete game titles
router.post('/bulk-delete', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const ids = req.body.ids;
    const idsArray = Array.isArray(ids) ? ids : (ids ? [ids] : []);
    const deleted = await gamesController.bulkDeleteGameTitles(idsArray, userId);
    req.flash('success', `Deleted ${deleted} game(s)`);
    res.redirect('/games');
}));

// Get game title detail
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameTitleDetail(id, userId);
    renderer.renderWithData(res, 'games/title-detail', data);
}));

// Update game title
router.post('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.updateGameTitle(id, req.body, userId);
    req.flash('success', 'Game title updated successfully');
    res.redirect(`/games/titles/${id}`);
}));

// Delete game title
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deleteGameTitle(id, userId);
    req.flash('success', 'Game title deleted successfully');
    res.redirect('/games');
}));

// Create release for title
router.post('/:id/releases', asyncHandler(async (req: Request, res: Response) => {
    const titleId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.createGameRelease({...req.body, gameTitleId: titleId}, userId);
    req.flash('success', 'Release created successfully');
    res.redirect(`/games/titles/${titleId}`);
}));

// ============ Metadata Operations ============

// Fetch metadata for a single game title
router.post('/:id/fetch-metadata', asyncHandler(async (req: Request, res: Response) => {
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

// Search metadata options for a game title
router.get('/:id/search-metadata', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const searchQuery = req.query.q as string | undefined;
    const data = await gamesController.searchMetadataOptions(id, userId, searchQuery);
    renderer.renderWithData(res, 'games/select-metadata', {...data, searchQuery: searchQuery || data.title.name});
}));

// Apply selected metadata option to a game title
router.post('/:id/apply-metadata', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const {providerId, externalId} = req.body;
    if (!providerId || !externalId) {
        req.flash('error', 'Please select a metadata option');
        res.redirect(`/games/titles/${id}/search-metadata`);
        return;
    }
    const result = await gamesController.applyMetadataOption(id, userId, providerId, externalId);
    if (result.updated) {
        req.flash('success', result.message);
    } else {
        req.flash('info', result.message);
    }
    res.redirect(`/games/titles/${id}`);
}));

// Resync metadata for all games (async - runs in background)
router.post('/resync-metadata', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    gamesController.resyncAllMetadataAsync(userId)
        .catch(err => console.error(`Background metadata resync error for user ${userId}:`, err));
    req.flash('success', 'Metadata resync started in background. Refresh to see updates.');
    res.redirect('/games');
}));

export default router;
