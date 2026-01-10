/**
 * Centralized Metadata Service
 * 
 * This service provides centralized metadata fetching and application logic.
 * All metadata operations should go through this service to ensure:
 * - DRY principle is applied (no duplicate metadata handling)
 * - Separation of concerns (controllers don't handle metadata logic directly)
 * - Consistent metadata application across all entry points
 * 
 * Used by:
 * - GameSyncService for automatic metadata enrichment during sync
 * - gameTitleController for manual metadata operations
 */

import {metadataProviderRegistry} from './MetadataProviderRegistry';
import {mergePlayerCounts, type GameMetadata, type MetadataSearchResult} from './MetadataProviderInterface';
import {normalizeDescription} from '../../lib/htmlUtils';
import * as gameTitleService from '../../database/services/GameTitleService';
import {GameTitle} from '../../database/entities/gameTitle/GameTitle';
import {GameType} from '../../../types/InventoryEnums';
import {ExternalGame} from '../connectors/ConnectorInterface';

// Minimum description length to consider as valid (not placeholder)
export const MIN_VALID_DESCRIPTION_LENGTH = 50;

/**
 * Result of a metadata fetch operation
 */
export interface MetadataFetchResult {
    updated: boolean;
    message: string;
    metadata?: GameMetadata;
    providerName?: string;
}

/**
 * Fetch metadata for a game title from providers
 * Uses appropriate metadata provider based on game type
 * 
 * Strategy:
 * 1. Get basic metadata from primary provider (Steam/RAWG/BGG based on game type)
 * 2. If multiplayer but missing player counts, enrich from providers with hasAccuratePlayerCounts
 * 3. Apply fallback for unknown player counts on multiplayer games
 * 
 * @param title The game title to fetch metadata for
 * @param searchQuery Optional search query (defaults to title name)
 * @param targetPlatform Optional platform for platform-aware store URL extraction
 * @param originalProviderName Optional provider name for transparent aggregator pattern
 * @returns Metadata fetch result with GameMetadata if found
 */
export async function fetchMetadata(
    title: GameTitle,
    searchQuery?: string,
    targetPlatform?: string,
    originalProviderName?: string
): Promise<MetadataFetchResult> {
    // Get providers based on game type
    const providers = metadataProviderRegistry.getByGameType(title.type);
    if (providers.length === 0) {
        return {updated: false, message: 'No metadata providers available for this game type'};
    }
    
    // Search query defaults to game name
    const query = searchQuery?.trim() || title.name;
    
    // Track what we found and from where
    let foundMetadata: GameMetadata | null = null;
    let primaryProviderName = '';
    
    // Step 1: Get basic metadata from primary providers
    for (const provider of providers) {
        try {
            // Search for the game
            const searchResults = await provider.searchGames(query, 5);
            if (searchResults.length === 0) continue;
            
            // Get full metadata for best match
            const metadata = await provider.getGameMetadata(searchResults[0].externalId);
            if (!metadata) continue;
            
            foundMetadata = metadata;
            primaryProviderName = provider.getManifest().name;
            break; // Found metadata, stop searching
        } catch (error) {
            console.warn(`Metadata fetch from ${provider.getManifest().id} failed:`, error);
            // Continue to next provider
        }
    }
    
    if (!foundMetadata) {
        return {updated: false, message: 'No metadata found from any provider'};
    }
    
    // Step 2: If game supports multiplayer but lacks specific player counts, enrich from player count providers
    const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
    const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                              foundMetadata.playerInfo?.localMaxPlayers !== undefined;
    
    if (hasMultiplayer && !hasSpecificCounts) {
        // Use capability-based lookup for player count enrichment
        const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
        for (const provider of playerCountProviders) {
            try {
                const providerName = provider.getManifest().name;
                console.log(`Enriching "${title.name}" with player counts from ${providerName}`);
                const results = await provider.searchGames(query, 1);
                if (results.length > 0) {
                    const playerMeta = await provider.getGameMetadata(results[0].externalId);
                    if (playerMeta?.playerInfo) {
                        // Merge player counts into metadata using utility
                        foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, playerMeta.playerInfo);
                        primaryProviderName += ` + ${providerName}`;
                        break; // Stop after first successful enrichment
                    }
                }
            } catch (error) {
                console.warn(`${provider.getManifest().name} enrichment failed:`, error);
                // Continue with next provider
            }
        }
    }
    
    return {
        updated: true,
        message: `Found metadata from ${primaryProviderName}`,
        metadata: foundMetadata,
        providerName: primaryProviderName,
    };
}

/**
 * Apply GameMetadata to a GameTitle entity
 * Centralizes the logic for updating title fields from metadata
 * 
 * @param titleId The ID of the title to update
 * @param title The current title entity (for comparison)
 * @param metadata The metadata to apply
 * @returns Object containing the fields that were updated
 */
export async function applyMetadataToTitle(
    titleId: string,
    title: GameTitle,
    metadata: GameMetadata
): Promise<{updates: Partial<GameTitle>; fieldsUpdated: string[]}> {
    const updates: Partial<GameTitle> = {};
    
    // Apply description normalization centrally
    if (metadata.shortDescription || metadata.description) {
        const rawDescription = metadata.shortDescription || metadata.description;
        const newDescription = normalizeDescription(rawDescription);
        // Update if no existing description OR if existing one is very short/placeholder
        if (newDescription && (!title.description || title.description.length < MIN_VALID_DESCRIPTION_LENGTH || title.description === title.name)) {
            updates.description = newDescription;
        }
    }
    
    // Update cover image if we found one and don't have one
    if (metadata.coverImageUrl && !title.coverImageUrl) {
        updates.coverImageUrl = metadata.coverImageUrl;
    }
    
    // Apply player info updates
    if (metadata.playerInfo) {
        applyPlayerInfoUpdates(updates, title, metadata.playerInfo);
    }
    
    const fieldsUpdated = Object.keys(updates);
    
    if (fieldsUpdated.length > 0) {
        await gameTitleService.updateGameTitle(titleId, updates);
    }
    
    return {updates, fieldsUpdated};
}

/**
 * Apply player info from metadata to updates object
 * Handles the complex logic of updating player modes and counts
 */
function applyPlayerInfoUpdates(
    updates: Partial<GameTitle>,
    title: GameTitle,
    playerInfo: NonNullable<GameMetadata['playerInfo']>
): void {
    // Overall player counts
    if (playerInfo.overallMinPlayers) {
        updates.overallMinPlayers = playerInfo.overallMinPlayers;
    }
    if (playerInfo.overallMaxPlayers) {
        updates.overallMaxPlayers = playerInfo.overallMaxPlayers;
    }
    
    // Handle online mode - only set player counts if supportsOnline is true
    if (playerInfo.supportsOnline !== undefined) {
        updates.supportsOnline = playerInfo.supportsOnline;
        // When setting supportsOnline to false, clear the player counts
        if (!playerInfo.supportsOnline) {
            updates.onlineMinPlayers = null;
            updates.onlineMaxPlayers = null;
        }
    }
    // Only set online player counts if supportsOnline is or will be true
    const willSupportOnline = updates.supportsOnline ?? title.supportsOnline;
    if (willSupportOnline) {
        if (playerInfo.onlineMaxPlayers !== undefined && playerInfo.onlineMaxPlayers !== null) {
            updates.onlineMaxPlayers = playerInfo.onlineMaxPlayers;
        }
    }
    
    // Handle local mode - only set player counts if supportsLocal is true
    if (playerInfo.supportsLocal !== undefined) {
        updates.supportsLocal = playerInfo.supportsLocal;
        if (!playerInfo.supportsLocal) {
            updates.localMinPlayers = null;
            updates.localMaxPlayers = null;
        }
    }
    const willSupportLocal = updates.supportsLocal ?? title.supportsLocal;
    if (willSupportLocal) {
        if (playerInfo.localMaxPlayers !== undefined && playerInfo.localMaxPlayers !== null) {
            updates.localMaxPlayers = playerInfo.localMaxPlayers;
        }
    }
    
    // Handle physical mode
    if (playerInfo.supportsPhysical !== undefined) {
        updates.supportsPhysical = playerInfo.supportsPhysical;
        if (!playerInfo.supportsPhysical) {
            updates.physicalMinPlayers = null;
            updates.physicalMaxPlayers = null;
        }
    }
    const willSupportPhysical = updates.supportsPhysical ?? title.supportsPhysical;
    if (willSupportPhysical) {
        if (playerInfo.physicalMaxPlayers !== undefined && playerInfo.physicalMaxPlayers !== null) {
            updates.physicalMaxPlayers = playerInfo.physicalMaxPlayers;
        }
    }
}

/**
 * Enrich ExternalGame with metadata from providers
 * Centralized enrichment used during sync pipeline
 * 
 * IMPORTANT: This function should NOT set supportsPhysical for video games,
 * only for board games. Video games from Wikidata should be filtered out.
 * 
 * @param game The external game to enrich
 * @param metadata The metadata from a provider
 * @returns Enriched game with metadata applied
 */
export function enrichGameWithMetadata(game: ExternalGame, metadata: GameMetadata): ExternalGame {
    const enriched: ExternalGame = {...game};
    
    // Only override if not already set by connector
    // Apply normalizeDescription to ensure clean descriptions regardless of source
    if (enriched.description === undefined && metadata.description) {
        enriched.description = normalizeDescription(metadata.description);
    }
    
    if (enriched.releaseDate === undefined && metadata.releaseDate) {
        enriched.releaseDate = metadata.releaseDate;
    }
    
    if (enriched.developer === undefined && metadata.developers?.[0]) {
        enriched.developer = metadata.developers[0];
    }
    
    if (enriched.publisher === undefined && metadata.publishers?.[0]) {
        enriched.publisher = metadata.publishers[0];
    }
    
    if (enriched.genres === undefined && metadata.genres) {
        enriched.genres = metadata.genres;
    }
    
    // Enrich store URL from metadata provider if not already set
    if (enriched.storeUrl === undefined && metadata.storeUrl) {
        enriched.storeUrl = metadata.storeUrl;
    }
    
    // Enrich cover image URL from metadata provider if not already set
    if (enriched.coverImageUrl === undefined && metadata.coverImageUrl) {
        enriched.coverImageUrl = metadata.coverImageUrl;
    }
    
    // Enrich player info from metadata provider
    // IMPORTANT: For video games, we should NOT use supportsPhysical from providers like Wikidata
    // Video games should default to supportsPhysical: false
    if (metadata.playerInfo) {
        if (enriched.overallMinPlayers === undefined) {
            enriched.overallMinPlayers = metadata.playerInfo.overallMinPlayers;
        }
        if (enriched.overallMaxPlayers === undefined) {
            enriched.overallMaxPlayers = metadata.playerInfo.overallMaxPlayers;
        }
        if (enriched.supportsOnline === undefined) {
            enriched.supportsOnline = metadata.playerInfo.supportsOnline;
        }
        if (enriched.supportsLocal === undefined) {
            enriched.supportsLocal = metadata.playerInfo.supportsLocal;
        }
        if (enriched.onlineMaxPlayers === undefined) {
            enriched.onlineMaxPlayers = metadata.playerInfo.onlineMaxPlayers;
        }
        if (enriched.localMaxPlayers === undefined) {
            enriched.localMaxPlayers = metadata.playerInfo.localMaxPlayers;
        }
        // Note: supportsPhysical is intentionally NOT enriched from metadata
        // Video games should not be marked as physical games
    }
    
    return enriched;
}

/**
 * Search for metadata options from all applicable providers
 * Returns a deduplicated, sorted list of potential matches
 * 
 * @param title The game title to search for
 * @param searchQuery Optional search query (defaults to title name)
 * @returns List of metadata search results
 */
export async function searchMetadataOptions(
    title: GameTitle,
    searchQuery?: string
): Promise<MetadataSearchResult[]> {
    // Get providers based on game type
    const providers = metadataProviderRegistry.getByGameType(title.type);
    if (providers.length === 0) {
        return [];
    }
    
    // Search query defaults to game name
    const query = searchQuery?.trim() || title.name;
    
    // Collect all search results from all providers
    const allResults: MetadataSearchResult[] = [];
    
    for (const provider of providers) {
        try {
            const results = await provider.searchGames(query, 10);
            allResults.push(...results);
        } catch (error) {
            console.warn(`Metadata search from ${provider.getManifest().id} failed:`, error);
        }
    }
    
    // Deduplicate by name (keep first occurrence of each unique name)
    const seenNames = new Set<string>();
    const uniqueResults = allResults.filter(r => {
        const key = r.name.toLowerCase().trim();
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
    });
    
    // Sort by relevance: exact match first, then prefix match, then others
    const normalizedQuery = query.toLowerCase().trim();
    uniqueResults.sort((a, b) => {
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
    
    return uniqueResults.slice(0, 15);
}

/**
 * Fetch metadata from a specific provider and external ID
 * Used when user selects a specific search result
 * 
 * @param providerId The provider ID
 * @param externalId The external game ID on that provider
 * @returns Metadata fetch result
 */
export async function fetchMetadataFromProvider(
    providerId: string,
    externalId: string
): Promise<MetadataFetchResult> {
    // Get the specific provider
    const provider = metadataProviderRegistry.getById(providerId);
    if (!provider) {
        return {updated: false, message: `Provider '${providerId}' not found`};
    }
    
    const primaryProviderName = provider.getManifest().name;
    
    // Fetch full metadata
    let foundMetadata: GameMetadata | null = null;
    
    try {
        foundMetadata = await provider.getGameMetadata(externalId);
    } catch (error) {
        console.warn(`Metadata fetch from ${providerId} failed:`, error);
        return {updated: false, message: `Failed to fetch metadata from ${primaryProviderName}`};
    }
    
    if (!foundMetadata) {
        return {updated: false, message: `No metadata found for ID ${externalId}`};
    }
    
    // Enrich with player count providers if needed
    const hasMultiplayer = foundMetadata.playerInfo?.supportsOnline || foundMetadata.playerInfo?.supportsLocal;
    const hasSpecificCounts = foundMetadata.playerInfo?.onlineMaxPlayers !== undefined || 
                              foundMetadata.playerInfo?.localMaxPlayers !== undefined;
    
    let enrichedProviderName = primaryProviderName;
    
    if (hasMultiplayer && !hasSpecificCounts) {
        // Use capability-based lookup for player count enrichment
        const playerCountProviders = metadataProviderRegistry.getAllByCapability('hasAccuratePlayerCounts');
        for (const pcProvider of playerCountProviders) {
            try {
                const results = await pcProvider.searchGames(foundMetadata.name, 1);
                if (results.length > 0) {
                    const playerMeta = await pcProvider.getGameMetadata(results[0].externalId);
                    if (playerMeta?.playerInfo) {
                        foundMetadata.playerInfo = mergePlayerCounts(foundMetadata.playerInfo, playerMeta.playerInfo);
                        enrichedProviderName += ` + ${pcProvider.getManifest().name}`;
                        break; // Stop after first successful enrichment
                    }
                }
            } catch (error) {
                console.warn(`${pcProvider.getManifest().name} enrichment failed:`, error);
                // Continue with next provider
            }
        }
    }
    
    return {
        updated: true,
        message: `Found metadata from ${enrichedProviderName}`,
        metadata: foundMetadata,
        providerName: enrichedProviderName,
    };
}
