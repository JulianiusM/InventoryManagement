/**
 * Metadata Provider Registry
 * Manages registration and lookup of game metadata providers
 */

import {MetadataProvider, MetadataProviderManifest, MetadataProviderCapabilities} from './MetadataProviderInterface';
import {SteamMetadataProvider} from './SteamMetadataProvider';
import {RawgMetadataProvider} from './RawgMetadataProvider';
import {WikidataMetadataProvider} from './WikidataMetadataProvider';
import {IgdbMetadataProvider} from './IgdbMetadataProvider';

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
     * Get a provider by a specific capability
     * Returns the first provider that has the specified capability
     * 
     * @param capability Key of MetadataProviderCapabilities that should be true
     */
    getByCapability(capability: keyof MetadataProviderCapabilities): MetadataProvider | undefined {
        for (const provider of this.providers.values()) {
            const capabilities = provider.getCapabilities();
            if (capabilities[capability]) {
                return provider;
            }
        }
        return undefined;
    }
    
    /**
     * Get all providers with a specific capability
     */
    getAllByCapability(capability: keyof MetadataProviderCapabilities): MetadataProvider[] {
        return this.getAll().filter(p => p.getCapabilities()[capability]);
    }
    
    /**
     * Get providers by game type
     * Returns providers suitable for a given game type
     * Uses capabilities to determine provider order (no hardcoded provider references)
     */
    getByGameType(gameType: string): MetadataProvider[] {
        const type = gameType.toLowerCase();
        const allProviders = this.getAll();
        
        if (type === 'board_game' || type === 'card_game' || type === 'tabletop_rpg') {
            // Board games: prioritize providers with player count capability for tabletop games
            // Filter to providers that support board games (those not specifically for video games)
            // Currently Wikidata supports board games
            return allProviders.filter(p => {
                const id = p.getManifest().id;
                // Return board game providers - those that aren't video-game-only
                return id === 'wikidata' || id === 'bggplus' || id === 'boardgamegeek';
            });
        }
        
        // Video games: return all providers that support search (for metadata lookup)
        // Order by capabilities: accurate player counts first, then search capability
        const withPlayerCounts = allProviders.filter(p => p.getCapabilities().hasAccuratePlayerCounts);
        const withSearch = allProviders.filter(p => 
            p.getCapabilities().supportsSearch && 
            !withPlayerCounts.find(pc => pc.getManifest().id === p.getManifest().id)
        );
        
        return [...withPlayerCounts, ...withSearch];
    }
    
    /**
     * Get providers that have accurate player count data
     * Uses hasAccuratePlayerCounts capability (no hardcoded provider references)
     */
    getPlayerCountProviders(gameType?: string): MetadataProvider[] {
        return this.getAllByCapability('hasAccuratePlayerCounts');
    }
}

// Global singleton instance
export const metadataProviderRegistry = new MetadataProviderRegistry();

// Register default providers
export function initializeMetadataProviders(): void {
    // Register Steam metadata provider (primary for video games, no API key required)
    metadataProviderRegistry.register(new SteamMetadataProvider());
    
    // Register IGDB metadata provider (accurate player counts for video games, requires Twitch OAuth)
    metadataProviderRegistry.register(new IgdbMetadataProvider());
    
    // Register RAWG metadata provider (secondary for video games, requires API key)
    metadataProviderRegistry.register(new RawgMetadataProvider());
    
    // Register Wikidata metadata provider (secondary for board games, structured data)
    // Provides player counts, designers, and publishers without requiring API key
    metadataProviderRegistry.register(new WikidataMetadataProvider());
}
