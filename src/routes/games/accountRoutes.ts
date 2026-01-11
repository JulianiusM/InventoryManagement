/**
 * External Account Routes
 * 
 * Routes for external accounts and sync operations
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// List external accounts
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await gamesController.listExternalAccounts(ownerId);
    renderer.renderWithData(res, 'games/accounts', data);
}));

// Create external account
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    await gamesController.createExternalAccount(req.body, ownerId);
    req.flash('success', 'Account linked successfully');
    res.redirect('/games/accounts');
}));

// Delete external account
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deleteExternalAccount(id, userId);
    req.flash('success', 'Account removed successfully');
    res.redirect('/games/accounts');
}));

// Trigger sync (async - starts job in background)
router.post('/:id/sync', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    gamesController.triggerSyncAsync(id, userId)
        .catch(err => console.error(`Background sync error for account ${id}:`, err));
    req.flash('success', 'Sync started in background. Refresh to see progress.');
    res.redirect('/games/accounts');
}));

// Get sync status (AJAX endpoint for polling)
router.get('/:id/status', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const status = await gamesController.getSyncStatus(id, userId);
    res.json(status);
}));

// Schedule sync for account
router.post('/:id/schedule', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.scheduleAccountSync(id, req.body, userId);
    req.flash('success', 'Scheduled sync enabled');
    res.redirect('/games/accounts');
}));

// Cancel scheduled sync
router.post('/:id/unschedule', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.cancelScheduledSync(id, userId);
    req.flash('success', 'Scheduled sync cancelled');
    res.redirect('/games/accounts');
}));

export default router;
