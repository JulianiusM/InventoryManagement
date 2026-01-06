/**
 * Game Name Utilities
 * Provides fuzzy search and edition detection for game titles
 */

/**
 * Common game editions that should be extracted.
 * 
 * IMPORTANT: Patterns are processed in order - more specific patterns must come
 * before more generic ones. For example, "Game of the Year Edition" comes before
 * "GOTY" to ensure the full phrase is matched when present.
 */
const EDITION_PATTERNS: Array<{pattern: RegExp; edition: string}> = [
    // GOTY variants (specific first, then abbreviation)
    {pattern: /\s*[-–—:]\s*Game of the Year Edition$/i, edition: 'Game of the Year Edition'},
    {pattern: /\s+GOTY(?:\s+Edition)?$/i, edition: 'Game of the Year Edition'},
    {pattern: /\s+Game of the Year$/i, edition: 'Game of the Year Edition'},
    
    // Gold/Complete variants
    {pattern: /\s*[-–—:]\s*Gold Edition$/i, edition: 'Gold Edition'},
    {pattern: /\s+Gold$/i, edition: 'Gold Edition'},
    {pattern: /\s*[-–—:]\s*Complete Edition$/i, edition: 'Complete Edition'},
    {pattern: /\s+Complete$/i, edition: 'Complete Edition'},
    
    // Definitive/Ultimate variants
    {pattern: /\s*[-–—:]\s*Definitive Edition$/i, edition: 'Definitive Edition'},
    {pattern: /\s*[-–—:]\s*Ultimate Edition$/i, edition: 'Ultimate Edition'},
    {pattern: /\s*[-–—:]\s*Enhanced Edition$/i, edition: 'Enhanced Edition'},
    
    // Special editions
    {pattern: /\s*[-–—:]\s*Deluxe Edition$/i, edition: 'Deluxe Edition'},
    {pattern: /\s*[-–—:]\s*Premium Edition$/i, edition: 'Premium Edition'},
    {pattern: /\s*[-–—:]\s*Collector'?s Edition$/i, edition: 'Collector\'s Edition'},
    {pattern: /\s*[-–—:]\s*Limited Edition$/i, edition: 'Limited Edition'},
    {pattern: /\s*[-–—:]\s*Special Edition$/i, edition: 'Special Edition'},
    {pattern: /\s*[-–—:]\s*Anniversary Edition$/i, edition: 'Anniversary Edition'},
    {pattern: /\s*[-–—:]\s*Director'?s Cut$/i, edition: 'Director\'s Cut'},
    
    // Remasters/Remakes
    {pattern: /\s*[-–—:]\s*Remastered$/i, edition: 'Remastered'},
    {pattern: /\s*[-–—:]\s*HD Remaster$/i, edition: 'HD Remaster'},
    {pattern: /\s*[-–—:]\s*Remake$/i, edition: 'Remake'},
    
    // Standard edition (often implicit, but sometimes explicit)
    {pattern: /\s*[-–—:]\s*Standard Edition$/i, edition: 'Standard Edition'},
];

/**
 * Extract edition from game name
 * @returns Object with base name and detected edition
 */
export function extractEdition(gameName: string): {baseName: string; edition: string} {
    for (const {pattern, edition} of EDITION_PATTERNS) {
        if (pattern.test(gameName)) {
            const baseName = gameName.replace(pattern, '').trim();
            return {baseName, edition};
        }
    }
    
    // No edition detected - return original name with Standard Edition
    return {baseName: gameName, edition: 'Standard Edition'};
}

/**
 * Normalize a string for fuzzy comparison
 * Removes punctuation, extra spaces, and converts to lowercase
 */
export function normalizeForSearch(text: string): string {
    return text
        .toLowerCase()
        // Replace common punctuation variations with nothing
        .replace(/[''`´]/g, '') // apostrophes
        .replace(/[.,:;!?]/g, '') // punctuation
        .replace(/[-–—]/g, ' ') // dashes to spaces
        .replace(/[&]/g, 'and') // ampersand to "and"
        .replace(/\s+/g, ' ') // multiple spaces to single
        .trim();
}

/**
 * Simple fuzzy match function
 * Returns true if normalized search matches normalized target
 */
export function fuzzyMatch(search: string, target: string): boolean {
    const normalizedSearch = normalizeForSearch(search);
    const normalizedTarget = normalizeForSearch(target);
    
    // Direct substring match
    if (normalizedTarget.includes(normalizedSearch)) {
        return true;
    }
    
    // Word-based match (all search words must be present)
    const searchWords = normalizedSearch.split(' ').filter(w => w.length > 0);
    const targetWords = new Set(normalizedTarget.split(' '));
    
    return searchWords.every(word => 
        [...targetWords].some(tw => tw.includes(word) || word.includes(tw))
    );
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance normalized by length
 */
export function similarityScore(a: string, b: string): number {
    const normA = normalizeForSearch(a);
    const normB = normalizeForSearch(b);
    
    if (normA === normB) return 1;
    if (normA.length === 0 || normB.length === 0) return 0;
    
    const distance = levenshteinDistance(normA, normB);
    const maxLen = Math.max(normA.length, normB.length);
    
    return 1 - (distance / maxLen);
}

/**
 * Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];
    
    for (let i = 0; i <= a.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= b.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    
    return matrix[a.length][b.length];
}

/**
 * Filter and sort games by fuzzy search relevance
 */
export function fuzzySearchGames<T extends {name: string}>(
    games: T[],
    search: string,
    minScore = 0.3
): T[] {
    if (!search || search.trim().length === 0) {
        return games;
    }
    
    const normalizedSearch = normalizeForSearch(search);
    
    // Score each game
    const scored = games.map(game => ({
        game,
        score: similarityScore(search, game.name),
        fuzzyMatch: fuzzyMatch(search, game.name),
    }));
    
    // Filter by minimum score or fuzzy match
    const filtered = scored.filter(s => s.score >= minScore || s.fuzzyMatch);
    
    // Sort by score descending
    filtered.sort((a, b) => b.score - a.score);
    
    return filtered.map(s => s.game);
}
