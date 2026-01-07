/**
 * BGG Plus Metadata Provider
 * Enhanced BoardGameGeek provider with improved retry logic
 * 
 * Uses the BGG XML API2 with:
 * - Retry logic for 202 status (BGG processing)
 * - Better error handling
 * - Reliable player count data
 * 
 * No API key required - uses public BGG API
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
const RATE_LIMIT_MS = 1200;
let lastRequestTime = 0;

// Retry configuration for BGG 202 status
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 2500;

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

const BGG_HOT_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'bggplus',
    name: 'BGG Plus',
    description: 'Enhanced BoardGameGeek provider with reliable player counts and improved retry logic.',
    version: '1.0.0',
    requiresApiKey: false,
    gameUrlPattern: 'https://boardgamegeek.com/boardgame/{id}',
};

export class BggPlusMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(BGG_HOT_METADATA_MANIFEST);
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
     * Fetch with retry logic for BGG's 202 processing status
     */
    private async fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response | null> {
        for (let attempt = 0; attempt < retries; attempt++) {
            try {
                await this.rateLimit();
                const response = await fetch(url);
                
                // BGG returns 202 when processing - need to wait and retry
                if (response.status === 202) {
                    console.log(`BGG returned 202 (processing), attempt ${attempt + 1}/${retries}`);
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    continue;
                }
                
                if (response.ok) {
                    return response;
                }
                
                // Rate limited - wait longer
                if (response.status === 429) {
                    console.log('BGG rate limit hit, waiting...');
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * 2));
                    continue;
                }
                
                // Other error - don't retry
                console.warn(`BGG API error: ${response.status}`);
                return null;
                
            } catch (error) {
                console.warn(`BGG fetch attempt ${attempt + 1} failed:`, error);
                if (attempt < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                }
            }
        }
        console.warn('BGG fetch exhausted all retries');
        return null;
    }

    /**
     * Decode XML entities safely
     */
    private decodeXmlEntities(text: string): string {
        // First decode numeric entities
        let result = text
            .replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
        
        // Then decode named entities except &amp;
        result = result
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");
        
        // Decode &amp; last
        result = result.replace(/&amp;/g, '&');
        
        return result;
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
            
            // Parse search results from XML
            const results: MetadataSearchResult[] = [];
            
            // Match items with more flexible regex
            const itemMatches = xml.matchAll(/<item[^>]*id="(\d+)"[^>]*>[\s\S]*?<\/item>/gi);
            
            for (const itemMatch of itemMatches) {
                if (results.length >= limit) break;
                
                const itemXml = itemMatch[0];
                const id = itemMatch[1];
                
                // Get primary name
                const nameMatch = itemXml.match(/<name[^>]*type="primary"[^>]*value="([^"]*)"/) ||
                                  itemXml.match(/<name[^>]*value="([^"]*)"/);
                if (!nameMatch) continue;
                
                const name = this.decodeXmlEntities(nameMatch[1]);
                
                // Get year published
                const yearMatch = itemXml.match(/<yearpublished[^>]*value="([^"]*)"/);
                const year = yearMatch ? yearMatch[1] : undefined;

                results.push({
                    externalId: id,
                    name,
                    releaseDate: year,
                    coverImageUrl: undefined,
                    provider: 'bggplus',
                });
            }

            // Sort by relevance
            const normalizedQuery = query.toLowerCase().trim();
            results.sort((a, b) => {
                const aExact = a.name.toLowerCase() === normalizedQuery ? 0 : 1;
                const bExact = b.name.toLowerCase() === normalizedQuery ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;
                
                const aStarts = a.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
                const bStarts = b.name.toLowerCase().startsWith(normalizedQuery) ? 0 : 1;
                return aStarts - bStarts;
            });

            return results;
        } catch (error) {
            console.warn('BGG Plus search error:', error);
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
            console.warn('BGG Plus get metadata error:', error);
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

        // Find best match
        const normalizedQuery = name.toLowerCase().trim();
        let bestMatch = searchResults.find(
            r => r.name.toLowerCase().trim() === normalizedQuery
        );
        
        if (!bestMatch) {
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
     * Parse BGG XML response to GameMetadata
     */
    private parseGameXml(xml: string, externalId: string): GameMetadata {
        // Extract primary name with multiple pattern support
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

        // Extract description (CDATA encoded)
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

        // Extract player count - THE KEY DATA
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

        // Extract BGG rating
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
            rawPayload: {xml: xml.substring(0, 5000)},
        };
    }
}
