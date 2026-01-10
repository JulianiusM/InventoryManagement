/**
 * Game Name Utilities
 * Provides fuzzy search and edition detection for game titles
 */

/**
 * Edition types and their canonical names.
 * We use a simplified approach: define edition types once and generate patterns dynamically.
 */
const EDITION_TYPES = [
    // Multi-word edition types (must come first for longest match)
    { keywords: ['game', 'of', 'the', 'year', 'edition'], canonical: 'Game of the Year Edition' },
    { keywords: ['game', 'of', 'the', 'year'], canonical: 'Game of the Year Edition' },
    { keywords: ['goty', 'edition'], canonical: 'Game of the Year Edition' },
    { keywords: ['goty'], canonical: 'Game of the Year Edition' },
    { keywords: ['hd', 'remaster'], canonical: 'HD Remaster' },
    { keywords: ['hd', 'remix'], canonical: 'HD Remix' },
    { keywords: ['directors', 'cut'], canonical: 'Director\'s Cut' },
    { keywords: ['director\'s', 'cut'], canonical: 'Director\'s Cut' },
    { keywords: ['collector\'s', 'edition'], canonical: 'Collector\'s Edition' },
    { keywords: ['collectors', 'edition'], canonical: 'Collector\'s Edition' },
    
    // Two-word edition types (X Edition patterns)
    { keywords: ['definitive', 'edition'], canonical: 'Definitive Edition' },
    { keywords: ['ultimate', 'edition'], canonical: 'Ultimate Edition' },
    { keywords: ['enhanced', 'edition'], canonical: 'Enhanced Edition' },
    { keywords: ['complete', 'edition'], canonical: 'Complete Edition' },
    { keywords: ['deluxe', 'edition'], canonical: 'Deluxe Edition' },
    { keywords: ['premium', 'edition'], canonical: 'Premium Edition' },
    { keywords: ['limited', 'edition'], canonical: 'Limited Edition' },
    { keywords: ['special', 'edition'], canonical: 'Special Edition' },
    { keywords: ['anniversary', 'edition'], canonical: 'Anniversary Edition' },
    { keywords: ['standard', 'edition'], canonical: 'Standard Edition' },
    { keywords: ['gold', 'edition'], canonical: 'Gold Edition' },
    { keywords: ['platinum', 'edition'], canonical: 'Platinum Edition' },
    { keywords: ['legendary', 'edition'], canonical: 'Legendary Edition' },
    { keywords: ['history', 'edition'], canonical: 'History Edition' },
    { keywords: ['classic', 'edition'], canonical: 'Classic Edition' },
    { keywords: ['royal', 'edition'], canonical: 'Royal Edition' },
    { keywords: ['digital', 'edition'], canonical: 'Digital Edition' },
    { keywords: ['expansion', 'edition'], canonical: 'Expansion Edition' },
    { keywords: ['extended', 'edition'], canonical: 'Extended Edition' },
    
    // Single-word edition markers
    { keywords: ['remastered'], canonical: 'Remastered' },
    { keywords: ['remake'], canonical: 'Remake' },
    { keywords: ['redux'], canonical: 'Redux' },
    { keywords: ['complete'], canonical: 'Complete Edition' },
    { keywords: ['gold'], canonical: 'Gold Edition' },
    { keywords: ['definitive'], canonical: 'Definitive Edition' },
];

/**
 * Extract edition from game name using a token-based approach.
 * This handles all common formats:
 * - "Game - Premium Edition"
 * - "Game: Premium Edition"
 * - "Game Premium Edition"
 * - "Game (Premium Edition)"
 * - "Game [Premium Edition]"
 * 
 * @returns Object with base name and detected edition
 */
export function extractEdition(gameName: string): {baseName: string; edition: string} {
    // Normalize input: trim whitespace
    const trimmedName = gameName.trim();
    if (!trimmedName) {
        return { baseName: '', edition: 'Standard Edition' };
    }
    
    // Step 1: Check for parentheses/brackets format first
    // "Game (Premium Edition)" or "Game [Premium Edition]"
    const parenMatch = trimmedName.match(/^(.+?)\s*\(([^)]+Edition|GOTY|Remastered|Remake|Redux|Director'?s?\s+Cut|HD\s+Remaster)\)$/i);
    if (parenMatch) {
        const baseName = parenMatch[1].trim();
        const editionPart = parenMatch[2].trim();
        const canonical = findCanonicalEdition(editionPart);
        if (canonical) {
            return { baseName, edition: canonical };
        }
    }
    
    const bracketMatch = trimmedName.match(/^(.+?)\s*\[([^\]]+Edition|GOTY|Remastered|Remake|Redux|Director'?s?\s+Cut|HD\s+Remaster)\]$/i);
    if (bracketMatch) {
        const baseName = bracketMatch[1].trim();
        const editionPart = bracketMatch[2].trim();
        const canonical = findCanonicalEdition(editionPart);
        if (canonical) {
            return { baseName, edition: canonical };
        }
    }
    
    // Step 2: Split on common separators (-, –, —, :) and check the last part
    // Handle cases like "Game - Premium Edition" or "Game: Premium Edition"
    // Use greedy matching to find the last separator
    const separatorMatch = trimmedName.match(/^(.+)\s*[-–—:]\s*([^-–—:]+)$/);
    if (separatorMatch) {
        const potentialBase = separatorMatch[1].trim();
        const potentialEdition = separatorMatch[2].trim();
        const canonical = findCanonicalEdition(potentialEdition);
        if (canonical) {
            // Strip any trailing separators from base name
            const cleanBase = potentialBase.replace(/\s*[-–—:]\s*$/, '').trim();
            return { baseName: cleanBase, edition: canonical };
        }
    }
    
    // Step 3: Token-based matching for space-separated editions
    // "The Sims 4 Premium Edition" -> "The Sims 4" + "Premium Edition"
    const words = trimmedName.split(/\s+/);
    
    // Try to find edition keywords from the end of the title
    for (const editionType of EDITION_TYPES) {
        const keywordCount = editionType.keywords.length;
        if (words.length > keywordCount) {
            // Get the last N words
            const lastWords = words.slice(-keywordCount).map(w => w.toLowerCase().replace(/[''`]/g, ''));
            
            // Check if they match the edition keywords
            let matches = true;
            for (let i = 0; i < keywordCount; i++) {
                if (lastWords[i] !== editionType.keywords[i]) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                const baseName = words.slice(0, -keywordCount).join(' ').trim();
                if (baseName) { // Only return if we have a non-empty base name
                    return { baseName, edition: editionType.canonical };
                }
            }
        }
    }
    
    // No edition detected - return original name with Standard Edition
    return { baseName: trimmedName, edition: 'Standard Edition' };
}

/**
 * Find the canonical edition name for a given edition string.
 */
function findCanonicalEdition(editionPart: string): string | null {
    const normalized = editionPart.toLowerCase().replace(/[''`]/g, '').trim();
    const words = normalized.split(/\s+/);
    
    for (const editionType of EDITION_TYPES) {
        // Check if all keywords are present in order
        if (editionType.keywords.length === words.length) {
            let matches = true;
            for (let i = 0; i < editionType.keywords.length; i++) {
                if (words[i] !== editionType.keywords[i]) {
                    matches = false;
                    break;
                }
            }
            if (matches) {
                return editionType.canonical;
            }
        }
    }
    
    // If we have "X Edition" format, try to match just the pattern
    if (words.length === 2 && words[1] === 'edition') {
        // Return a capitalized version of the edition type
        return words[0].charAt(0).toUpperCase() + words[0].slice(1) + ' Edition';
    }
    
    // For single-word special cases
    if (words.length === 1) {
        for (const editionType of EDITION_TYPES) {
            if (editionType.keywords.length === 1 && editionType.keywords[0] === words[0]) {
                return editionType.canonical;
            }
        }
    }
    
    return null;
}

/**
 * Normalize a game title for matching/merging
 * Removes trademark symbols, punctuation, extra spaces, and converts to lowercase
 * 
 * Use cases:
 * - "The Sims 4" and "The Sims™ 4" should match
 * - "Game: Title" and "Game - Title" should match
 */
export function normalizeGameTitle(title: string): string {
    return title
        .toLowerCase()
        // Remove trademark/copyright symbols first (before other processing)
        .replace(/[™®©]/g, '')
        // Replace common punctuation variations with nothing
        .replace(/[''`´]/g, '') // apostrophes
        .replace(/[.,:;!?]/g, '') // punctuation
        .replace(/[-–—]/g, ' ') // dashes to spaces
        .replace(/[&]/g, 'and') // ampersand to "and"
        .replace(/\s+/g, ' ') // multiple spaces to single
        .trim();
}

/**
 * Normalize a string for fuzzy comparison
 * Removes punctuation, extra spaces, and converts to lowercase
 */
export function normalizeForSearch(text: string): string {
    return normalizeGameTitle(text);
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
 * Uses multiple factors for better relevance:
 * - Exact match = 1.0
 * - Prefix match bonus
 * - Contains match bonus
 * - Levenshtein distance for general similarity
 */
export function similarityScore(a: string, b: string): number {
    const normA = normalizeForSearch(a);
    const normB = normalizeForSearch(b);
    
    if (normA === normB) return 1;
    if (normA.length === 0 || normB.length === 0) return 0;
    
    let score = 0;
    
    // Prefix match: search term at start of target (high priority)
    if (normB.startsWith(normA)) {
        // Bonus based on how much of the target is covered
        score = Math.max(score, 0.9 + (normA.length / normB.length) * 0.1);
    }
    
    // Target starts with search term as a word boundary
    // Check if character after search term is a space (more efficient than concatenation)
    if (normB.length > normA.length && 
        normB.startsWith(normA) && 
        normB.charAt(normA.length) === ' ') {
        score = Math.max(score, 0.85);
    }
    
    // Contains match: search term appears anywhere in target
    if (normB.includes(normA)) {
        // Bonus based on how much of the target is the search term
        score = Math.max(score, 0.6 + (normA.length / normB.length) * 0.2);
    }
    
    // Levenshtein-based similarity (lower priority)
    const distance = levenshteinDistance(normA, normB);
    const maxLen = Math.max(normA.length, normB.length);
    const levenshteinScore = 1 - (distance / maxLen);
    
    // Only use Levenshtein if score is better than what we have
    // but cap it at 0.5 to prioritize prefix/contains matches
    score = Math.max(score, Math.min(levenshteinScore, 0.5));
    
    return score;
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
