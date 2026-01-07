/**
 * BoardGameGeek Metadata Provider
 * Fetches game metadata from BoardGameGeek XML API2
 * 
 * Uses the BGG XML API2:
 * - https://boardgamegeek.com/xmlapi2/search
 * - https://boardgamegeek.com/xmlapi2/thing
 * 
 * Note: BGG API is public and doesn't require an API key
 * Rate limiting: BGG asks for no more than 1 request/second
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {stripHtml, truncateText} from '../../lib/htmlUtils';

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

// Rate limiting - BGG asks for ~1 request/second
const RATE_LIMIT_MS = 1100;
let lastRequestTime = 0;

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

const BGG_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'boardgamegeek',
    name: 'BoardGameGeek',
    description: 'Fetch board game and card game metadata from BoardGameGeek.',
    version: '1.0.0',
    requiresApiKey: false,
    gameUrlPattern: 'https://boardgamegeek.com/boardgame/{id}',
};

export class BoardGameGeekMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(BGG_METADATA_MANIFEST);
    }

    /**
     * Rate limiting helper
     */
    private async rateLimit(): Promise<void> {
        const now = Date.now();
        const elapsed = now - lastRequestTime;
        if (elapsed < RATE_LIMIT_MS) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
        }
        lastRequestTime = Date.now();
    }

    /**
     * Search for games on BoardGameGeek
     */
    async searchGames(query: string, limit = 10, _apiKey?: string): Promise<MetadataSearchResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        await this.rateLimit();

        const params = new URLSearchParams({
            query: query.trim(),
            type: 'boardgame,boardgameexpansion',
        });

        try {
            const response = await fetch(`${BGG_API_BASE}/search?${params.toString()}`);

            if (!response.ok) {
                return [];
            }

            const xml = await response.text();

            // Parse search results from XML
            const results: MetadataSearchResult[] = [];
            const itemRegex = /<item[^>]*id="(\d+)"[^>]*>[\s\S]*?<name[^>]*value="([^"]*)"[^>]*\/>[\s\S]*?(?:<yearpublished[^>]*value="([^"]*)")?[\s\S]*?<\/item>/gi;
            let match;

            while ((match = itemRegex.exec(xml)) !== null && results.length < limit) {
                const id = match[1];
                const name = match[2];
                const year = match[3];

                results.push({
                    externalId: id,
                    name: name,
                    releaseDate: year,
                    coverImageUrl: undefined, // BGG doesn't return images in search
                    provider: 'boardgamegeek',
                });
            }

            return results;
        } catch {
            return [];
        }
    }

    /**
     * Get detailed metadata for a game
     */
    async getGameMetadata(externalId: string, _apiKey?: string): Promise<GameMetadata | null> {
        if (!/^\d+$/.test(externalId)) {
            return null;
        }

        await this.rateLimit();

        const params = new URLSearchParams({
            id: externalId,
            stats: '1',
        });

        try {
            const response = await fetch(`${BGG_API_BASE}/thing?${params.toString()}`);

            if (!response.ok) {
                return null;
            }

            const xml = await response.text();

            // Check if item exists
            if (!xml.includes(`id="${externalId}"`)) {
                return null;
            }

            return this.parseGameXml(xml, externalId);
        } catch {
            return null;
        }
    }

    /**
     * Get game URL
     */
    getGameUrl(externalId: string): string {
        return `https://boardgamegeek.com/boardgame/${externalId}`;
    }

    /**
     * Parse BGG XML response to GameMetadata
     */
    private parseGameXml(xml: string, externalId: string): GameMetadata {
        // Extract primary name
        const nameMatch = xml.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/);
        const name = nameMatch ? nameMatch[1] : `BoardGame ${externalId}`;

        // Extract description (it's CDATA encoded)
        const descMatch = xml.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/);
        const rawDescription = descMatch ? descMatch[1].trim() : '';
        // Use the secure stripHtml function to safely clean the description
        const description = stripHtml(rawDescription);

        // Extract year published
        const yearMatch = xml.match(/<yearpublished[^>]*value="([^"]*)"/);
        const releaseDate = yearMatch ? yearMatch[1] : undefined;

        // Extract player count
        const minPlayersMatch = xml.match(/<minplayers[^>]*value="(\d+)"/);
        const maxPlayersMatch = xml.match(/<maxplayers[^>]*value="(\d+)"/);
        const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : 1;
        const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : 1;

        // Extract image
        const imageMatch = xml.match(/<image>([^<]+)<\/image>/);
        const thumbnailMatch = xml.match(/<thumbnail>([^<]+)<\/thumbnail>/);
        const coverImageUrl = imageMatch ? imageMatch[1].trim() : (thumbnailMatch ? thumbnailMatch[1].trim() : undefined);

        // Extract categories (boardgamecategory links)
        const categoryMatches = xml.matchAll(/<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/gi);
        const genres = Array.from(categoryMatches).map(m => m[1]);

        // Extract designers (boardgamedesigner links)
        const designerMatches = xml.matchAll(/<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/gi);
        const developers = Array.from(designerMatches).map(m => m[1]);

        // Extract publishers (boardgamepublisher links)
        const publisherMatches = xml.matchAll(/<link[^>]*type="boardgamepublisher"[^>]*value="([^"]*)"/gi);
        const publishers = Array.from(publisherMatches).map(m => m[1]);

        // Extract BGG rating
        const ratingMatch = xml.match(/<average[^>]*value="([^"]*)"/);
        const rating = ratingMatch ? Math.round(parseFloat(ratingMatch[1]) * 10) : undefined;

        // Determine game type from categories/families
        const gameType = xml.includes('type="boardgamecategory"') ? 'Board Game' : 'Card Game';

        return {
            externalId,
            name,
            description: description || undefined,
            shortDescription: description ? truncateText(description, MAX_SHORT_DESCRIPTION_LENGTH) : undefined,
            coverImageUrl,
            headerImageUrl: coverImageUrl,
            genres: genres.length > 0 ? genres : [gameType],
            developers: developers.slice(0, 5), // Limit to 5 designers
            publishers: publishers.slice(0, 3), // Limit to 3 publishers
            releaseDate,
            platforms: ['Physical'],
            metacriticScore: rating,
            playerInfo: {
                overallMinPlayers: minPlayers,
                overallMaxPlayers: maxPlayers,
                supportsPhysical: true,
                supportsLocal: maxPlayers > 1,
                supportsOnline: false,
                localMaxPlayers: maxPlayers,
            },
            rawPayload: {xml},
        };
    }
}
