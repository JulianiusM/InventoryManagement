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
 * Mapping of normalized provider names to store link name patterns
 * Used to match links from Playnite's raw.links array
 */
export const PROVIDER_LINK_PATTERNS: Record<string, string[]> = {
    'steam': ['steam', 'store.steampowered.com'],
    'epic': ['epic', 'epicgames.com', 'epic games'],
    'gog': ['gog', 'gog.com'],
    'ea': ['ea', 'ea.com', 'origin'],
    'origin': ['origin', 'ea.com'],
    'ubisoft': ['ubisoft', 'ubisoft.com', 'ubi.com'],
    'xbox': ['xbox', 'microsoft', 'microsoft.com'],
    'playstation': ['playstation', 'playstation.com', 'psn'],
    'amazon': ['amazon', 'amazon.com'],
    'itch': ['itch', 'itch.io'],
    'humble': ['humble', 'humblebundle.com'],
    'battlenet': ['battle.net', 'blizzard', 'battlenet'],
};

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
 * Extract store URL from Playnite's raw.links array based on provider
 * 
 * The links array contains named URLs like:
 * - { name: "Steam", url: "https://store.steampowered.com/app/123" }
 * - { name: "GOG", url: "https://www.gog.com/game/some-game" }
 * 
 * This function matches the normalized provider to find the appropriate store link.
 * 
 * @param links - Array of links from Playnite raw data
 * @param normalizedProvider - The normalized provider name (e.g., 'steam', 'epic')
 * @returns The store URL if found, undefined otherwise
 */
export function extractStoreUrlFromLinks(
    links: PlayniteLink[] | undefined,
    normalizedProvider: string
): string | undefined {
    if (!links || links.length === 0) {
        return undefined;
    }
    
    const patterns = PROVIDER_LINK_PATTERNS[normalizedProvider];
    if (!patterns) {
        return undefined;
    }
    
    // Find a link that matches the provider patterns
    for (const link of links) {
        const linkNameLower = link.name.toLowerCase();
        const linkUrlLower = link.url.toLowerCase();
        
        for (const pattern of patterns) {
            if (linkNameLower.includes(pattern) || linkUrlLower.includes(pattern)) {
                return link.url;
            }
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
