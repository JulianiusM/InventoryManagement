/**
 * Game Release Routes
 * 
 * Routes for game release management
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// Merge game releases
router.post('/merge', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const copiesMoved = await gamesController.mergeGameReleases(req.body, userId);
    req.flash('success', `Merge complete: ${copiesMoved} copy(ies) moved`);
    res.redirect(`/games/releases/${req.body.targetId}`);
}));

// Get release detail
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameReleaseDetail(id, userId);
    renderer.renderWithData(res, 'games/release-detail', data);
}));

// Update release
router.post('/:id/update', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.updateGameRelease(id, req.body, userId);
    req.flash('success', 'Release updated successfully');
    res.redirect(`/games/releases/${id}`);
}));

// Delete release
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const release = await gamesController.getGameReleaseDetail(id, userId);
    await gamesController.deleteGameRelease(id, userId);
    req.flash('success', 'Release deleted successfully');
    res.redirect(`/games/titles/${release.release.gameTitleId}`);
}));

// Create copy for release
router.post('/:id/copies', asyncHandler(async (req: Request, res: Response) => {
    const releaseId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.createGameCopy({...req.body, gameReleaseId: releaseId}, userId);
    req.flash('success', 'Copy created successfully');
    res.redirect(`/games/releases/${releaseId}`);
}));

export default router;
