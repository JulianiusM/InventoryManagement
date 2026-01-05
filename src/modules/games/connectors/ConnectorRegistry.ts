/**
 * Connector Registry
 * Manages registration and lookup of game library connectors
 */

import {GameConnector, ConnectorManifest} from './ConnectorInterface';
import {SteamStubConnector} from './SteamStubConnector';

class ConnectorRegistry {
    private connectors: Map<string, GameConnector> = new Map();
    
    /**
     * Register a connector
     */
    register(connector: GameConnector): void {
        const manifest = connector.getManifest();
        this.connectors.set(manifest.id, connector);
    }
    
    /**
     * Get a connector by its ID
     */
    getById(id: string): GameConnector | undefined {
        return this.connectors.get(id);
    }
    
    /**
     * Get a connector by provider (case-insensitive match)
     */
    getByProvider(provider: string): GameConnector | undefined {
        const providerLower = provider.toLowerCase();
        for (const connector of this.connectors.values()) {
            if (connector.getManifest().provider.toLowerCase() === providerLower) {
                return connector;
            }
        }
        return undefined;
    }
    
    /**
     * Get all registered connectors
     */
    getAll(): GameConnector[] {
        return Array.from(this.connectors.values());
    }
    
    /**
     * Get all connector manifests
     */
    getAllManifests(): ConnectorManifest[] {
        return this.getAll().map(c => c.getManifest());
    }
    
    /**
     * Check if a connector is registered
     */
    has(id: string): boolean {
        return this.connectors.has(id);
    }
    
    /**
     * Check if a connector exists for a provider
     */
    hasProvider(provider: string): boolean {
        return this.getByProvider(provider) !== undefined;
    }
}

// Global singleton instance
export const connectorRegistry = new ConnectorRegistry();

// Register default connectors
export function initializeConnectors(): void {
    // Register Steam stub connector
    connectorRegistry.register(new SteamStubConnector());
    
    // Add more connectors here as they are implemented
    // connectorRegistry.register(new EpicConnector());
    // connectorRegistry.register(new GOGConnector());
}
