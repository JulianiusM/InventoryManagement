/**
 * Tabletopia/TheDiceOwl Metadata Provider
 * Uses BGG XML API with enhanced error handling and retry logic
 * 
 * This provider wraps BoardGameGeek with:
 * - Retry logic for 202 status (BGG processing) and rate limits
 * - Conservative rate limiting (2 seconds between requests)
 * - Better XML parsing for player counts
 * 
 * Acts as a reliable fallback provider when Board Game Atlas is not configured
 * or doesn't have the game. Provides reliable player count information.
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {stripHtml, truncateText} from '../../lib/htmlUtils';

// BGG API endpoints for reliable board game data
const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

// Rate limiting - conservative to avoid bans
const RATE_LIMIT_MS = 2000; // 2 seconds between requests
let lastRequestTime = 0;

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

// Maximum payload size to store in rawPayload
const MAX_RAW_PAYLOAD_LENGTH = 5000;

const TABLETOPIA_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'tabletopia',
    name: 'Tabletopia Board Games',
    description: 'Reliable board game metadata with accurate player counts. Uses BGG with enhanced error handling.',
    version: '1.0.0',
    requiresApiKey: false,
    gameUrlPattern: 'https://boardgamegeek.com/boardgame/{id}',
};

export class TabletopiaMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(TABLETOPIA_METADATA_MANIFEST);
    }

    /**
     * Rate limiting helper with more conservative timing
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
     * Fetch with retry logic
     */
    private async fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response | null> {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await this.rateLimit();
                const response = await fetch(url);
                
                // BGG returns 202 when processing - need to wait and retry
                if (response.status === 202) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                
                if (response.ok) {
                    return response;
                }
                
                // Rate limited - wait longer
                if (response.status === 429) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2));
                    continue;
                }
                
            } catch (error) {
                console.warn(`Tabletopia fetch attempt ${attempt + 1} failed:`, error);
                if (attempt < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }
        return null;
    }

    /**
     * Search for games using BGG with enhanced error handling
     */
    async searchGames(query: string, limit = 10, _apiKey?: string): Promise<MetadataSearchResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        const params = new URLSearchParams({
            query: query.trim(),
            type: 'boardgame,boardgameexpansion',
            exact: '0',
        });

        try {
            const response = await this.fetchWithRetry(`${BGG_API_BASE}/search?${params.toString()}`);
            
            if (!response) {
                return [];
            }

            const xml = await response.text();

            // Parse search results from XML using regex
            // Note: A full XML parser would be heavier - this is sufficient for BGG's predictable format
            const results: MetadataSearchResult[] = [];
            
            // Match items - the [\s\S]*? pattern allows matching across newlines
            const itemMatches = xml.matchAll(/<item[^>]*type="[^"]*"[^>]*id="(\d+)"[^>]*>[\s\S]*?<\/item>/gi);
            
            for (const itemMatch of itemMatches) {
                if (results.length >= limit) break;
                
                const itemXml = itemMatch[0];
                const id = itemMatch[1];
                
                // Get primary name
                const nameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/);
                if (!nameMatch) continue;
                
                const name = this.decodeXmlEntities(nameMatch[1]);
                
                // Get year published
                const yearMatch = itemXml.match(/<yearpublished[^>]*value="([^"]*)"/);
                const year = yearMatch ? yearMatch[1] : undefined;

                results.push({
                    externalId: id,
                    name,
                    releaseDate: year,
                    coverImageUrl: undefined, // BGG doesn't return images in search
                    provider: 'tabletopia',
                });
            }

            // Sort by relevance - exact matches first
            const normalizedQuery = query.toLowerCase().trim();
            results.sort((a, b) => {
                const aExact = a.name.toLowerCase() === normalizedQuery ? 0 : 1;
                const bExact = b.name.toLowerCase() === normalizedQuery ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                
                // Then by name starting with query
                const aStarts = a.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
                const bStarts = b.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
                return aStarts - bStarts;
            });

            return results;
        } catch (error) {
            console.warn('Tabletopia search error:', error);
            return [];
        }
    }

    /**
     * Get detailed metadata for a game with retry logic
     */
    async getGameMetadata(externalId: string, _apiKey?: string): Promise<GameMetadata | null> {
        if (!/^\d+$/.test(externalId)) {
            return null;
        }

        const params = new URLSearchParams({
            id: externalId,
            stats: '1',
        });

        try {
            const response = await this.fetchWithRetry(`${BGG_API_BASE}/thing?${params.toString()}`);
            
            if (!response) {
                return null;
            }

            const xml = await response.text();

            // Check if item exists
            if (!xml.includes(`id="${externalId}"`)) {
                return null;
            }

            return this.parseGameXml(xml, externalId);
        } catch (error) {
            console.warn('Tabletopia get metadata error:', error);
            return null;
        }
    }

    /**
     * Search for a game by name and return best match with full metadata
     */
    async findByGameName(name: string): Promise<GameMetadata | null> {
        const searchResults = await this.searchGames(name, 5);
        if (searchResults.length === 0) {
            return null;
        }

        // Find best match - exact match first, then by similarity
        const normalizedQuery = name.toLowerCase().trim();
        let bestMatch = searchResults.find(
            r => r.name.toLowerCase().trim() === normalizedQuery
        );
        
        if (!bestMatch) {
            // Find match that starts with the query
            bestMatch = searchResults.find(
                r => r.name.toLowerCase().startsWith(normalizedQuery)
            );
        }
        
        if (!bestMatch) {
            bestMatch = searchResults[0];
        }

        return this.getGameMetadata(bestMatch.externalId);
    }

    /**
     * Get game URL
     */
    getGameUrl(externalId: string): string {
        return `https://boardgamegeek.com/boardgame/${externalId}`;
    }

    /**
     * Decode XML entities
     * Order is important: decode numeric entities first, then named entities,
     * with &amp; last to avoid double-unescaping
     */
    private decodeXmlEntities(text: string): string {
        // First decode numeric entities (they can't create new entity sequences)
        let result = text
            .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
        
        // Then decode named entities except &amp; (in order that doesn't create new sequences)
        result = result
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
        
        // Decode &amp; last to avoid creating new entity sequences from double-encoded input
        result = result.replace(/&amp;/g, '&');
        
        return result;
    }

    /**
     * Parse BGG XML response to GameMetadata - improved parsing
     */
    private parseGameXml(xml: string, externalId: string): GameMetadata {
        // Extract primary name - more robust regex
        let name = `BoardGame ${externalId}`;
        const namePatterns = [
            /<name[^>]*type="primary"[^>]*value="([^"]*)"/,
            /<name[^>]*value="([^"]*)"[^>]*type="primary"/,
        ];
        for (const pattern of namePatterns) {
            const match = xml.match(pattern);
            if (match) {
                name = this.decodeXmlEntities(match[1]);
                break;
            }
        }

        // Extract description (it's CDATA encoded)
        let rawDescription = '';
        const descPatterns = [
            /<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/,
            /<description>([\s\S]*?)<\/description>/,
        ];
        for (const pattern of descPatterns) {
            const match = xml.match(pattern);
            if (match) {
                rawDescription = match[1].trim();
                break;
            }
        }
        const description = stripHtml(rawDescription);

        // Extract year published
        const yearMatch = xml.match(/<yearpublished[^>]*value="([^"]*)"/);
        const releaseDate = yearMatch ? yearMatch[1] : undefined;

        // Extract player count - THIS IS THE KEY DATA WE NEED
        const minPlayersMatch = xml.match(/<minplayers[^>]*value="(\d+)"/);
        const maxPlayersMatch = xml.match(/<maxplayers[^>]*value="(\d+)"/);
        const minPlayers = minPlayersMatch ? parseInt(minPlayersMatch[1], 10) : 1;
        const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : minPlayers;

        // Extract image URLs
        let coverImageUrl: string | undefined;
        const imageMatch = xml.match(/<image>([^<]+)<\/image>/);
        const thumbnailMatch = xml.match(/<thumbnail>([^<]+)<\/thumbnail>/);
        coverImageUrl = imageMatch ? imageMatch[1].trim() : (thumbnailMatch ? thumbnailMatch[1].trim() : undefined);

        // Extract categories
        const categoryMatches = xml.matchAll(/<link[^>]*type="boardgamecategory"[^>]*value="([^"]*)"/gi);
        const genres = Array.from(categoryMatches).map(m => this.decodeXmlEntities(m[1]));

        // Extract designers
        const designerMatches = xml.matchAll(/<link[^>]*type="boardgamedesigner"[^>]*value="([^"]*)"/gi);
        const developers = Array.from(designerMatches).map(m => this.decodeXmlEntities(m[1]));

        // Extract publishers
        const publisherMatches = xml.matchAll(/<link[^>]*type="boardgamepublisher"[^>]*value="([^"]*)"/gi);
        const publishers = Array.from(publisherMatches).map(m => this.decodeXmlEntities(m[1]));

        // Extract BGG rating - look for average rating
        const ratingMatch = xml.match(/<average[^>]*value="([^"]*)"/);
        const rating = ratingMatch ? Math.round(parseFloat(ratingMatch[1]) * 10) : undefined;

        return {
            externalId,
            name,
            description: description || undefined,
            shortDescription: description ? truncateText(description, MAX_SHORT_DESCRIPTION_LENGTH) : undefined,
            coverImageUrl,
            headerImageUrl: coverImageUrl,
            genres: genres.length > 0 ? genres : ['Board Game'],
            developers: developers.slice(0, 5),
            publishers: publishers.slice(0, 3),
            releaseDate,
            platforms: ['Physical'],
            metacriticScore: rating,
            playerInfo: {
                overallMinPlayers: minPlayers,
                overallMaxPlayers: maxPlayers,
                supportsPhysical: true,
                supportsLocal: maxPlayers > 1,
                supportsOnline: false,
                physicalMaxPlayers: maxPlayers,
                localMaxPlayers: maxPlayers,
            },
            rawPayload: {xml: xml.substring(0, MAX_RAW_PAYLOAD_LENGTH)}, // Truncate for storage
        };
    }
}
