/**
 * Known Playnite Provider Plugin IDs
 * Maps Playnite library plugin GUIDs to normalized provider names
 * 
 * This mapping is used for transparent aggregator pattern to identify
 * the original source of games imported via Playnite.
 */

export const KNOWN_PROVIDERS: Record<string, string> = {
    // Steam
    'cb91dfc9-b977-43bf-8e70-55f46e410fab': 'steam',
    // Epic Games
    '00000001-ebb2-4ecc-abcb-75c4f5a78e18': 'epic',
    '00000002-dbb3-46d2-8dc0-f695c3f987f9': 'epic',
    // GOG
    'aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e': 'gog',
    // EA App (Origin)
    '85dd7072-2f20-4e76-a007-41035e390724': 'ea',
    '00000003-dbb3-46d2-8dc0-f695c3f987f9': 'origin',
    // Ubisoft Connect
    'c2f038e5-8b92-4877-91f1-da9094155fc5': 'ubisoft',
    // Xbox/Game Pass
    '7e4fbb5e-2ae3-48d4-8ba0-6c90e136a77c': 'xbox',
    // PlayStation
    'e4ac81cb-1b1a-4ec9-8639-9a9633989a71': 'playstation',
    // Amazon Games
    'ed31b7dd-f6e6-4e31-9152-4d67a6f80e4a': 'amazon',
    // itch.io
    '00000004-ebb2-4ecc-abcb-75c4f5a78e18': 'itch',
    // Humble Bundle
    '96e8c4bc-ec5c-4c8b-87e7-da65de62deb5': 'humble',
    // Battle.net
    'e3c26a3d-d695-4cb7-a769-5d3d0da6d1a4': 'battlenet',
};

/**
 * Source name aliases for normalization
 * Maps various source name strings to normalized provider IDs
 * Includes language variations and common abbreviations
 */
export const SOURCE_NAME_ALIASES: Record<string, string> = {
    // Steam
    'steam': 'steam',
    'steam store': 'steam',
    'valve steam': 'steam',
    // Epic
    'epic': 'epic',
    'epic games': 'epic',
    'epic games store': 'epic',
    'epic store': 'epic',
    // GOG
    'gog': 'gog',
    'gog.com': 'gog',
    'gog galaxy': 'gog',
    // EA
    'ea': 'ea',
    'ea app': 'ea',
    'ea play': 'ea',
    'origin': 'ea',
    'ea origin': 'ea',
    'electronic arts': 'ea',
    // Ubisoft
    'ubisoft': 'ubisoft',
    'ubisoft connect': 'ubisoft',
    'uplay': 'ubisoft',
    'ubi': 'ubisoft',
    // Xbox/Microsoft
    'xbox': 'xbox',
    'xbox game pass': 'xbox',
    'microsoft': 'xbox',
    'microsoft store': 'xbox',
    'windows store': 'xbox',
    // PlayStation
    'playstation': 'playstation',
    'psn': 'playstation',
    'ps store': 'playstation',
    'playstation store': 'playstation',
    'playstation network': 'playstation',
    // Amazon
    'amazon': 'amazon',
    'amazon games': 'amazon',
    'amazon luna': 'amazon',
    'prime gaming': 'amazon',
    // itch.io
    'itch': 'itch',
    'itch.io': 'itch',
    // Humble
    'humble': 'humble',
    'humble bundle': 'humble',
    'humble store': 'humble',
    // Battle.net
    'battlenet': 'battlenet',
    'battle.net': 'battlenet',
    'blizzard': 'battlenet',
    'activision blizzard': 'battlenet',
    // Nintendo
    'nintendo': 'nintendo',
    'nintendo eshop': 'nintendo',
    'eshop': 'nintendo',
    // Rockstar
    'rockstar': 'rockstar',
    'rockstar games': 'rockstar',
    'rockstar launcher': 'rockstar',
    // Bethesda
    'bethesda': 'bethesda',
    'bethesda.net': 'bethesda',
    'bethesda launcher': 'bethesda',
    // Legacy/Indiegala
    'indiegala': 'indiegala',
    'indie gala': 'indiegala',
};

/**
 * Normalize a source name (from originalProviderName or other sources) to a provider ID
 * Uses alias matching for flexible source identification
 */
export function normalizeSourceName(sourceName: string): string {
    if (!sourceName) return 'unknown';
    
    const normalized = sourceName.toLowerCase().trim();
    
    // Direct lookup first (most reliable)
    if (SOURCE_NAME_ALIASES[normalized]) {
        return SOURCE_NAME_ALIASES[normalized];
    }
    
    // Word boundary match - check if source name contains alias as a complete word
    // This avoids false positives like 'ea' matching 'steam' or 'team'
    for (const [alias, providerId] of Object.entries(SOURCE_NAME_ALIASES)) {
        // Only do partial match if alias is longer than 2 chars to avoid false positives
        if (alias.length > 2) {
            // Use word boundary regex for precise matching
            const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
            if (wordBoundaryRegex.test(normalized)) {
                return providerId;
            }
        }
    }
    
    return 'unknown';
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mapping of normalized provider names to store link name patterns
 * Used to match links from Playnite's raw.links array
 */
export const PROVIDER_LINK_PATTERNS: Record<string, string[]> = {
    'steam': ['steam', 'store.steampowered.com'],
    'epic': ['epic', 'epicgames.com', 'epic games', 'launcher.store.epicgames.com'],
    'gog': ['gog', 'gog.com'],
    'ea': ['ea', 'ea.com', 'origin', 'origin.com'],
    'ubisoft': ['ubisoft', 'ubisoft.com', 'ubi.com', 'store.ubi.com', 'uplay'],
    'xbox': ['xbox', 'microsoft', 'microsoft.com', 'xbox.com'],
    'playstation': ['playstation', 'playstation.com', 'psn', 'store.playstation.com'],
    'amazon': ['amazon', 'amazon.com', 'gaming.amazon.com'],
    'itch': ['itch', 'itch.io'],
    'humble': ['humble', 'humblebundle.com'],
    'battlenet': ['battle.net', 'blizzard', 'battlenet', 'shop.battle.net'],
    'nintendo': ['nintendo', 'nintendo.com', 'eshop', 'my nintendo store', 'nintendo store', 'my nintendo'],
    'rockstar': ['rockstar', 'rockstargames.com', 'socialclub.rockstargames.com'],
    'bethesda': ['bethesda', 'bethesda.net'],
    'indiegala': ['indiegala'],
};

/**
 * Platform-specific store link patterns
 * Some providers have different stores for different platforms
 * (e.g., Nintendo has separate stores for 3DS/Wii U eShop vs Switch eShop)
 * Includes language-specific URL patterns where applicable
 */
export const PLATFORM_STORE_PATTERNS: Record<string, Record<string, string[]>> = {
    // Nintendo platforms have separate eShops
    'nintendo': {
        'switch': ['nintendo.com', 'nintendo.co.', 'nintendo switch', 'nintendo eshop', 'ec.nintendo.com'],
        '3ds': ['nintendo.com/3ds', 'nintendo 3ds', '3ds eshop'],
        'wii u': ['nintendo.com/wiiu', 'wii u eshop'],
    },
    // PlayStation platform-specific stores (unified but region-specific)
    'playstation': {
        'ps5': ['store.playstation.com', 'ps5'],
        'ps4': ['store.playstation.com', 'ps4'],
        'ps3': ['store.playstation.com', 'ps3'],
        'vita': ['store.playstation.com', 'vita'],
        'psp': ['store.playstation.com', 'psp'],
    },
    // Xbox platform-specific (region-specific)
    'xbox': {
        'xbox series x|s': ['microsoft.com', 'xbox.com', 'xbox store'],
        'xbox series x': ['microsoft.com', 'xbox.com'],
        'xbox series s': ['microsoft.com', 'xbox.com'],
        'xbox one': ['microsoft.com', 'xbox.com'],
        'xbox 360': ['marketplace.xbox.com'],
    },
};

/**
 * Known store URL patterns that verify a link actually points to a store
 * Used to validate "Website" or "Official Website" links
 * Includes language-specific patterns (de, fr, es, it, pt, jp, etc.)
 */
export const KNOWN_STORE_URL_PATTERNS: Record<string, string[]> = {
    steam: [
    'store.steampowered.com',
        ],
    epic: [
    'store.epicgames.com',
    'epicgames.com/store',
    'launcher.store.epicgames.com',
        ],
    gog: [
    'gog.com/game',
    'gog.com/en/game',
    'gog.com/de/game',
    'gog.com/fr/game',
        ],
    ea: [
    'ea.com/games',
    'ea.com/de-de/games',
    'ea.com/fr-fr/games',
    'origin.com/store',
        ],
    ubisoft: [
    'ubisoft.com/game',
    'store.ubi.com',
    'store.ubisoft.com',
        ],
    xbox: [
    'microsoft.com/store',
    'microsoft.com/en-us/store',
    'microsoft.com/de-de/store',
    'microsoft.com/fr-fr/store',
    'xbox.com/games',
    'xbox.com/en-us/games',
    'xbox.com/de-de/games',
        ],
    playstation: [
    'store.playstation.com',
        ],
    nintendo: [
    'nintendo.com/store',
    'nintendo.com/games',
    'nintendo.com/us/store',
    'nintendo.com/en-gb/Games',
    'nintendo.com/de-de/Spiele',
    'nintendo.co.uk/Games',
    'nintendo.de/Spiele',
    'nintendo.fr/Jeux',
    'nintendo.es/Juegos',
    'nintendo.it/Giochi',
    'nintendo.co.jp',
    'ec.nintendo.com',
        ],
    itch: [
    'itch.io',
        ],
    humble: [
    'humblebundle.com/store',
        ],
    battlenet: [
    'battle.net/shop',
    'shop.battle.net',
        ],
    rockstar: [
    'rockstargames.com/games',
    'socialclub.rockstargames.com',
        ],
    indiegala: [
    'indiegala.com/store',
        ],
};

const websitePatterns = ['website', 'official', 'store', 'buy', 'purchase', 'shop'];
const unifiedProviders = Object.values(KNOWN_STORE_URL_PATTERNS).flat() ?? []

/**
 * Link structure from Playnite's raw.links array
 */
export interface PlayniteLink {
    name: string;
    url: string;
}

/**
 * Extended raw data from Playnite
 */
export interface PlayniteRawData {
    added?: string;
    releaseDate?: string;
    playCount?: number;
    genres?: string[];
    tags?: string[];
    developers?: string[];
    publishers?: string[];
    description?: string;
    coverImage?: string;
    backgroundImage?: string;
    icon?: string;
    links?: PlayniteLink[];
    features?: string[];
    categories?: string[];
    series?: string;
    ageRatings?: string[];
    regions?: string[];
    communityScore?: number;
    criticScore?: number;
    userScore?: number;
    sortingName?: string;
    version?: string;
    completionStatus?: string;
    notes?: string;
    favorite?: boolean;
    manual?: string;
    modified?: string;
    recentActivity?: string;
}

/**
 * Extract store URL from Playnite's raw.links array based on provider and platform
 * 
 * The links array contains named URLs like:
 * - { name: "Steam", url: "https://store.steampowered.com/app/123" }
 * - { name: "GOG", url: "https://www.gog.com/game/some-game" }
 * - { name: "Website", url: "https://example.com" }
 * - { name: "Official Website", url: "https://game-publisher.com" }
 * 
 * This function uses a multi-pass approach:
 * 1. First, try to match platform-specific store patterns (e.g., 3DS eShop vs Switch eShop)
 * 2. Then, try to match provider patterns using normalized provider ID
 * 3. Then, try to match using the original provider name (for transparent aggregator pattern)
 * 4. Finally, check "Website" or "Official Website" links that actually point to stores
 * 
 * @param links - Array of links from Playnite raw data
 * @param normalizedProvider - The normalized provider name (e.g., 'steam', 'epic')
 * @param platform - Optional platform name (e.g., 'PC', 'Nintendo Switch', '3DS')
 * @param originalProviderName - Optional original provider name from Playnite (e.g., 'Epic Games', 'Ubisoft Connect')
 * @returns The store URL if found, undefined otherwise
 */
export function extractStoreUrlFromLinks(
    links: PlayniteLink[] | undefined,
    normalizedProvider: string,
    platform?: string,
    originalProviderName?: string
): string | undefined {
    if (!links || links.length === 0) {
        return undefined;
    }
    
    const normalizedPlatform = platform?.toLowerCase().trim();
    
    // If provider is unknown, try to resolve from original provider name
    let provider = normalizedProvider;
    if (provider === 'unknown' && originalProviderName) {
        provider = normalizeSourceName(originalProviderName);
    }
    
    // Pass 1: Check platform-specific patterns for this provider
    if (normalizedPlatform && PLATFORM_STORE_PATTERNS[provider]) {
        const platformPatterns = PLATFORM_STORE_PATTERNS[provider];
        
        // Find matching platform key
        for (const [platformKey, patterns] of Object.entries(platformPatterns)) {
            if (normalizedPlatform.includes(platformKey) || platformKey.includes(normalizedPlatform)) {
                // Try to find a link matching platform-specific patterns
                for (const link of links) {
                    const linkUrlLower = link.url.toLowerCase();
                    for (const pattern of patterns) {
                        if (linkUrlLower.includes(pattern)) {
                            return link.url;
                        }
                    }
                }
            }
        }
    }
    
    // Pass 2: Check general provider patterns using normalized provider ID
    const patterns = PROVIDER_LINK_PATTERNS[provider];
    if (patterns) {
        for (const link of links) {
            const linkNameLower = link.name.toLowerCase();
            const linkUrlLower = link.url.toLowerCase();
            
            for (const pattern of patterns) {
                if (linkNameLower.includes(pattern) || linkUrlLower.includes(pattern)) {
                    return link.url;
                }
            }
        }
    }

    if(KNOWN_STORE_URL_PATTERNS[provider]) {

        // Pass 3: If we have originalProviderName, try to match the link by name directly
        // Only match if provider name is specific enough (3+ chars) to avoid false positives
        if (originalProviderName && originalProviderName.length >= 3) {
            const providerNameLower = originalProviderName.toLowerCase();
            for (const link of links) {
                const linkNameLower = link.name.toLowerCase();
                // Use word boundary matching for partial matches to avoid false positives
                // Direct equality is always safe
                let isMatch = linkNameLower === providerNameLower;

                // Only do partial matching for longer names (4+ chars) to be safe
                if (!isMatch && providerNameLower.length >= 4) {
                    // Check if link name contains provider name as a word
                    const wordBoundaryRegex = new RegExp(`\\b${escapeRegex(providerNameLower)}\\b`, 'i');
                    isMatch = wordBoundaryRegex.test(linkNameLower);
                }

                if (isMatch) {
                    // Verify it's actually a store URL (not a random website)
                    const linkUrlLower = link.url.toLowerCase();
                    if (KNOWN_STORE_URL_PATTERNS[provider].some(storePattern => linkUrlLower.includes(storePattern))) {
                        return link.url;
                    }
                }
            }
        }

        // Pass 4: Check "Website" or "Official Website" links that point to known stores
        // This is a fallback for cases where the link name doesn't match but the URL is valid
        for (const link of links) {
            const linkNameLower = link.name.toLowerCase();

            // Only check links that look like website/store links
            if (websitePatterns.some(p => linkNameLower.includes(p))) {
                const linkUrlLower = link.url.toLowerCase();

                // ONLY return if the URL actually points to a known store for this provider
                if (KNOWN_STORE_URL_PATTERNS[provider].some(storePattern => linkUrlLower.includes(storePattern))) {
                    return link.url;
                }
            }
        }

        // Pass 5: Last resort - check all links for known store patterns
        // Sometimes store links have generic names like "Link" or "Homepage"
        for (const link of links) {
            const linkUrlLower = link.url.toLowerCase();
            if (KNOWN_STORE_URL_PATTERNS[provider].some(storePattern => linkUrlLower.includes(storePattern))) {
                return link.url;
            }
        }
    }
    
    // Last try: get any store url from known store patterns (for unknown providers)
    for(const link of links) {
        const linkUrlLower = link.url.toLowerCase();
        if(unifiedProviders.some(storePattern => linkUrlLower.includes(storePattern))) {
            return link.url;
        }
    }
    
    // Final fallback: return any Website/Official Website link
    // It's better to point to the official website than have no link at all
    // since the website will probably have further URLs to the shops we didn't find
    for (const link of links) {
        const linkNameLower = link.name.toLowerCase();
        if (websitePatterns.some(p => linkNameLower.includes(p))) {
            return link.url;
        }
    }
    
    return undefined;
}

/**
 * Extract extended metadata from Playnite's raw data
 * 
 * @param raw - The raw object from Playnite payload
 * @returns Extracted metadata fields
 */
export function extractMetadataFromRaw(raw: PlayniteRawData | undefined): {
    description?: string;
    genres?: string[];
    releaseDate?: string;
    developer?: string;
    publisher?: string;
    coverImageUrl?: string;
} {
    if (!raw) {
        return {};
    }
    
    return {
        description: raw.description || undefined,
        genres: raw.genres?.length ? raw.genres : undefined,
        releaseDate: raw.releaseDate || undefined,
        developer: raw.developers?.[0] || undefined,
        publisher: raw.publishers?.[0] || undefined,
        // Note: coverImage from Playnite is a local path, not a URL
        // We don't use it here - metadata providers should fill this
        coverImageUrl: undefined,
    };
}

/**
 * Normalize provider name from Playnite plugin GUID
 */
export function normalizeProviderName(pluginId: string): string {
    const lowerPluginId = pluginId.toLowerCase();
    return KNOWN_PROVIDERS[lowerPluginId] || 'unknown';
}
