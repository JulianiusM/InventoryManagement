/**
 * Playnite Controller
 * Business logic for Playnite integration endpoints
 * 
 * Handles device registration, authentication, and library import
 */

import Joi from 'joi';
import * as playniteDeviceService from '../modules/database/services/PlayniteDeviceService';
import * as playniteImportService from '../modules/games/PlayniteImportService';
import {requireAuthenticatedUser, checkOwnership} from '../middleware/authMiddleware';
import {ExpectedError} from '../modules/lib/errors';
import {PlayniteImportPayload, PlayniteImportResult} from '../modules/games/PlayniteImportService';

// ============ Device Management ============

export interface DeviceInfo {
    id: string;
    name: string;
    createdAt: Date;
    lastSeenAt: Date | null;
    lastImportAt: Date | null;
    status: 'active' | 'revoked';
}

/**
 * Register a new Playnite device
 */
export async function registerDevice(
    deviceName: string,
    userId: number
): Promise<{deviceId: string; token: string}> {
    requireAuthenticatedUser(userId);
    
    if (!deviceName || deviceName.trim() === '') {
        throw new ExpectedError('Device name is required', 'error', 400);
    }
    
    if (deviceName.trim().length > 255) {
        throw new ExpectedError('Device name must be 255 characters or less', 'error', 400);
    }
    
    const result = await playniteDeviceService.createDevice(userId, deviceName.trim());
    
    return {
        deviceId: result.deviceId,
        token: result.token,
    };
}

/**
 * List all devices for a user
 */
export async function listDevices(userId: number): Promise<DeviceInfo[]> {
    requireAuthenticatedUser(userId);
    
    const devices = await playniteDeviceService.getDevicesByUserId(userId);
    
    return devices.map(device => ({
        id: device.id,
        name: device.name,
        createdAt: device.createdAt,
        lastSeenAt: device.lastSeenAt || null,
        lastImportAt: device.lastImportAt || null,
        status: device.revokedAt ? 'revoked' as const : 'active' as const,
    }));
}

/**
 * Revoke a device
 */
export async function revokeDevice(deviceId: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const device = await playniteDeviceService.getDeviceById(deviceId);
    if (!device) {
        throw new ExpectedError('Device not found', 'error', 404);
    }
    
    if (device.userId !== userId) {
        throw new ExpectedError('You do not have permission to access this device', 'error', 403);
    }
    
    await playniteDeviceService.revokeDevice(deviceId);
}

/**
 * Delete a device permanently
 */
export async function deleteDevice(deviceId: string, userId: number): Promise<void> {
    requireAuthenticatedUser(userId);
    
    const device = await playniteDeviceService.getDeviceById(deviceId);
    if (!device) {
        throw new ExpectedError('Device not found', 'error', 404);
    }
    
    if (device.userId !== userId) {
        throw new ExpectedError('You do not have permission to access this device', 'error', 403);
    }
    
    await playniteDeviceService.deleteDevice(deviceId);
}

// ============ Import ============

// JSON Schema for Playnite import payload
const playniteGameSchema = Joi.object({
    entitlementKey: Joi.string().max(500).optional(),
    playniteDatabaseId: Joi.string().required(),
    name: Joi.string().required(),
    isCustomGame: Joi.boolean().optional(),
    hidden: Joi.boolean().optional(),
    installed: Joi.boolean().optional(),
    installDirectory: Joi.string().optional().allow(null, ''),
    playtimeSeconds: Joi.number().integer().min(0).optional(),
    lastActivity: Joi.string().isoDate().optional().allow(null, ''),
    platforms: Joi.array().items(Joi.string()).optional(),
    sourceId: Joi.string().optional().allow(null, ''),
    sourceName: Joi.string().optional().allow(null, ''),
    originalProviderPluginId: Joi.string().required(),
    originalProviderName: Joi.string().required(),
    originalProviderGameId: Joi.string().optional().allow(null, ''),
    raw: Joi.object().optional(),
}).unknown(true);

const playnitePluginSchema = Joi.object({
    pluginId: Joi.string().required(),
    name: Joi.string().required(),
});

const playniteImportSchema = Joi.object({
    aggregator: Joi.string().valid('playnite').required(),
    exportedAt: Joi.string().isoDate().required(),
    plugins: Joi.array().items(playnitePluginSchema).optional(),
    games: Joi.array().items(playniteGameSchema).required(),
});

/**
 * Validate and parse Playnite import payload
 */
export function validateImportPayload(body: unknown): PlayniteImportPayload {
    const {error, value} = playniteImportSchema.validate(body, {
        abortEarly: false,
        stripUnknown: false,
    });
    
    if (error) {
        const messages = error.details.map(d => d.message).join('; ');
        throw new ExpectedError(`Invalid import payload: ${messages}`, 'error', 400);
    }
    
    return value as PlayniteImportPayload;
}

/**
 * Process Playnite library import
 */
export async function importPlayniteLibrary(
    deviceId: string,
    userId: number,
    payload: PlayniteImportPayload
): Promise<PlayniteImportResult> {
    // Validate payload
    const validatedPayload = validateImportPayload(payload);
    
    // Process import
    const result = await playniteImportService.processPlayniteImport(
        deviceId,
        userId,
        validatedPayload
    );
    
    return result;
}

// ============ Token Authentication ============

/**
 * Verify a device token and return the device + user info
 */
export async function verifyDeviceToken(token: string): Promise<{
    deviceId: string;
    userId: number;
    deviceName: string;
} | null> {
    if (!token) {
        return null;
    }
    
    const device = await playniteDeviceService.verifyTokenByToken(token);
    if (!device) {
        return null;
    }
    
    return {
        deviceId: device.id,
        userId: device.userId,
        deviceName: device.name,
    };
}
