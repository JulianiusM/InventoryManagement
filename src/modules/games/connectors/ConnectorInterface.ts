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
    
    // Aggregator origin fields (for transparent aggregator pattern)
    // When a connector acts as an aggregator (e.g., Playnite), it can expose the original provider
    originalProviderPluginId?: string;  // Original provider's plugin ID (e.g., Playnite plugin GUID)
    originalProviderName?: string;      // Human-readable provider name (e.g., "Steam", "Epic")
    originalProviderGameId?: string;    // Game ID on the original provider
    originalProviderNormalizedId?: string; // Normalized provider ID (e.g., "steam", "epic", "gog")
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
    configSchema?: object; // JSON Schema for connector configuration
    /** Whether this connector acts as an aggregator (imports from multiple sources) */
    isAggregator?: boolean;
}

/**
 * Sync result from a connector
 */
export interface SyncResult {
    success: boolean;
    games: ExternalGame[];
    error?: string;
    timestamp: Date;
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
