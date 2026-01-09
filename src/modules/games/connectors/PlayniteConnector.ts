/**
 * Playnite Connector
 * Aggregator connector for Playnite desktop application
 * 
 * Features:
 * - Device-based authentication (token per device)
 * - Library import via Playnite extension payload
 * - Transparent aggregator: preserves original provider info (Steam/Epic/GOG/etc.)
 * - Supports multiple providers per import
 * 
 * Credentials:
 * - externalUserId: Device ID (UUID)
 * - tokenRef: Device token for authentication
 */

import {BaseConnector, ConnectorCredentials, ConnectorManifest, ExternalGame, SyncResult} from './ConnectorInterface';
import {ConnectorCapability} from '../../../types/InventoryEnums';
import * as playniteDeviceService from '../../database/services/PlayniteDeviceService';

// Known provider plugin IDs mapped to normalized provider names
const KNOWN_PROVIDERS: Record<string, string> = {
    // Steam
    'cb91dfc9-b977-43bf-8e70-55f46e410fab': 'steam',
    // Epic Games
    '00000001-ebb2-4ecc-abcb-75c4f5a78e18': 'epic',
    '00000002-dbb3-46d2-8dc0-f695c3f987f9': 'epic',
    // GOG
    'aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e': 'gog',
    // EA App (Origin)
    '85dd7072-2f20-4e76-a007-41035e390724': 'ea',
    '00000003-dbb3-46d2-8dc0-f695c3f987f9': 'origin',
    // Ubisoft Connect
    'c2f038e5-8b92-4877-91f1-da9094155fc5': 'ubisoft',
    // Xbox/Game Pass
    '7e4fbb5e-2ae3-48d4-8ba0-6c90e136a77c': 'xbox',
    // PlayStation
    'e4ac81cb-1b1a-4ec9-8639-9a9633989a71': 'playstation',
    // Amazon Games
    'ed31b7dd-f6e6-4e31-9152-4d67a6f80e4a': 'amazon',
    // itch.io
    '00000004-ebb2-4ecc-abcb-75c4f5a78e18': 'itch',
    // Humble Bundle
    '96e8c4bc-ec5c-4c8b-87e7-da65de62deb5': 'humble',
    // Battle.net
    'e3c26a3d-d695-4cb7-a769-5d3d0da6d1a4': 'battlenet',
};

/**
 * Playnite game data from import payload
 */
export interface PlayniteGamePayload {
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
    raw?: object;
}

/**
 * Playnite import payload structure
 */
export interface PlayniteImportPayload {
    aggregator: 'playnite';
    exportedAt: string;
    plugins: Array<{pluginId: string; name: string}>;
    games: PlayniteGamePayload[];
}

/**
 * Device registration result
 */
export interface PlayniteDeviceResult {
    deviceId: string;
    deviceName: string;
    token?: string; // Only returned on registration
}

/**
 * Error codes for Playnite connector
 */
export class PlayniteConnectorError extends Error {
    constructor(
        message: string,
        public readonly code: 'DEVICE_NOT_FOUND' | 'TOKEN_INVALID' | 'DEVICE_REVOKED' | 'INVALID_PAYLOAD' | 'NETWORK_ERROR'
    ) {
        super(message);
        this.name = 'PlayniteConnectorError';
    }
}

const PLAYNITE_MANIFEST: ConnectorManifest = {
    id: 'playnite',
    name: 'Playnite',
    description: 'Connect Playnite to sync your unified game library. Supports importing games from multiple sources (Steam, Epic, GOG, etc.) while preserving original provider information.',
    provider: 'playnite',
    capabilities: [
        ConnectorCapability.LIBRARY_SYNC,
        ConnectorCapability.PLAYTIME_SYNC,
    ],
    version: '1.0.0',
    isAggregator: true,
    configSchema: {
        type: 'object',
        properties: {
            deviceName: {type: 'string', description: 'Name for this Playnite device'},
        },
        required: ['deviceName'],
    },
};

/**
 * Normalize provider name from Playnite plugin GUID
 */
function normalizeProviderName(pluginId: string): string {
    const lowerPluginId = pluginId.toLowerCase();
    return KNOWN_PROVIDERS[lowerPluginId] || 'unknown';
}

/**
 * Derive entitlement key for a Playnite game
 */
function deriveEntitlementKey(game: PlayniteGamePayload): {key: string; needsReview: boolean} {
    if (game.entitlementKey) {
        return {key: game.entitlementKey, needsReview: false};
    }
    
    // Prefer playnite:<pluginId>:<gameId>
    if (game.originalProviderPluginId && game.originalProviderGameId) {
        return {
            key: `playnite:${game.originalProviderPluginId}:${game.originalProviderGameId}`,
            needsReview: false,
        };
    }
    
    // Fallback to playnite-db:<playniteDatabaseId>
    return {
        key: `playnite-db:${game.playniteDatabaseId}`,
        needsReview: true,
    };
}

export class PlayniteConnector extends BaseConnector {
    // Store the imported games temporarily for syncLibrary
    private pendingImport: PlayniteImportPayload | null = null;

    constructor() {
        super(PLAYNITE_MANIFEST);
    }

    /**
     * Register a new Playnite device
     * @param deviceName Name for the device
     * @param userId Owner user ID
     */
    public async registerDevice(deviceName: string, userId: number): Promise<PlayniteDeviceResult> {
        if (!deviceName || deviceName.trim() === '') {
            throw new PlayniteConnectorError('Device name is required', 'INVALID_PAYLOAD');
        }
        
        const result = await playniteDeviceService.createDevice(userId, deviceName.trim());
        
        return {
            deviceId: result.deviceId,
            deviceName: deviceName.trim(),
            token: result.token,
        };
    }

    /**
     * Get device info by ID
     */
    public async getDeviceInfo(deviceId: string): Promise<PlayniteDeviceResult | null> {
        const device = await playniteDeviceService.getDeviceById(deviceId);
        if (!device) {
            return null;
        }
        
        return {
            deviceId: device.id,
            deviceName: device.name,
        };
    }

    /**
     * List all devices for a user
     */
    public async listDevices(userId: number): Promise<Array<{
        id: string;
        name: string;
        createdAt: Date;
        lastSeenAt: Date | null;
        lastImportAt: Date | null;
        status: 'active' | 'revoked';
    }>> {
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
    public async revokeDevice(deviceId: string): Promise<void> {
        await playniteDeviceService.revokeDevice(deviceId);
    }

    /**
     * Delete a device permanently
     */
    public async deleteDevice(deviceId: string): Promise<void> {
        await playniteDeviceService.deleteDevice(deviceId);
    }

    /**
     * Verify a device token
     * @param token The device token to verify
     * @returns Device info if valid, null otherwise
     */
    public async verifyToken(token: string): Promise<{deviceId: string; userId: number; deviceName: string} | null> {
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

    /**
     * Set the import payload for processing
     * This is used by the import endpoint to pass data to syncLibrary
     */
    public setImportPayload(payload: PlayniteImportPayload): void {
        this.pendingImport = payload;
    }

    /**
     * Convert Playnite payload to ExternalGame format
     */
    private convertToExternalGames(payload: PlayniteImportPayload): ExternalGame[] {
        return payload.games.map((game): ExternalGame => {
            const {key: entitlementKey} = deriveEntitlementKey(game);
            const normalizedProvider = normalizeProviderName(game.originalProviderPluginId);
            
            return {
                externalGameId: entitlementKey,
                name: game.name,
                playtimeMinutes: game.playtimeSeconds ? Math.round(game.playtimeSeconds / 60) : undefined,
                lastPlayedAt: game.lastActivity ? new Date(game.lastActivity) : undefined,
                isInstalled: game.installed,
                platform: game.platforms?.[0] || 'PC',
                rawPayload: game.raw,
                
                // Aggregator origin fields
                originalProviderPluginId: game.originalProviderPluginId,
                originalProviderName: game.originalProviderName,
                originalProviderGameId: game.originalProviderGameId,
                originalProviderNormalizedId: normalizedProvider,
            };
        });
    }

    /**
     * Sync game library from Playnite
     * Uses the pending import payload set via setImportPayload
     * @param credentials - externalUserId is deviceId, tokenRef is device token
     */
    async syncLibrary(credentials: ConnectorCredentials): Promise<SyncResult> {
        try {
            const {externalUserId: deviceId, tokenRef: token} = credentials;
            
            // Verify device exists
            const device = await playniteDeviceService.getDeviceById(deviceId);
            if (!device) {
                return {
                    success: false,
                    games: [],
                    error: 'Device not found. Please re-register your Playnite device.',
                    timestamp: new Date(),
                };
            }
            
            // Check if device is revoked
            if (device.revokedAt) {
                return {
                    success: false,
                    games: [],
                    error: 'Device has been revoked. Please register a new device.',
                    timestamp: new Date(),
                };
            }
            
            // Verify token if provided
            if (token) {
                const tokenDevice = await playniteDeviceService.verifyTokenByToken(token);
                if (!tokenDevice || tokenDevice.id !== deviceId) {
                    return {
                        success: false,
                        games: [],
                        error: 'Invalid device token.',
                        timestamp: new Date(),
                    };
                }
            }
            
            // Check for pending import
            if (!this.pendingImport) {
                return {
                    success: false,
                    games: [],
                    error: 'No import payload provided. Use the Playnite extension to sync your library.',
                    timestamp: new Date(),
                };
            }
            
            // Convert payload to external games
            const games = this.convertToExternalGames(this.pendingImport);
            
            // Update last import timestamp
            await playniteDeviceService.updateLastImportAt(deviceId);
            
            // Clear pending import
            this.pendingImport = null;
            
            return {
                success: true,
                games,
                timestamp: new Date(),
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error during Playnite sync';
            return {
                success: false,
                games: [],
                error: message,
                timestamp: new Date(),
            };
        }
    }

    /**
     * Validate credentials by checking if the device exists and token is valid
     * @param credentials - externalUserId is deviceId, tokenRef is device token
     */
    async validateCredentials(credentials: ConnectorCredentials): Promise<boolean> {
        try {
            const {externalUserId: deviceId, tokenRef: token} = credentials;
            
            if (!deviceId) {
                return false;
            }
            
            const device = await playniteDeviceService.getDeviceById(deviceId);
            if (!device || device.revokedAt) {
                return false;
            }
            
            // If token is provided, verify it
            if (token) {
                const tokenDevice = await playniteDeviceService.verifyTokenByToken(token);
                return tokenDevice !== null && tokenDevice.id === deviceId;
            }
            
            return true;
        } catch {
            return false;
        }
    }
}
