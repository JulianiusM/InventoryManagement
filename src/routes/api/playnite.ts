/**
 * Playnite Integration API Routes
 * 
 * Endpoints for Playnite device management and library import
 */

import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as playniteController from '../../controller/playniteController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';
import {
    requirePlayniteAuth,
    playniteImportRateLimiter,
    deviceRegistrationRateLimiter,
} from '../../middleware/playniteAuthMiddleware';

const router = express.Router();

// ============ Device Management (requires user session auth) ============

// Register a new device
router.post('/devices', requireAuth, deviceRegistrationRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {deviceName} = req.body;
    
    const result = await playniteController.registerDevice(deviceName, userId);
    
    renderer.respondWithJson(res, {
        deviceId: result.deviceId,
        token: result.token,
    });
}));

// List all devices
router.get('/devices', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const devices = await playniteController.listDevices(userId);
    
    renderer.respondWithJson(res, {devices});
}));

// Revoke a device (soft delete - keeps history)
router.post('/devices/:deviceId/revoke', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {deviceId} = req.params;
    
    await playniteController.revokeDevice(deviceId, userId);
    
    renderer.respondWithSuccessJson(res, 'Device revoked successfully');
}));

// Delete a device permanently
router.delete('/devices/:deviceId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {deviceId} = req.params;
    
    await playniteController.deleteDevice(deviceId, userId);
    
    renderer.respondWithSuccessJson(res, 'Device deleted successfully');
}));

// ============ Import (requires device token auth) ============

// Import Playnite library
router.post('/import', requirePlayniteAuth, playniteImportRateLimiter, asyncHandler(async (req: Request, res: Response) => {
    const {deviceId, userId} = req.playniteDevice!;
    const payload = req.body;
    
    const result = await playniteController.importPlayniteLibrary(deviceId, userId, payload);
    
    renderer.respondWithJson(res, result);
}));

export default router;
