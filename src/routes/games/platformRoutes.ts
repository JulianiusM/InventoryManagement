/**
 * Platform Routes
 * 
 * Routes for platform management
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// List platforms
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const data = await gamesController.listPlatforms(userId);
    renderer.renderWithData(res, 'games/platforms', data);
}));

// Create platform
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    await gamesController.createPlatform(req.body, userId);
    req.flash('success', 'Platform created successfully');
    res.redirect('/games/platforms');
}));

// Merge platforms
router.post('/merge', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const releasesUpdated = await gamesController.mergePlatforms(req.body, userId);
    req.flash('success', `Merge complete: ${releasesUpdated} release(s) updated`);
    res.redirect('/games/platforms');
}));

// Update platform
router.post('/:id/update', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.updatePlatform(id, req.body, userId);
    req.flash('success', 'Platform updated successfully');
    res.redirect('/games/platforms');
}));

// Delete platform
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deletePlatform(id, userId);
    req.flash('success', 'Platform deleted successfully');
    res.redirect('/games/platforms');
}));

export default router;
