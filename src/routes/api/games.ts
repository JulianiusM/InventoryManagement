import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';
import {requirePushConnectorAuth, pushConnectorImportRateLimiter} from '../../middleware/pushConnectorAuthMiddleware';
import * as gameSyncService from '../../modules/games/GameSyncService';

const router = express.Router();

// ============ Unified Push Connector Import (device token auth) ============

/**
 * Unified import endpoint for all push-style connectors
 * 
 * Uses device token to identify the account and connector.
 * Delegates preprocessing to the connector, then uses the shared sync pipeline.
 * 
 * Authorization: Bearer <deviceToken>
 * Body: Connector-specific payload (e.g., Playnite import format)
 */
router.post('/import', requirePushConnectorAuth, pushConnectorImportRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const device = req.connectorDevice;
    
    if (!device) {
        res.status(401).json({status: 'error', message: 'Device authentication required'});
        return;
    }
    
    // Use the unified push import pipeline
    // This handles connector lookup, preprocessing, and sync - all generically
    const result = await gameSyncService.processPushImport(
        device.deviceId,
        device.accountId,
        device.userId,
        req.body
    );
    
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

// Delete barcode from game copy
router.delete('/copies/:id/barcode/:barcodeId', asyncHandler(async (req: Request, res: Response) => {
    const copyId = req.params.id;
    const barcodeId = req.params.barcodeId;
    const userId = req.session.user!.id;
    const result = await gamesController.deleteBarcodeFromGameCopy(copyId, barcodeId, userId);
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

// ============ Game Copies ============

// Get game copy detail with origin info
router.get('/copies/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameCopyDetail(id, userId);
    
    // Build response with origin info for aggregator-imported copies
    const copy = data.copy;
    const response: Record<string, unknown> = {
        id: copy.id,
        name: copy.name,
        type: copy.type,
        gameCopyType: copy.gameCopyType,
        gameRelease: copy.gameRelease ? {
            id: copy.gameRelease.id,
            platform: copy.gameRelease.platform,
            edition: copy.gameRelease.edition,
            gameTitle: copy.gameRelease.gameTitle ? {
                id: copy.gameRelease.gameTitle.id,
                name: copy.gameRelease.gameTitle.name,
            } : null,
        } : null,
        externalAccount: copy.externalAccount ? {
            id: copy.externalAccount.id,
            provider: copy.externalAccount.provider,
            accountName: copy.externalAccount.accountName,
        } : null,
        externalGameId: copy.externalGameId,
        playtimeMinutes: copy.playtimeMinutes,
        lastPlayedAt: copy.lastPlayedAt,
        isInstalled: copy.isInstalled,
        lendable: copy.lendable,
        condition: copy.condition,
        location: copy.location,
        createdAt: copy.createdAt,
        updatedAt: copy.updatedAt,
    };
    
    // Add origin info for aggregator-imported copies (e.g., Playnite)
    if (copy.aggregatorProviderId) {
        response.origin = {
            aggregator: copy.aggregatorProviderId,
            accountId: copy.aggregatorAccountId,
            externalGameId: copy.aggregatorExternalGameId,
            originalProviderPluginId: copy.originalProviderPluginId,
            originalProviderName: copy.originalProviderName,
            originalProviderGameId: copy.originalProviderGameId,
            originalProviderNormalizedId: copy.originalProviderNormalizedId,
            needsReview: copy.needsReview,
        };
    }
    
    renderer.respondWithJson(res, response);
}));

export default router;
