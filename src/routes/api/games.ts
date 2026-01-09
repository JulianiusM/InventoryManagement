import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';
import {requirePushConnectorAuth, pushConnectorImportRateLimiter} from '../../middleware/pushConnectorAuthMiddleware';
import {connectorRegistry} from '../../modules/games/connectors/ConnectorRegistry';
import {isPushConnector} from '../../modules/games/connectors/ConnectorInterface';
import * as playniteImportService from '../../modules/games/connectors/playnite/PlayniteImportService';

const router = express.Router();

// ============ Generic Push Connector Import (device token auth) ============

// Import library via push connector - generic endpoint for all push-style connectors
// Uses device token auth (Authorization: Bearer <token>)
router.post('/connectors/:provider/import', requirePushConnectorAuth, pushConnectorImportRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const {provider} = req.params;
    const device = req.connectorDevice;
    
    if (!device) {
        res.status(401).json({status: 'error', message: 'Device authentication required'});
        return;
    }
    
    // Verify the device belongs to an account for the requested provider
    if (device.provider.toLowerCase() !== provider.toLowerCase()) {
        res.status(403).json({status: 'error', message: `Device is not authorized for ${provider} imports`});
        return;
    }
    
    // Get the connector and verify it supports push imports
    const connector = connectorRegistry.getByProvider(provider);
    if (!connector) {
        res.status(404).json({status: 'error', message: `Unknown connector: ${provider}`});
        return;
    }
    
    if (!isPushConnector(connector)) {
        res.status(400).json({status: 'error', message: `${provider} does not support push imports`});
        return;
    }
    
    // Delegate import processing to the connector-specific service
    // For now, we handle Playnite specifically - other push connectors can be added later
    if (provider.toLowerCase() === 'playnite') {
        const result = await playniteImportService.processPlayniteImport(
            device.deviceId,
            device.userId,
            req.body
        );
        renderer.respondWithJson(res, result);
    } else {
        // Generic push connector processing via connector interface
        const syncResult = await connector.processImport(device.deviceId, req.body);
        renderer.respondWithJson(res, {
            deviceId: device.deviceId,
            importedAt: syncResult.timestamp.toISOString(),
            success: syncResult.success,
            gamesCount: syncResult.games.length,
            error: syncResult.error,
        });
    }
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

// ============ Game Copies ============

// Get game copy detail with origin info
router.get('/copies/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameCopyDetail(id, userId);
    
    // Build response with origin info for Playnite-imported copies
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
