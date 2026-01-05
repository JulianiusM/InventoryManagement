/**
 * Metadata Provider Registry
 * Manages registration and lookup of game metadata providers
 */

import {MetadataProvider, MetadataProviderManifest} from './MetadataProviderInterface';
import {SteamMetadataProvider} from './SteamMetadataProvider';

class MetadataProviderRegistry {
    private providers: Map<string, MetadataProvider> = new Map();
    
    /**
     * Register a metadata provider
     */
    register(provider: MetadataProvider): void {
        const manifest = provider.getManifest();
        this.providers.set(manifest.id, provider);
    }
    
    /**
     * Get a provider by its ID
     */
    getById(id: string): MetadataProvider | undefined {
        return this.providers.get(id);
    }
    
    /**
     * Get all registered providers
     */
    getAll(): MetadataProvider[] {
        return Array.from(this.providers.values());
    }
    
    /**
     * Get all provider manifests
     */
    getAllManifests(): MetadataProviderManifest[] {
        return this.getAll().map(p => p.getManifest());
    }
    
    /**
     * Check if a provider is registered
     */
    has(id: string): boolean {
        return this.providers.has(id);
    }
}

// Global singleton instance
export const metadataProviderRegistry = new MetadataProviderRegistry();

// Register default providers
export function initializeMetadataProviders(): void {
    // Register Steam metadata provider
    metadataProviderRegistry.register(new SteamMetadataProvider());
    
    // Add more providers here as they are implemented
    // metadataProviderRegistry.register(new IGDBMetadataProvider());
    // metadataProviderRegistry.register(new RAWGMetadataProvider());
}
