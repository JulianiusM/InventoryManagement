import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as gamesController from '../../controller/gamesController';
import * as playniteController from '../../controller/playniteController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';
import {requirePlayniteAuth, playniteImportRateLimiter} from '../../middleware/playniteAuthMiddleware';

const router = express.Router();

// ============ Playnite Import (device token auth) ============

// Import Playnite library - this endpoint uses device token auth, not session auth
router.post('/import/playnite', requirePlayniteAuth, playniteImportRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const {deviceId, userId} = req.playniteDevice!;
    const payload = req.body;
    
    const result = await playniteController.importPlayniteLibrary(deviceId, userId, payload);
    
    renderer.respondWithJson(res, result);
}));

// Apply session auth middleware to remaining games API routes
router.use(requireAuth);

// ============ Connectors ============

// Get all connector manifests
router.get('/connectors', asyncHandler(async (req: Request, res: Response) => {
    const manifests = gamesController.getConnectorManifests();
    renderer.respondWithJson(res, {connectors: manifests});
}));

// ============ Barcode Mapping ============

// Map barcode to game copy
router.post('/copies/:id/barcode', asyncHandler(async (req: Request, res: Response) => {
    const copyId = req.params.id;
    const userId = req.session.user!.id;
    const {code, symbology} = req.body;
    const result = await gamesController.mapBarcodeToGameCopy(copyId, code, symbology, userId);
    if (result.success) {
        renderer.respondWithSuccessJson(res, result.message);
    } else {
        renderer.respondWithErrorJson(res, result.message);
    }
}));

// ============ Sync Status ============

// Get sync status for account
router.get('/accounts/:id/sync-status', asyncHandler(async (req: Request, res: Response) => {
    const accountId = req.params.id;
    const userId = req.session.user!.id;
    const status = await gamesController.getSyncStatus(accountId, userId);
    renderer.respondWithJson(res, status);
}));

// ============ Search ============

// Search game titles
router.get('/titles/search', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const search = (req.query.q as string) || '';
    const data = await gamesController.listGameTitles(ownerId, {search});
    renderer.respondWithJson(res, {titles: data.titles});
}));

export default router;
