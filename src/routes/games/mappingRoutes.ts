/**
 * Mapping Routes
 * 
 * Routes for game mapping queue operations
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// List pending mappings
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await gamesController.getPendingMappings(ownerId);
    renderer.renderWithData(res, 'games/mappings', data);
}));

// Bulk create all pending mappings
router.post('/bulk-create', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const created = await gamesController.bulkCreateMappings(userId);
    req.flash('success', `Created ${created} new game titles`);
    res.redirect('/games/mappings');
}));

// Bulk ignore all pending mappings
router.post('/bulk-ignore', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const ignored = await gamesController.bulkIgnoreMappings(userId);
    req.flash('success', `Ignored ${ignored} mappings`);
    res.redirect('/games/mappings');
}));

// Resolve mapping
router.post('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.resolveMappings(id, req.body, userId);
    req.flash('success', 'Mapping resolved');
    res.redirect('/games/mappings');
}));

export default router;
