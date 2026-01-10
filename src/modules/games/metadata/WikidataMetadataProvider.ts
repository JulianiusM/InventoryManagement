/**
 * Wikidata Metadata Provider for Board Games
 * Uses Wikidata REST API for search and SPARQL for detailed metadata
 * 
 * This provider uses a broad search approach:
 * 1. Fetch all matching items from Wikidata using the REST API (more complete than type-filtered SPARQL)
 * 2. Local ranking/filtering with heuristics to prioritize games
 * 3. Filter out explicit non-games (cities, countries, people, etc.)
 * 4. Prioritize exact matches (Carcassonne matches Carcassonne first, then expansions)
 * 
 * No API key required - uses public Wikidata APIs
 * Rate limiting: Handled by GameSyncService using getRateLimitConfig()
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    MetadataProviderCapabilities,
    RateLimitConfig,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {truncateText} from '../../lib/htmlUtils';

// Use REST API for search (new API, better than actions API)
const WIKIDATA_REST_API = 'https://www.wikidata.org/w/rest.php/wikibase';
const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

// Scoring constants for search result ranking
const EXACT_MATCH_SCORE = 500;
const PREFIX_MATCH_SCORE = 150;
const EXPANSION_MATCH_SCORE = 80;
const CONTAINS_MATCH_SCORE = 50;
const GAME_INDICATOR_BOOST = 100;
const NO_GAME_INDICATOR_PENALTY = 50;
const NAME_LENGTH_PENALTY_FACTOR = 0.5;
const NON_GAME_PENALTY_SCORE = -1000;
const MIN_ACCEPTABLE_SCORE = -500;

const WIKIDATA_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'wikidata',
    name: 'Wikidata Board Games',
    description: 'Fetch board game metadata from Wikidata. Provides player counts, designers, and publishers for board games.',
    version: '1.0.0',
    requiresApiKey: false,
    gameUrlPattern: 'https://www.wikidata.org/wiki/{id}',
};

// Terms in description that indicate a game-related item
const GAME_INDICATORS = [
    'game', 'board game', 'card game', 'tabletop game', 'dice game',
    'tile game', 'strategy game', 'party game', 'puzzle', 'role-playing game',
    'trading card game', 'collectible card game', 'miniature game',
    'war game', 'euro game', 'eurogame', 'amerithrash', 'cooperative game',
    'deck-building', 'deck building', 'worker placement', 'area control'
];

// Terms in description that indicate NOT a game (for filtering)
// Note: We only use terms that very strongly indicate non-games
// We avoid nationality terms as they could appear in game names/descriptions
const NON_GAME_INDICATORS = [
    'city in', 'commune in', 'town in', 'village in', 'municipality in', 'county in',
    'department in', 'region in', 'province in', 'district in', 'country in',
    'river in', 'lake in', 'mountain in', 'island in', 'peninsula in',
    'born in', 'died in', 'castle in', 'fortress in', 'cathedral in', 'church in',
    'album by', 'song by', 'film by', 'film directed', 'movie by', 'television series',
    'novel by', 'book by', 'written by', 'magazine', 'newspaper',
    'software company', 'operating system', 'programming language',
    'actor', 'actress', 'singer', 'musician', 'politician',
    'footballer', 'athlete', 'writer', 'author', 'film director', 'artist', 'Wikimedia disambiguation page',
    'family name', 'first name', 'last name', 'middle name', 'painting by',
];

interface WikidataSearchResult {
    id: string;
    label: string;
    description?: string;
}

interface WikidataRestSearchResult {
    id: string;
    "display-label"?: {
        language: string;
        value: string;
    };
    description?: {
        language: string;
        value: string;
    };
    match?: {
        type: string;
        language: string;
        text: string;
    };
}

interface WikidataSparqlBinding {
    value: string;
    type: string;
}

interface WikidataSparqlResult {
    item: WikidataSparqlBinding;
    itemLabel: WikidataSparqlBinding;
    itemDescription?: WikidataSparqlBinding;
    image?: WikidataSparqlBinding;
    minPlayers?: WikidataSparqlBinding;
    maxPlayers?: WikidataSparqlBinding;
    designer?: WikidataSparqlBinding;
    designerLabel?: WikidataSparqlBinding;
    publisher?: WikidataSparqlBinding;
    publisherLabel?: WikidataSparqlBinding;
    genreLabel?: WikidataSparqlBinding;
    publication?: WikidataSparqlBinding;
}

export class WikidataMetadataProvider extends BaseMetadataProvider {
    constructor() {
        super(WIKIDATA_METADATA_MANIFEST);
    }
    
    /**
     * Wikidata capabilities:
     * - Has accurate player counts for board games
     * - Does NOT have store URLs
     * - Does NOT support batch requests
     * - Supports search
     * - Has descriptions but NOT cover images reliably
     */
    getCapabilities(): MetadataProviderCapabilities {
        return {
            hasAccuratePlayerCounts: true, // Wikidata has accurate player counts for board games
            hasStoreUrls: false,
            supportsBatchRequests: false,
            supportsSearch: true,
            hasDescriptions: true,
            hasCoverImages: false, // Wikidata doesn't reliably have cover images
        };
    }
    
    /**
     * Wikidata rate limit configuration
     * Wikidata asks for reasonable usage - be respectful
     */
    getRateLimitConfig(): RateLimitConfig {
        return {
            requestDelayMs: 1000, // 1 second between requests (respectful usage)
            maxBatchSize: 5,
            batchDelayMs: 2000,
            maxGamesPerSync: 100, // Conservative for SPARQL queries
            retryDelayMs: 5000, // Wait longer before retry
            maxConsecutiveErrors: 3,
        };
    }

    /**
     * Search for board games on Wikidata using the REST API
     * Uses broad search then local filtering/ranking for better results
     * 
     * NOTE: Rate limiting is handled by GameSyncService, not here.
     * 
     * Approach:
     * 1. Fetch all matching items from Wikidata (not type-filtered)
     * 2. Apply local heuristics to score and filter results
     * 3. Prioritize exact matches and filter out non-games
     */
    async searchGames(query: string, limit = 10, _apiKey?: string): Promise<MetadataSearchResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        // NOTE: Rate limiting is handled by GameSyncService, not here.

        // Use REST API for search - broader than type-filtered SPARQL
        // This gets ALL matching items, then we filter locally
        const searchUrl = `${WIKIDATA_REST_API}/v0/search/items?q=${encodeURIComponent(query.trim())}&language=en`;

        try {
            const response = await fetch(searchUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'InventoryManagement/1.0',
                },
            });

            if (!response.ok) {
                console.warn(`Wikidata REST search error: ${response.status}`);
                // Fall back to entity search if REST API fails
                return this.searchGamesEntityApi(query, limit);
            }

            const data = await response.json() as {results?: WikidataRestSearchResult[]};
            const searchResults = data.results || [];

            // Score and filter all results locally
            const scoredResults = this.scoreAndFilterResults(searchResults, query.trim());

            // Return top results
            return scoredResults.slice(0, limit).map(sr => ({
                externalId: sr.id,
                name: sr["display-label"]?.value || sr.id,
                releaseDate: undefined,
                coverImageUrl: undefined,
                provider: 'wikidata',
            }));
        } catch (error) {
            console.warn('Wikidata REST search error:', error);
            // Fall back to entity search on error
            return this.searchGamesEntityApi(query, limit);
        }
    }

    /**
     * Score and filter search results using local heuristics
     * Returns sorted results with best matches first
     */
    private scoreAndFilterResults(results: WikidataRestSearchResult[], query: string): WikidataRestSearchResult[] {
        const normalizedQuery = query.toLowerCase().trim();
        
        // Score each result
        const scored = results.map(item => {
            const name = (item["display-label"]?.value || '').toLowerCase().trim();
            const desc = (item.description?.value || '').toLowerCase();
            
            let score = 0;
            
            // Check if this is explicitly NOT a game
            if (this.isExplicitNonGame(desc)) {
                return { item, score: NON_GAME_PENALTY_SCORE };
            }
            
            // Boost if description contains game-related terms
            const isLikelyGame = this.isLikelyGame(desc);
            if (isLikelyGame) {
                score += GAME_INDICATOR_BOOST;
            }
            
            // Exact match is best
            if (name === normalizedQuery) {
                score += EXACT_MATCH_SCORE;
            }
            // Name starts with query (expansion/edition)
            else if (name.startsWith(normalizedQuery + ' ') || 
                     name.startsWith(normalizedQuery + ':') ||
                     name.startsWith(normalizedQuery + '-')) {
                // Check if it's an expansion (penalize slightly)
                if (desc.includes('expansion') || desc.includes('add-on') || desc.includes('supplement')) {
                    score += EXPANSION_MATCH_SCORE;
                } else {
                    score += PREFIX_MATCH_SCORE;
                }
            }
            // Query appears in name
            else if (name.includes(normalizedQuery)) {
                score += CONTAINS_MATCH_SCORE;
            }
            
            // Prefer shorter names (more likely to be the base game)
            score -= name.length * NAME_LENGTH_PENALTY_FACTOR;
            
            // If no game indicators and no exact match, penalize
            if (!isLikelyGame && name !== normalizedQuery) {
                score -= NO_GAME_INDICATOR_PENALTY;
            }
            
            return { item, score };
        });
        
        // Filter out explicit non-games and sort by score descending
        return scored
            .filter(s => s.score > MIN_ACCEPTABLE_SCORE)
            .sort((a, b) => b.score - a.score)
            .map(s => s.item);
    }
    
    /**
     * Check if description indicates this is likely a game
     */
    private isLikelyGame(description: string): boolean {
        return GAME_INDICATORS.some(term => description.includes(term));
    }
    
    /**
     * Check if description explicitly indicates this is NOT a game
     */
    private isExplicitNonGame(description: string): boolean {
        // Only filter if description strongly indicates non-game
        // Be conservative to avoid filtering out games with unusual descriptions
        const desc = description.toLowerCase();
        
        // Check for location indicators
        if (NON_GAME_INDICATORS.some(term => {
            // Check for term as a word (not part of another word)
            const regex = new RegExp(`\\b${term}\\b`, 'i');
            return regex.test(desc);
        })) {
            // If description also contains game terms, it might still be a game
            if (this.isLikelyGame(desc)) {
                return false;
            }
            return true;
        }
        
        return false;
    }

    /**
     * Fallback search using entity search API (older actions API)
     * Used when REST API fails
     */
    private async searchGamesEntityApi(query: string, limit: number): Promise<MetadataSearchResult[]> {
        const searchParams = new URLSearchParams({
            action: 'wbsearchentities',
            search: query.trim(),
            language: 'en',
            format: 'json',
            type: 'item',
            limit: String(50), // Get many results to filter locally
            origin: '*',
        });

        const searchUrl = `https://www.wikidata.org/w/api.php?${searchParams.toString()}`;

        try {
            const response = await fetch(searchUrl, {
                headers: {
                    'User-Agent': 'InventoryManagement/1.0',
                },
            });
            if (!response.ok) {
                return [];
            }

            const data = await response.json() as {search?: WikidataSearchResult[]};
            const searchResults = (data.search || []) as WikidataSearchResult[];

            // Convert to REST API format and use shared scoring logic
            const restFormat: WikidataRestSearchResult[] = searchResults.map(item => ({
                id: item.id,
                "display-label": {value: item.label, language: "en"},
                description: item.description ? {value: item.description, language: "en"}: undefined,
            }));

            const scoredResults = this.scoreAndFilterResults(restFormat, query.trim());

            return scoredResults.slice(0, limit).map(sr => ({
                externalId: sr.id,
                name: sr["display-label"]?.value || sr.id,
                releaseDate: undefined,
                coverImageUrl: undefined,
                provider: 'wikidata',
            }));
        } catch (error) {
            console.warn('Wikidata entity search error:', error);
            return [];
        }
    }

    /**
     * Get detailed metadata for a game using SPARQL
     */
    async getGameMetadata(externalId: string, _apiKey?: string): Promise<GameMetadata | null> {
        if (!externalId || !/^Q\d+$/.test(externalId)) {
            return null;
        }

        // NOTE: Rate limiting is handled by GameSyncService, not here.

        // SPARQL query to get board game details
        const sparqlQuery = `
SELECT ?item ?itemLabel ?itemDescription ?image ?minPlayers ?maxPlayers ?designerLabel ?publisherLabel ?genreLabel ?publication
WHERE {
  BIND(wd:${externalId} AS ?item)
  
  # Get labels and descriptions
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  
  # Optional properties
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P1872 ?minPlayers. }
  OPTIONAL { ?item wdt:P1873 ?maxPlayers. }
  OPTIONAL { ?item wdt:P178 ?designer. ?designer rdfs:label ?designerLabel. FILTER(LANG(?designerLabel) = "en") }
  OPTIONAL { ?item wdt:P123 ?publisher. ?publisher rdfs:label ?publisherLabel. FILTER(LANG(?publisherLabel) = "en") }
  OPTIONAL { ?item wdt:P136 ?genre. ?genre rdfs:label ?genreLabel. FILTER(LANG(?genreLabel) = "en") }
  OPTIONAL { ?item wdt:P577 ?publication. }
}
LIMIT 50`;

        try {
            const response = await fetch(WIKIDATA_SPARQL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/sparql-results+json',
                    'User-Agent': 'InventoryManagement/1.0',
                },
                body: `query=${encodeURIComponent(sparqlQuery)}`,
            });

            if (!response.ok) {
                console.warn(`Wikidata SPARQL error: ${response.status}`);
                return null;
            }

            const data = await response.json() as {results?: {bindings?: WikidataSparqlResult[]}};
            const bindings = data.results?.bindings as WikidataSparqlResult[];

            if (!bindings || bindings.length === 0) {
                return null;
            }

            return this.parseSparqlResults(externalId, bindings);
        } catch (error) {
            console.warn('Wikidata get metadata error:', error);
            return null;
        }
    }

    /**
     * Get game URL
     */
    getGameUrl(externalId: string): string {
        return `https://www.wikidata.org/wiki/${externalId}`;
    }

    /**
     * Parse SPARQL results to GameMetadata
     */
    private parseSparqlResults(externalId: string, bindings: WikidataSparqlResult[]): GameMetadata {
        const first = bindings[0];
        
        const name = first.itemLabel?.value || `Game ${externalId}`;
        const description = first.itemDescription?.value || '';
        const coverImageUrl = first.image?.value;
        
        // Parse player counts with validation
        const parsePlayerCount = (value: string | undefined, defaultValue: number): number => {
            if (!value) return defaultValue;
            const parsed = Number(value);
            return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : defaultValue;
        };
        const minPlayers = parsePlayerCount(first.minPlayers?.value, 1);
        const maxPlayers = parsePlayerCount(first.maxPlayers?.value, minPlayers);
        
        // Collect all designers, publishers, and genres from all bindings
        const designers = new Set<string>();
        const publishers = new Set<string>();
        const genres = new Set<string>();
        let releaseDate: string | undefined;
        
        for (const binding of bindings) {
            if (binding.designerLabel?.value) {
                designers.add(binding.designerLabel.value);
            }
            if (binding.publisherLabel?.value) {
                publishers.add(binding.publisherLabel.value);
            }
            if (binding.genreLabel?.value) {
                genres.add(binding.genreLabel.value);
            }
            if (binding.publication?.value && !releaseDate) {
                // Parse ISO date to just year
                releaseDate = binding.publication.value.substring(0, 4);
            }
        }

        return {
            externalId,
            name,
            description: description || undefined,
            shortDescription: description ? truncateText(description, MAX_SHORT_DESCRIPTION_LENGTH) : undefined,
            coverImageUrl,
            headerImageUrl: coverImageUrl,
            genres: genres.size > 0 ? Array.from(genres).slice(0, 5) : ['Board Game'],
            developers: Array.from(designers).slice(0, 5),
            publishers: Array.from(publishers).slice(0, 3),
            releaseDate,
            platforms: ['Physical'],
            playerInfo: {
                overallMinPlayers: minPlayers,
                overallMaxPlayers: maxPlayers,
                supportsPhysical: true,
                supportsLocal: maxPlayers > 1,
                supportsOnline: false,
                physicalMaxPlayers: maxPlayers,
                localMaxPlayers: maxPlayers,
            },
            rawPayload: {bindings: bindings.slice(0, 10)}, // Keep some bindings for debugging
        };
    }
}
