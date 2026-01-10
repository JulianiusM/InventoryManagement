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
 * Store URL templates for PC game providers
 * Steam URLs work reliably with AppID. Others require slugs or different ID formats.
 * 
 * For providers that can't use IDs directly, we provide launcher URLs instead.
 */
export const STORE_URL_TEMPLATES: Record<string, string | null> = {
    // Steam - uses numeric AppID (reliable)
    'steam': 'https://store.steampowered.com/app/{gameId}',
    
    // Epic - uses slugs, not IDs. Can't generate reliable URLs from IDs alone.
    // The Playnite agent should provide the storeUrl directly.
    'epic': null,
    
    // GOG - uses slugs. Can't generate reliable URLs from IDs alone.
    'gog': null,
    
    // EA App (formerly Origin)
    'ea': null,
    'origin': null,
    
    // Ubisoft Connect
    'ubisoft': null,
    
    // Xbox (Windows Store) - uses product IDs but format varies
    'xbox': null,
    
    // PlayStation - PC app doesn't have web store
    'playstation': null,
    
    // Amazon Games
    'amazon': null,
    
    // itch.io - uses slugs
    'itch': null,
    
    // Humble Bundle
    'humble': null,
    
    // Battle.net - uses game codes
    'battlenet': null,
};

/**
 * Platform store URL templates for console games
 * These are for games on specific platforms, not aggregators
 */
export const PLATFORM_STORE_TEMPLATES: Record<string, {template: string; idParam: string} | null> = {
    // PlayStation - uses CUSA IDs but format varies by region
    'PlayStation 5': null,
    'PlayStation 4': null,
    'PlayStation 3': null,
    'PlayStation Vita': null,
    
    // Xbox - Microsoft Store
    'Xbox Series X|S': null,
    'Xbox One': null,
    'Xbox 360': null,
    
    // Nintendo - uses NSUIDs but no direct linking
    'Nintendo Switch': null,
    'Nintendo 3DS': null,
    'Nintendo Wii U': null,
    
    // PC - handled by provider, not platform
    'PC': null,
    
    // Mobile
    'Mobile': null,
};

/**
 * Get the appropriate store URL for a game based on its provider and platform
 * 
 * Strategy:
 * 1. If explicit storeUrl is provided, use it
 * 2. For PC platform, try to generate from provider template
 * 3. For console platforms, platform stores can't be reliably linked
 * 
 * @param options - Store URL generation options
 * @returns Generated store URL or undefined
 */
export function getStoreUrl(options: {
    storeUrl?: string;
    platform?: string;
    provider?: string;
    gameId?: string;
}): string | undefined {
    // Priority 1: Explicit store URL from the source
    if (options.storeUrl?.trim()) {
        return options.storeUrl.trim();
    }
    
    // Priority 2: For PC platform, try provider-specific template
    if (options.platform === 'PC' && options.provider && options.gameId) {
        return generateStoreUrl(options.provider, options.gameId);
    }
    
    // Can't reliably generate URLs for console platforms
    return undefined;
}

/**
 * Normalize provider name from Playnite plugin GUID
 */
export function normalizeProviderName(pluginId: string): string {
    const lowerPluginId = pluginId.toLowerCase();
    return KNOWN_PROVIDERS[lowerPluginId] || 'unknown';
}

/**
 * Generate store URL for a game based on its original provider
 */
export function generateStoreUrl(normalizedProvider: string, originalGameId: string | undefined): string | undefined {
    if (!originalGameId) {
        return undefined;
    }
    
    const template = STORE_URL_TEMPLATES[normalizedProvider];
    if (!template) {
        return undefined;
    }
    
    return template.replace('{gameId}', originalGameId);
}
