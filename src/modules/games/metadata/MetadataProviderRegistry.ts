/**
 * Metadata Provider Registry
 * Manages registration and lookup of game metadata providers
 */

import {MetadataProvider, MetadataProviderManifest} from './MetadataProviderInterface';
import {SteamMetadataProvider} from './SteamMetadataProvider';
import {RawgMetadataProvider} from './RawgMetadataProvider';
import {BoardGameGeekMetadataProvider} from './BoardGameGeekMetadataProvider';

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
    
    /**
     * Get providers by game type
     * Returns providers suitable for a given game type
     */
    getByGameType(gameType: string): MetadataProvider[] {
        const type = gameType.toLowerCase();
        if (type === 'board_game' || type === 'card_game' || type === 'tabletop_rpg') {
            // Board games, card games, and tabletop RPGs use BoardGameGeek
            const bgg = this.getById('boardgamegeek');
            return bgg ? [bgg] : [];
        }
        // Video games use Steam and RAWG
        const steam = this.getById('steam');
        const rawg = this.getById('rawg');
        const providers: MetadataProvider[] = [];
        if (steam) providers.push(steam);
        if (rawg) providers.push(rawg);
        return providers;
    }
}

// Global singleton instance
export const metadataProviderRegistry = new MetadataProviderRegistry();

// Register default providers
export function initializeMetadataProviders(): void {
    // Register Steam metadata provider (primary for video games, no API key required)
    metadataProviderRegistry.register(new SteamMetadataProvider());
    
    // Register RAWG metadata provider (secondary for video games, requires API key)
    metadataProviderRegistry.register(new RawgMetadataProvider());
    
    // Register BoardGameGeek metadata provider (for board/card games, no API key required)
    metadataProviderRegistry.register(new BoardGameGeekMetadataProvider());
}
