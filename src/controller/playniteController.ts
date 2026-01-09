/**
 * Playnite Controller
 * 
 * Playnite-specific business logic for library import.
 * Device management is now handled via generic push connector APIs.
 */

import Joi from 'joi';
import * as playniteImportService from '../modules/games/PlayniteImportService';
import {ExpectedError} from '../modules/lib/errors';
import {PlayniteImportPayload, PlayniteImportResult} from '../modules/games/PlayniteImportService';

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
