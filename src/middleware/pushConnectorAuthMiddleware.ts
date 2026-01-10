/**
 * Push Connector Device Authentication Middleware
 * 
 * Generic middleware for Bearer token authentication for push-style connector device API endpoints
 */

import {NextFunction, Request, Response} from 'express';
import rateLimit, {ipKeyGenerator} from 'express-rate-limit';
import * as connectorDeviceService from '../modules/database/services/ConnectorDeviceService';
import {ExpectedError} from '../modules/lib/errors';

// Extend Express Request to include push connector device info
declare global {
    namespace Express {
        interface Request {
            connectorDevice?: {
                deviceId: string;
                accountId: string;
                userId: number;
                deviceName: string;
                provider: string;
            };
        }
    }
}

/**
 * Middleware to require push connector device authentication
 * Expects Authorization: Bearer <token>
 */
export async function requirePushConnectorAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new ExpectedError('Device authentication required', 'error', 401);
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
        throw new ExpectedError('Invalid device token', 'error', 401);
    }
    
    const device = await connectorDeviceService.verifyDeviceToken(token);
    
    if (!device) {
        throw new ExpectedError('Invalid or revoked device token', 'error', 401);
    }
    
    // Attach device info to request
    req.connectorDevice = {
        deviceId: device.id,
        accountId: device.externalAccountId,
        userId: device.externalAccount.owner.id,
        deviceName: device.name,
        provider: device.externalAccount.provider,
    };
    
    next();
}

/**
 * Rate limiter for push connector import endpoint
 * Limits to 10 imports per hour per device
 */
export const pushConnectorImportRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 imports per hour
    message: {
        status: 'error',
        message: 'Too many import requests. Please wait before trying again.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Use device ID if available, otherwise use IP with proper IPv6 handling
        return req.connectorDevice?.deviceId || ipKeyGenerator(req.ip || '');
    },
});

/**
 * Rate limiter for device registration
 * Limits to 10 device registrations per hour per user session
 */
export const deviceRegistrationRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 registrations per hour
    message: {
        status: 'error',
        message: 'Too many device registration requests. Please wait before trying again.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Use session user ID if available, otherwise use IP with proper IPv6 handling
        return req.session?.user?.id?.toString() || ipKeyGenerator(req.ip || '');
    },
});
