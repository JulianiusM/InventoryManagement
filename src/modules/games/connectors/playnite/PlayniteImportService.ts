/**
 * Playnite Import Service
 * Contains Playnite-specific validation schemas and types.
 * 
 * All import processing now goes through the unified GameSyncService pipeline.
 * This module is only used by PlayniteConnector.preprocessImport() for validation.
 */

import Joi from 'joi';
import {ExpectedError} from '../../../lib/errors';

// ============ Validation Schema ============

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
    // Store URL provided directly by Playnite (more reliable than generated URLs)
    storeUrl: Joi.string().uri({scheme: ['http', 'https']}).optional().allow(null, ''),
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

// ============ Types ============

export interface PlaynitePlugin {
    pluginId: string;
    name: string;
}

export interface PlayniteGame {
    entitlementKey?: string;
    playniteDatabaseId: string;
    name: string;
    isCustomGame?: boolean;
    hidden?: boolean;
    installed?: boolean;
    installDirectory?: string;
    playtimeSeconds?: number;
    lastActivity?: string;
    platforms?: string[];
    sourceId?: string;
    sourceName?: string;
    originalProviderPluginId: string;
    originalProviderName: string;
    originalProviderGameId?: string;
    /** Store URL provided directly by Playnite (more reliable than generated URLs) */
    storeUrl?: string;
    raw?: object;
}

export interface PlayniteImportPayload {
    aggregator: 'playnite';
    exportedAt: string;
    plugins: PlaynitePlugin[];
    games: PlayniteGame[];
}

// ============ Validation Function ============

/**
 * Validate and parse Playnite import payload
 * Used by PlayniteConnector.preprocessImport() before converting to ExternalGame[]
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
