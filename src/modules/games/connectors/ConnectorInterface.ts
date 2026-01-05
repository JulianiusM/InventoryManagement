/**
 * Connector Plugin Contract
 * Defines the interface for game library connectors (Steam, Epic, etc.)
 */

import {GameProvider, ConnectorCapability} from '../../../types/InventoryEnums';

/**
 * External game data returned by connectors
 */
export interface ExternalGame {
    externalGameId: string;
    name: string;
    playtimeMinutes?: number;
    lastPlayedAt?: Date;
    isInstalled?: boolean;
    coverImageUrl?: string;
    rawPayload?: object;
}

/**
 * Connector manifest describing its capabilities
 */
export interface ConnectorManifest {
    id: string;
    name: string;
    description: string;
    provider: GameProvider;
    capabilities: ConnectorCapability[];
    version: string;
    configSchema?: object; // JSON Schema for connector configuration
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
 * Connector interface that all connectors must implement
 */
export interface GameConnector {
    /**
     * Get the connector manifest
     */
    getManifest(): ConnectorManifest;
    
    /**
     * Sync the game library from the external provider
     * @param tokenRef - Token/credential reference for authentication
     * @returns SyncResult with list of games
     */
    syncLibrary(tokenRef: string): Promise<SyncResult>;
    
    /**
     * Check if the connector supports a specific capability
     */
    hasCapability(capability: ConnectorCapability): boolean;
    
    /**
     * Validate credentials/token
     * @returns true if credentials are valid
     */
    validateCredentials(tokenRef: string): Promise<boolean>;
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
    
    abstract syncLibrary(tokenRef: string): Promise<SyncResult>;
    
    abstract validateCredentials(tokenRef: string): Promise<boolean>;
}
