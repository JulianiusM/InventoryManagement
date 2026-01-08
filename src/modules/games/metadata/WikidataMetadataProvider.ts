/**
 * Wikidata Metadata Provider for Board Games
 * Uses Wikidata Query Service (SPARQL) to fetch board game metadata
 * 
 * Wikidata has structured data for board games including:
 * - Player counts (minimum and maximum)
 * - Designers
 * - Publishers
 * - Categories
 * 
 * No API key required - uses public Wikidata Query Service
 * Rate limiting: Wikidata asks for reasonable usage
 */

import {
    BaseMetadataProvider,
    MetadataProviderManifest,
    GameMetadata,
    MetadataSearchResult,
} from './MetadataProviderInterface';
import {truncateText} from '../../lib/htmlUtils';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_SEARCH_API = 'https://www.wikidata.org/w/api.php';

// Rate limiting - be respectful to Wikidata
const RATE_LIMIT_MS = 1000;
let lastRequestTime = 0;

// Short description max length (2-4 lines)
const MAX_SHORT_DESCRIPTION_LENGTH = 250;

const WIKIDATA_METADATA_MANIFEST: MetadataProviderManifest = {
    id: 'wikidata',
    name: 'Wikidata Board Games',
    description: 'Fetch board game metadata from Wikidata. Provides player counts, designers, and publishers for board games.',
    version: '1.0.0',
    requiresApiKey: false,
    gameUrlPattern: 'https://www.wikidata.org/wiki/{id}',
};

interface WikidataSearchResult {
    id: string;
    label: string;
    description?: string;
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
     * Search for board games on Wikidata using SPARQL
     * This provides much better results than the entity search API
     * because it actually checks the game type (instance of board game, etc.)
     */
    async searchGames(query: string, limit = 10, _apiKey?: string): Promise<MetadataSearchResult[]> {
        if (!query || query.trim().length < 2) {
            return [];
        }

        await this.rateLimit();

        // Use SPARQL to search for board games directly - much more reliable than entity search
        // This queries for items that are instance of board game, card game, etc.
        // Escape backslashes first, then quotes, to avoid double-escaping
        const escapedQuery = query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const sparqlQuery = `
SELECT DISTINCT ?item ?itemLabel ?itemDescription ?image ?publication
WHERE {
  # Search by label - use SERVICE for full-text search
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:endpoint "www.wikidata.org";
                    wikibase:api "EntitySearch";
                    mwapi:search "${escapedQuery}";
                    mwapi:language "en".
    ?item wikibase:apiOutputItem mwapi:item.
  }
  
  # Filter to board games, card games, and related types
  ?item wdt:P31 ?type.
  VALUES ?type { 
    wd:Q131436    # board game
    wd:Q142714    # card game
    wd:Q1368379   # tabletop game
    wd:Q627851    # trading card game
    wd:Q11410     # game (general, as fallback)
  }
  
  # Get label and description
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  
  # Optional: image and publication date
  OPTIONAL { ?item wdt:P18 ?image. }
  OPTIONAL { ?item wdt:P577 ?publication. }
}
LIMIT ${limit * 2}`;

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
                console.warn(`Wikidata SPARQL search error: ${response.status}`);
                // Fall back to simpler entity search if SPARQL fails
                return this.searchGamesSimple(query, limit);
            }

            const data = await response.json() as {results?: {bindings?: Array<Record<string, WikidataSparqlBinding>>}};
            const bindings = data.results?.bindings || [];

            // Deduplicate by item ID (SPARQL can return duplicates due to multiple types)
            const seenIds = new Set<string>();
            const results: MetadataSearchResult[] = [];

            for (const binding of bindings) {
                if (results.length >= limit) break;

                const itemUri = binding.item?.value;
                if (!itemUri) continue;

                const id = itemUri.split('/').pop();
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);

                const name = binding.itemLabel?.value || id;
                const year = binding.publication?.value ? binding.publication.value.substring(0, 4) : undefined;
                const image = binding.image?.value;

                results.push({
                    externalId: id,
                    name,
                    releaseDate: year,
                    coverImageUrl: image,
                    provider: 'wikidata',
                });
            }

            // Sort by relevance: exact match first, then prefix match, then others
            const normalizedQuery = query.toLowerCase().trim();
            results.sort((a, b) => {
                const aName = a.name.toLowerCase().trim();
                const bName = b.name.toLowerCase().trim();

                // Exact match priority
                const aExact = aName === normalizedQuery ? 0 : 1;
                const bExact = bName === normalizedQuery ? 0 : 1;
                if (aExact !== bExact) return aExact - bExact;

                // Prefix match priority
                const aPrefix = aName.startsWith(normalizedQuery) ? 0 : 1;
                const bPrefix = bName.startsWith(normalizedQuery) ? 0 : 1;
                if (aPrefix !== bPrefix) return aPrefix - bPrefix;

                // Shorter names preferred
                return aName.length - bName.length;
            });

            return results;
        } catch (error) {
            console.warn('Wikidata SPARQL search error:', error);
            // Fall back to simple search on error
            return this.searchGamesSimple(query, limit);
        }
    }

    /**
     * Simple fallback search using entity API (less accurate but more reliable)
     */
    private async searchGamesSimple(query: string, limit: number): Promise<MetadataSearchResult[]> {
        const searchParams = new URLSearchParams({
            action: 'wbsearchentities',
            search: query.trim(),
            language: 'en',
            format: 'json',
            type: 'item',
            limit: String(limit * 3),
            origin: '*',
        });

        try {
            const response = await fetch(`${WIKIDATA_SEARCH_API}?${searchParams.toString()}`);
            if (!response.ok) {
                return [];
            }

            const data = await response.json() as {search?: WikidataSearchResult[]};
            const searchResults = (data.search || []) as WikidataSearchResult[];

            const results: MetadataSearchResult[] = [];
            for (const item of searchResults) {
                if (results.length >= limit) break;

                const description = (item.description || '').toLowerCase();
                // Include board/card/tabletop game related terms (this is a fallback search)
                if (description.includes('board game') || 
                    description.includes('card game') ||
                    description.includes('tabletop game') ||
                    description.includes('dice game') ||
                    description.includes('tile game') ||
                    description.includes('strategy game') ||
                    description.includes('party game') ||
                    description.includes('game by')) {
                    results.push({
                        externalId: item.id,
                        name: item.label,
                        releaseDate: undefined,
                        coverImageUrl: undefined,
                        provider: 'wikidata',
                    });
                }
            }

            return results;
        } catch (error) {
            console.warn('Wikidata simple search error:', error);
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

        await this.rateLimit();

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
     * Search for a game by name and return best match with full metadata
     */
    async findByGameName(name: string): Promise<GameMetadata | null> {
        const searchResults = await this.searchGames(name, 10);
        if (searchResults.length === 0) {
            return null;
        }

        // Find best match with improved matching
        const normalizedQuery = name.toLowerCase().trim();
        
        // Priority 1: Exact match (case-insensitive)
        let bestMatch = searchResults.find(
            r => r.name.toLowerCase().trim() === normalizedQuery
        );
        
        // Priority 2: Query starts with the normalized query followed by non-alphanumeric
        // This prevents "Carcassonne: The City" from matching when searching for "Carcassonne"
        if (!bestMatch) {
            bestMatch = searchResults.find(r => {
                const rNorm = r.name.toLowerCase().trim();
                // Check if the result starts with query and next char (if any) is not alphanumeric
                if (!rNorm.startsWith(normalizedQuery)) return false;
                if (rNorm.length === normalizedQuery.length) return true;
                const nextChar = rNorm.charAt(normalizedQuery.length);
                return !/[a-z0-9]/i.test(nextChar);
            });
        }
        
        // Priority 3: Name ends with the query (e.g. "The Game: Carcassonne" matches "Carcassonne")
        if (!bestMatch) {
            bestMatch = searchResults.find(
                r => r.name.toLowerCase().trim().endsWith(normalizedQuery)
            );
        }
        
        // Priority 4: First result if nothing better
        if (!bestMatch) {
            bestMatch = searchResults[0];
        }

        return this.getGameMetadata(bestMatch.externalId);
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
        
        // Parse player counts
        const minPlayers = first.minPlayers?.value ? parseInt(first.minPlayers.value, 10) : 1;
        const maxPlayers = first.maxPlayers?.value ? parseInt(first.maxPlayers.value, 10) : minPlayers;
        
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
