/**
 * Playnite Device Authentication Middleware
 * 
 * Handles Bearer token authentication for Playnite device API endpoints
 */

import {NextFunction, Request, Response} from 'express';
import rateLimit from 'express-rate-limit';
import * as playniteController from '../controller/playniteController';
import {ExpectedError} from '../modules/lib/errors';

// Extend Express Request to include Playnite device info
declare global {
    namespace Express {
        interface Request {
            playniteDevice?: {
                deviceId: string;
                userId: number;
                deviceName: string;
            };
        }
    }
}

/**
 * Middleware to require Playnite device authentication
 * Expects Authorization: Bearer <token>
 */
export async function requirePlayniteAuth(
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
    
    const deviceInfo = await playniteController.verifyDeviceToken(token);
    
    if (!deviceInfo) {
        throw new ExpectedError('Invalid or revoked device token', 'error', 401);
    }
    
    // Attach device info to request
    req.playniteDevice = deviceInfo;
    
    next();
}

/**
 * Rate limiter for Playnite import endpoint
 * Limits to 10 imports per hour per device
 */
export const playniteImportRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 imports per hour
    message: {
        status: 'error',
        message: 'Too many import requests. Please wait before trying again.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Use device ID if available, otherwise use IP
        return req.playniteDevice?.deviceId || req.ip || 'unknown';
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
        // Use session user ID if available, otherwise use IP
        return req.session?.user?.id?.toString() || req.ip || 'unknown';
    },
});
