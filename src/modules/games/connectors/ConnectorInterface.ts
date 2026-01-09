/**
 * Connector Plugin Contract
 * Defines the interface for game library connectors (Steam, Epic, etc.)
 */

import {ConnectorCapability} from '../../../types/InventoryEnums';

/**
 * External game data returned by connectors
 * Includes player profile and multiplayer metadata when available
 */
export interface ExternalGame {
    externalGameId: string;
    name: string;
    playtimeMinutes?: number;
    lastPlayedAt?: Date;
    isInstalled?: boolean;
    coverImageUrl?: string;
    rawPayload?: object;
    
    // Platform for this game (user-defined string, e.g. "PC", "PlayStation 5")
    platform?: string;
    
    // Player profile metadata (provided by connector when available)
    overallMinPlayers?: number;
    overallMaxPlayers?: number;
    supportsOnline?: boolean;
    supportsLocal?: boolean;
    supportsPhysical?: boolean;
    onlineMinPlayers?: number;
    onlineMaxPlayers?: number;
    localMinPlayers?: number;
    localMaxPlayers?: number;
    
    // Additional metadata
    description?: string;
    genres?: string[];
    releaseDate?: string;
    developer?: string;
    publisher?: string;
    
    // Store/Shop links for deep linking to the original store page
    storeUrl?: string;  // Direct URL to the game on the store (e.g., Steam store page)
    
    // Aggregator origin fields (for transparent aggregator pattern)
    // When a connector acts as an aggregator (e.g., Playnite), it can expose the original provider
    originalProviderPluginId?: string;  // Original provider's plugin ID (e.g., Playnite plugin GUID)
    originalProviderName?: string;      // Human-readable provider name (e.g., "Steam", "Epic")
    originalProviderGameId?: string;    // Game ID on the original provider
    originalProviderNormalizedId?: string; // Normalized provider ID (e.g., "steam", "epic", "gog")
}

/**
 * Sync style for connectors
 * - fetch: Connector actively pulls data from external service (e.g., Steam API)
 * - push: Connector receives data pushed from external agent (e.g., Playnite extension)
 */
export type ConnectorSyncStyle = 'fetch' | 'push';

/**
 * Credential field definition for dynamic UI generation
 */
export interface CredentialField {
    /** Field identifier (used as form field name) */
    name: string;
    /** Human-readable label for the field */
    label: string;
    /** Field type for rendering */
    type: 'text' | 'password' | 'url';
    /** Whether this field is required */
    required: boolean;
    /** Placeholder text */
    placeholder?: string;
    /** Help text shown below the field */
    helpText?: string;
    /** Maps to: externalUserId, tokenRef, or custom field stored in account metadata */
    mapsTo: 'externalUserId' | 'tokenRef';
}

/**
 * Connector manifest describing its capabilities
 */
export interface ConnectorManifest {
    id: string;
    name: string;
    description: string;
    provider: string; // Changed from enum to string for user-defined providers
    capabilities: ConnectorCapability[];
    version: string;
    /** 
     * Sync style: 'fetch' for pull-based connectors (default), 'push' for agent-based connectors 
     */
    syncStyle?: ConnectorSyncStyle;
    /**
     * Credential fields required from user - generates dynamic UI
     * If not specified, shows default externalUserId + tokenRef fields
     */
    credentialFields?: CredentialField[];
    /** Whether this connector acts as an aggregator (imports from multiple sources) */
    isAggregator?: boolean;
    /** Whether this connector supports devices (for push-style connectors) */
    supportsDevices?: boolean;
}

/**
 * Sync result from a connector
 */
export interface SyncResult {
    success: boolean;
    games: ExternalGame[];
    error?: string;
    timestamp: Date;
    
    // Connector tracing information
    connectorId?: string;    // ID of the connector that produced this result
    connectorName?: string;  // Human-readable name of the connector
    isAggregator?: boolean;  // Whether the connector is an aggregator
}

/**
 * Credentials for connector authentication
 * Separates user identifier from authentication token
 */
export interface ConnectorCredentials {
    /** External user ID (e.g., SteamID64) - identifies the user on the external platform */
    externalUserId: string;
    /** Token/credential reference for authentication (e.g., API key) - optional for some providers */
    tokenRef?: string;
    /** Device ID for push-style connectors */
    deviceId?: string;
    /** Device token for push-style connector authentication */
    deviceToken?: string;
}

/**
 * Device info for push-style connectors
 */
export interface ConnectorDevice {
    id: string;
    name: string;
    createdAt: Date;
    lastSeenAt?: Date | null;
    lastImportAt?: Date | null;
    status: 'active' | 'revoked';
}

/**
 * Device registration result
 */
export interface DeviceRegistrationResult {
    deviceId: string;
    deviceName: string;
    token: string; // Only returned on registration, not stored
}

/**
 * Connector interface that all connectors must implement
 */
export interface GameConnector {
    /**
     * Get the connector manifest
     */
    getManifest(): ConnectorManifest;
    
    /**
     * Sync the game library from the external provider
     * @param credentials - User credentials containing externalUserId and optional tokenRef
     * @returns SyncResult with list of games
     */
    syncLibrary(credentials: ConnectorCredentials): Promise<SyncResult>;
    
    /**
     * Check if the connector supports a specific capability
     */
    hasCapability(capability: ConnectorCapability): boolean;
    
    /**
     * Validate credentials/token
     * @param credentials - User credentials to validate
     * @returns true if credentials are valid
     */
    validateCredentials(credentials: ConnectorCredentials): Promise<boolean>;
}

/**
 * Import preprocessing result from push connector
 * Contains validated games in the unified ExternalGame format
 */
export interface ImportPreprocessResult {
    success: boolean;
    games: ExternalGame[];
    error?: string;
    /** List of entitlement keys to use for soft-removal tracking */
    entitlementKeys: string[];
    /** Warnings generated during preprocessing */
    warnings: Array<{code: string; count: number}>;
    /** Number of games that need manual review */
    needsReviewCount: number;
}

/**
 * Extended interface for push-style connectors that support devices
 */
export interface PushConnector extends GameConnector {
    /**
     * Register a new device for this connector
     * @param accountId - The external account ID this device belongs to
     * @param deviceName - Human-readable device name
     */
    registerDevice(accountId: string, deviceName: string): Promise<DeviceRegistrationResult>;
    
    /**
     * List all devices for an account
     * @param accountId - The external account ID
     */
    listDevices(accountId: string): Promise<ConnectorDevice[]>;
    
    /**
     * Revoke a device (soft delete)
     * @param accountId - The external account ID
     * @param deviceId - The device ID to revoke
     */
    revokeDevice(accountId: string, deviceId: string): Promise<void>;
    
    /**
     * Delete a device permanently
     * @param accountId - The external account ID
     * @param deviceId - The device ID to delete
     */
    deleteDevice(accountId: string, deviceId: string): Promise<void>;
    
    /**
     * Verify a device token
     * @param token - The device token to verify
     * @returns Device info if valid, null otherwise
     */
    verifyDeviceToken(token: string): Promise<{deviceId: string; accountId: string} | null>;
    
    /**
     * Preprocess a pushed import payload into unified ExternalGame format
     * This is the connector-specific validation and transformation step.
     * The result is then fed into the unified sync pipeline.
     * 
     * @param payload - The raw import data from the external agent
     * @returns Preprocessed games in unified format with tracking info
     */
    preprocessImport(payload: unknown): Promise<ImportPreprocessResult>;
}

/**
 * Type guard to check if a connector is a push-style connector
 */
export function isPushConnector(connector: GameConnector): connector is PushConnector {
    return connector.getManifest().syncStyle === 'push' && 
           connector.getManifest().supportsDevices === true;
}

/**
 * Base connector class with common functionality
 */
export abstract class BaseConnector implements GameConnector {
    protected manifest: ConnectorManifest;
    
    constructor(manifest: ConnectorManifest) {
        this.manifest = manifest;
    }
    
    getManifest(): ConnectorManifest {
        return this.manifest;
    }
    
    hasCapability(capability: ConnectorCapability): boolean {
        return this.manifest.capabilities.includes(capability);
    }
    
    abstract syncLibrary(credentials: ConnectorCredentials): Promise<SyncResult>;
    
    abstract validateCredentials(credentials: ConnectorCredentials): Promise<boolean>;
}
