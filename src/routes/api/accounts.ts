/**
 * Accounts API Routes
 * 
 * Generic endpoints for external account and device management
 */

import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';
import {connectorRegistry} from '../../modules/games/connectors/ConnectorRegistry';
import {isPushConnector} from '../../modules/games/connectors/ConnectorInterface';
import * as connectorDeviceService from '../../modules/database/services/ConnectorDeviceService';
import * as externalAccountService from '../../modules/database/services/ExternalAccountService';
import {rateLimit, ipKeyGenerator} from 'express-rate-limit';

const router = express.Router();

// Rate limiter for device registration (5 per hour per user)
const deviceRegistrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: {status: 'error', message: 'Too many device registrations. Try again later.'},
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Rate limit by user ID instead of IP - use ipKeyGenerator for IPv6 support when falling back to IP
        return req.session.user?.id?.toString() || ipKeyGenerator(req.ip || '');
    },
});

// ============ Account Device Management ============

/**
 * List devices for an account
 * GET /api/accounts/:accountId/devices
 */
router.get('/:accountId/devices', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {accountId} = req.params;
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(accountId, userId);
    if (!account) {
        res.status(404).json({status: 'error', message: 'Account not found'});
        return;
    }
    
    // Check if connector supports devices
    const connector = connectorRegistry.getByProvider(account.provider);
    if (!connector || !isPushConnector(connector)) {
        res.status(400).json({status: 'error', message: 'This account type does not support devices'});
        return;
    }
    
    const devices = await connector.listDevices(accountId);
    renderer.respondWithJson(res, {devices});
}));

/**
 * Register a device for an account
 * POST /api/accounts/:accountId/devices
 */
router.post('/:accountId/devices', requireAuth, deviceRegistrationLimiter, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {accountId} = req.params;
    const {deviceName} = req.body;
    
    if (!deviceName || typeof deviceName !== 'string' || deviceName.trim() === '') {
        res.status(400).json({status: 'error', message: 'Device name is required'});
        return;
    }
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(accountId, userId);
    if (!account) {
        res.status(404).json({status: 'error', message: 'Account not found'});
        return;
    }
    
    // Check if connector supports devices
    const connector = connectorRegistry.getByProvider(account.provider);
    if (!connector || !isPushConnector(connector)) {
        res.status(400).json({status: 'error', message: 'This account type does not support devices'});
        return;
    }
    
    const result = await connector.registerDevice(accountId, deviceName.trim());
    renderer.respondWithJson(res, result);
}));

/**
 * Revoke a device (soft delete)
 * POST /api/accounts/:accountId/devices/:deviceId/revoke
 */
router.post('/:accountId/devices/:deviceId/revoke', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {accountId, deviceId} = req.params;
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(accountId, userId);
    if (!account) {
        res.status(404).json({status: 'error', message: 'Account not found'});
        return;
    }
    
    // Check if connector supports devices
    const connector = connectorRegistry.getByProvider(account.provider);
    if (!connector || !isPushConnector(connector)) {
        res.status(400).json({status: 'error', message: 'This account type does not support devices'});
        return;
    }
    
    await connector.revokeDevice(accountId, deviceId);
    renderer.respondWithSuccessJson(res, 'Device revoked successfully');
}));

/**
 * Delete a device permanently
 * DELETE /api/accounts/:accountId/devices/:deviceId
 */
router.delete('/:accountId/devices/:deviceId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {accountId, deviceId} = req.params;
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(accountId, userId);
    if (!account) {
        res.status(404).json({status: 'error', message: 'Account not found'});
        return;
    }
    
    // Check if connector supports devices
    const connector = connectorRegistry.getByProvider(account.provider);
    if (!connector || !isPushConnector(connector)) {
        res.status(400).json({status: 'error', message: 'This account type does not support devices'});
        return;
    }
    
    await connector.deleteDevice(accountId, deviceId);
    renderer.respondWithSuccessJson(res, 'Device deleted successfully');
}));

// ============ Account Update ============

/**
 * Update an account
 * PATCH /api/accounts/:accountId
 */
router.patch('/:accountId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {accountId} = req.params;
    const {accountName, externalUserId, tokenRef} = req.body;
    
    // Verify account ownership
    const account = await externalAccountService.getExternalAccountById(accountId, userId);
    if (!account) {
        res.status(404).json({status: 'error', message: 'Account not found'});
        return;
    }
    
    // Build update object
    const updates: {accountName?: string; externalUserId?: string | null; tokenRef?: string | null} = {};
    if (accountName !== undefined) updates.accountName = accountName;
    if (externalUserId !== undefined) updates.externalUserId = externalUserId || null;
    if (tokenRef !== undefined) updates.tokenRef = tokenRef || null;
    
    if (Object.keys(updates).length === 0) {
        res.status(400).json({status: 'error', message: 'No updates provided'});
        return;
    }
    
    await externalAccountService.updateExternalAccount(accountId, userId, updates);
    renderer.respondWithSuccessJson(res, 'Account updated successfully');
}));

/**
 * Get account details with devices count (for push-style connectors)
 * GET /api/accounts/:accountId
 */
router.get('/:accountId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const {accountId} = req.params;
    
    const account = await externalAccountService.getExternalAccountById(accountId, userId);
    if (!account) {
        res.status(404).json({status: 'error', message: 'Account not found'});
        return;
    }
    
    // Check if connector supports devices
    const connector = connectorRegistry.getByProvider(account.provider);
    let devicesCount = 0;
    let supportsDevices = false;
    
    if (connector && isPushConnector(connector)) {
        supportsDevices = true;
        devicesCount = await connectorDeviceService.getActiveDevicesCount(accountId);
    }
    
    renderer.respondWithJson(res, {
        ...account,
        supportsDevices,
        devicesCount,
    });
}));

export default router;
