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
 * This is a push-style connector - the Playnite extension pushes data to us.
 * Devices are tied to External Accounts, not users directly.
 */

import {
    BaseConnector,
    ConnectorCredentials,
    ConnectorDevice,
    ConnectorManifest,
    DeviceRegistrationResult,
    ExternalGame,
    ImportPreprocessResult,
    PushConnector,
    SyncResult
} from '../ConnectorInterface';
import {ConnectorCapability} from '../../../../types/InventoryEnums';
import * as connectorDeviceService from '../../../database/services/ConnectorDeviceService';
import {normalizeProviderName, generateStoreUrl} from './PlayniteProviders';
import {validateImportPayload} from './PlayniteImportService';

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
    syncStyle: 'push',
    supportsDevices: true,
    isAggregator: true,
    credentialFields: [
        {
            name: 'accountName',
            label: 'Account Name',
            type: 'text',
            required: true,
            placeholder: 'e.g., My Gaming PC',
            helpText: 'A name for this Playnite installation',
            mapsTo: 'externalUserId',
        },
    ],
};

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

export class PlayniteConnector extends BaseConnector implements PushConnector {
    constructor() {
        super(PLAYNITE_MANIFEST);
    }

    // ============ PushConnector Device Management ============

    /**
     * Register a new device for an account
     */
    async registerDevice(accountId: string, deviceName: string): Promise<DeviceRegistrationResult> {
        if (!deviceName || deviceName.trim() === '') {
            throw new PlayniteConnectorError('Device name is required', 'INVALID_PAYLOAD');
        }
        
        const result = await connectorDeviceService.createDevice(accountId, deviceName.trim());
        
        return {
            deviceId: result.deviceId,
            deviceName: deviceName.trim(),
            token: result.token,
        };
    }

    /**
     * List all devices for an account
     */
    async listDevices(accountId: string): Promise<ConnectorDevice[]> {
        const devices = await connectorDeviceService.getDevicesByAccountId(accountId);
        
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
     * Revoke a device (soft delete)
     */
    async revokeDevice(accountId: string, deviceId: string): Promise<void> {
        const device = await connectorDeviceService.getDeviceById(deviceId);
        if (!device || device.externalAccountId !== accountId) {
            throw new PlayniteConnectorError('Device not found', 'DEVICE_NOT_FOUND');
        }
        await connectorDeviceService.revokeDevice(deviceId);
    }

    /**
     * Delete a device permanently
     */
    async deleteDevice(accountId: string, deviceId: string): Promise<void> {
        const device = await connectorDeviceService.getDeviceById(deviceId);
        if (!device || device.externalAccountId !== accountId) {
            throw new PlayniteConnectorError('Device not found', 'DEVICE_NOT_FOUND');
        }
        await connectorDeviceService.deleteDevice(deviceId);
    }

    /**
     * Verify a device token
     */
    async verifyDeviceToken(token: string): Promise<{deviceId: string; accountId: string} | null> {
        if (!token) {
            return null;
        }
        
        const device = await connectorDeviceService.verifyDeviceToken(token);
        if (!device) {
            return null;
        }
        
        return {
            deviceId: device.id,
            accountId: device.externalAccountId,
        };
    }

    /**
     * Preprocess a pushed import payload into unified ExternalGame format
     * This validates the Playnite-specific payload and converts it to the unified format.
     * The result is then fed into the unified sync pipeline in GameSyncService.
     */
    async preprocessImport(payload: unknown): Promise<ImportPreprocessResult> {
        // Use Joi validation from PlayniteImportService
        let validatedPayload;
        try {
            validatedPayload = validateImportPayload(payload);
        } catch (error) {
            return {
                success: false,
                games: [],
                error: error instanceof Error ? error.message : 'Invalid import payload structure',
                entitlementKeys: [],
                warnings: [],
                needsReviewCount: 0,
            };
        }
        
        // Track warnings and review counts
        const warningCounts: Record<string, number> = {};
        let needsReviewCount = 0;
        const entitlementKeys: string[] = [];
        
        // Convert to external games with full tracking
        const games: ExternalGame[] = validatedPayload.games.map((game) => {
            const {key: entitlementKey, needsReview: derivedNeedsReview} = deriveEntitlementKey(game);
            entitlementKeys.push(entitlementKey);
            
            // Check for missing original game ID
            let needsReview = derivedNeedsReview;
            if (!game.originalProviderGameId) {
                warningCounts['MISSING_ORIGINAL_GAME_ID'] = (warningCounts['MISSING_ORIGINAL_GAME_ID'] || 0) + 1;
                needsReview = true;
            }
            
            if (needsReview) {
                needsReviewCount++;
            }
            
            const normalizedProvider = normalizeProviderName(game.originalProviderPluginId);
            const storeUrl = generateStoreUrl(normalizedProvider, game.originalProviderGameId);
            
            return {
                externalGameId: entitlementKey,
                name: game.name,
                playtimeMinutes: game.playtimeSeconds ? Math.round(game.playtimeSeconds / 60) : undefined,
                lastPlayedAt: game.lastActivity ? new Date(game.lastActivity) : undefined,
                isInstalled: game.installed,
                platform: game.platforms?.[0] || 'PC',
                rawPayload: game.raw,
                storeUrl,
                
                // Aggregator origin fields
                originalProviderPluginId: game.originalProviderPluginId,
                originalProviderName: game.originalProviderName,
                originalProviderGameId: game.originalProviderGameId,
                originalProviderNormalizedId: normalizedProvider,
            };
        });
        
        // Convert warning counts to array
        const warnings = Object.entries(warningCounts).map(([code, count]) => ({code, count}));
        
        return {
            success: true,
            games,
            entitlementKeys,
            warnings,
            needsReviewCount,
        };
    }

    // ============ Standard Connector Methods ============

    /**
     * Sync game library from Playnite
     * Push-style connectors don't support manual sync - they receive pushed data
     */
    async syncLibrary(_credentials: ConnectorCredentials): Promise<SyncResult> {
        // Push-style connectors don't sync actively - they receive pushed data
        return {
            success: false,
            games: [],
            error: 'Playnite is a push-style connector. Use the Playnite extension to sync your library.',
            timestamp: new Date(),
        };
    }

    /**
     * Validate credentials by checking if the device exists and token is valid
     */
    async validateCredentials(credentials: ConnectorCredentials): Promise<boolean> {
        try {
            const {deviceId, deviceToken} = credentials;
            
            if (!deviceId) {
                return false;
            }
            
            const device = await connectorDeviceService.getDeviceById(deviceId);
            if (!device || device.revokedAt) {
                return false;
            }
            
            // If token is provided, verify it
            if (deviceToken) {
                const tokenDevice = await connectorDeviceService.verifyDeviceToken(deviceToken);
                return tokenDevice !== null && tokenDevice.id === deviceId;
            }
            
            return true;
        } catch {
            return false;
        }
    }
}
