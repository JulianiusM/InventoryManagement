/**
 * Games Routes Index
 * 
 * Aggregates all game-related routes into a single router
 */
import {requireAuth} from '../../middleware/authMiddleware';
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

import titleRoutes from './titleRoutes';
import releaseRoutes from './releaseRoutes';
import copyRoutes from './copyRoutes';
import accountRoutes from './accountRoutes';
import mappingRoutes from './mappingRoutes';
import platformRoutes from './platformRoutes';
import jobRoutes from './jobRoutes';
import loanRoutes from './loanRoutes';
import suggestionRoutes from './suggestionRoutes';

const router = express.Router();

// Apply auth middleware to all games routes
router.use(requireAuth);

// Mount sub-routers
// Note: Order matters - more specific routes first

router.use('/suggest', suggestionRoutes);
router.use('/titles', titleRoutes);
router.use('/releases', releaseRoutes);
router.use('/copies', copyRoutes);
router.use('/accounts', accountRoutes);
router.use('/mappings', mappingRoutes);
router.use('/platforms', platformRoutes);
router.use('/jobs', jobRoutes);
router.use('/loans', loanRoutes);

// Games endpoint data

// Resync metadata for all games (async - runs in background)
router.post('/resync-metadata', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    gamesController.resyncAllMetadataAsync(userId)
        .catch(err => console.error(`Background metadata resync error for user ${userId}:`, err));
    req.flash('success', 'Metadata resync started in background. Refresh to see updates.');
    res.redirect('/games');
}));

// List all game titles
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const search = (req.query.search as string) || '';
    const typeFilter = (req.query.type as string) || '';
    const platformFilter = (req.query.platform as string) || '';
    const modeFilter = (req.query.mode as string) || '';
    const playersFilter = req.query.players ? parseInt(req.query.players as string) : undefined;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const perPageRaw = req.query.perPage as string;
    const perPage = perPageRaw === 'all' ? 'all' : (perPageRaw ? parseInt(perPageRaw) : 24);

    const data = await gamesController.listGameTitles(ownerId, {
        search,
        typeFilter,
        platformFilter,
        modeFilter,
        playersFilter,
        page,
        limit: perPage
    });
    renderer.renderWithData(res, 'games/list', {...data, search, typeFilter, platformFilter, modeFilter, playersFilter, perPage});
}));

// Create game title
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const title = await gamesController.createGameTitle(req.body, ownerId);
    req.flash('success', 'Game title created successfully');
    res.redirect(`/games/titles/${title.id}`);
}));

export default router;
