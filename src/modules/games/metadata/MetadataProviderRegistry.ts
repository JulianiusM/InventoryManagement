/**
 * Metadata Provider Registry
 * Manages registration and lookup of game metadata providers
 */

import {MetadataProvider, MetadataProviderManifest} from './MetadataProviderInterface';
import {SteamMetadataProvider} from './SteamMetadataProvider';
import {RawgMetadataProvider} from './RawgMetadataProvider';
import {BoardGameGeekMetadataProvider} from './BoardGameGeekMetadataProvider';
import {BoardGameAtlasMetadataProvider} from './BoardGameAtlasMetadataProvider';
import {TabletopiaMetadataProvider} from './TabletopiaMetadataProvider';
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
     * Get providers by game type
     * Returns providers suitable for a given game type
     */
    getByGameType(gameType: string): MetadataProvider[] {
        const type = gameType.toLowerCase();
        if (type === 'board_game' || type === 'card_game' || type === 'tabletop_rpg') {
            // Board games use Board Game Atlas (primary, has reliable player counts) and Tabletopia (enhanced BGG with retries)
            const bga = this.getById('boardgameatlas');
            const tabletopia = this.getById('tabletopia');
            const bgg = this.getById('boardgamegeek');
            const providers: MetadataProvider[] = [];
            if (bga) providers.push(bga);
            if (tabletopia) providers.push(tabletopia);
            if (bgg) providers.push(bgg); // Fallback
            return providers;
        }
        // Video games use Steam, IGDB (for player counts), and RAWG
        // IGDB is prioritized for accurate player count data
        const steam = this.getById('steam');
        const igdb = this.getById('igdb');
        const rawg = this.getById('rawg');
        const providers: MetadataProvider[] = [];
        if (steam) providers.push(steam);
        if (igdb) providers.push(igdb);
        if (rawg) providers.push(rawg);
        return providers;
    }
    
    /**
     * Get providers that have accurate player count data
     * IGDB for video games, Board Game Atlas/Tabletopia for board games
     */
    getPlayerCountProviders(gameType?: string): MetadataProvider[] {
        const type = (gameType || '').toLowerCase();
        if (type === 'board_game' || type === 'card_game' || type === 'tabletop_rpg') {
            // For board games, Board Game Atlas and Tabletopia both provide reliable player counts
            const bga = this.getById('boardgameatlas');
            const tabletopia = this.getById('tabletopia');
            const providers: MetadataProvider[] = [];
            if (bga) providers.push(bga);
            if (tabletopia) providers.push(tabletopia);
            return providers;
        }
        // For video games, use IGDB
        const igdb = this.getById('igdb');
        return igdb ? [igdb] : [];
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
    
    // Register Board Game Atlas metadata provider (primary for board games, requires API key)
    // Provides reliable player count data
    metadataProviderRegistry.register(new BoardGameAtlasMetadataProvider());
    
    // Register Tabletopia metadata provider (enhanced BGG with better error handling)
    // Provides reliable player count data for board games without requiring API key
    metadataProviderRegistry.register(new TabletopiaMetadataProvider());
    
    // Register BoardGameGeek metadata provider (legacy fallback for board/card games)
    metadataProviderRegistry.register(new BoardGameGeekMetadataProvider());
}
