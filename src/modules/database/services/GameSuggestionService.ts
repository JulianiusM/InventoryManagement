/**
 * Game Suggestion Service
 * Provides random game suggestions based on user criteria
 */

import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {SelectQueryBuilder} from 'typeorm';

export interface SuggestionCriteria {
    // Player count filter
    playerCount?: number;
    
    // Platform filters (whitelist/blacklist)
    includePlatforms?: string[];  // Empty = all platforms
    excludePlatforms?: string[];  // Platforms to exclude
    
    // Game mode filters (whitelist/blacklist)
    includeOnline?: boolean;      // null = don't care, true = must have, false = must not have
    includeLocal?: boolean;
    includePhysical?: boolean;
    
    // Game type filter
    gameTypes?: string[];  // Empty = all types
    
    // Ownership filter
    ownerId: number;
}

/**
 * Apply criteria filters to a query builder
 * Helper function to avoid duplication between single and multiple suggestions
 */
function applyFiltersToQuery(
    query: SelectQueryBuilder<GameTitle>,
    criteria: SuggestionCriteria
): void {
    // Filter by player count
    if (criteria.playerCount !== undefined && criteria.playerCount > 0) {
        const count = criteria.playerCount;
        
        // Build player count filter based on required modes
        const requiresOnline = criteria.includeOnline === true;
        const requiresLocal = criteria.includeLocal === true;
        const requiresPhysical = criteria.includePhysical === true;
        
        if (requiresOnline || requiresLocal || requiresPhysical) {
            // When specific modes are required, check mode-specific player counts
            const modeConditions: string[] = [];
            
            if (requiresOnline) {
                // For online mode: check online-specific count, fall back to overall if not specified
                modeConditions.push(
                    `(title.supports_online = 1 AND (
                        (title.online_min_players IS NOT NULL AND title.online_max_players IS NOT NULL 
                         AND title.online_min_players <= :count AND title.online_max_players >= :count)
                        OR (title.online_min_players IS NULL AND title.online_max_players IS NULL 
                            AND title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                            AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                    ))`
                );
            }
            
            if (requiresLocal) {
                // For local mode: check local-specific count, fall back to overall if not specified
                modeConditions.push(
                    `(title.supports_local = 1 AND (
                        (title.local_min_players IS NOT NULL AND title.local_max_players IS NOT NULL 
                         AND title.local_min_players <= :count AND title.local_max_players >= :count)
                        OR (title.local_min_players IS NULL AND title.local_max_players IS NULL 
                            AND title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                            AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                    ))`
                );
            }
            
            if (requiresPhysical) {
                // For physical mode: check physical-specific count, fall back to overall if not specified
                modeConditions.push(
                    `(title.supports_physical = 1 AND (
                        (title.physical_min_players IS NOT NULL AND title.physical_max_players IS NOT NULL 
                         AND title.physical_min_players <= :count AND title.physical_max_players >= :count)
                        OR (title.physical_min_players IS NULL AND title.physical_max_players IS NULL 
                            AND title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                            AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                    ))`
                );
            }
            
            // All required modes must satisfy the player count
            query.andWhere(`(${modeConditions.join(' AND ')})`, {count});
        } else {
            // No specific mode required - use overall player count with special handling for unknown counts
            if (count === 1) {
                // For player count 1: include games with unknown counts (implied singleplayer)
                query.andWhere(
                    `(
                        (title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                         AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                        OR (title.overall_min_players IS NULL AND title.overall_max_players IS NULL 
                            AND title.supports_online = 0 AND title.supports_local = 0 AND title.supports_physical = 0)
                    )`,
                    {count}
                );
            } else {
                // For player count > 1: only include games with known counts in range
                query.andWhere(
                    `(title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                     AND title.overall_min_players <= :count AND title.overall_max_players >= :count)`,
                    {count}
                );
            }
        }
    }
    
    // Filter by game modes
    if (criteria.includeOnline === true) {
        query.andWhere('title.supports_online = 1');
    } else if (criteria.includeOnline === false) {
        query.andWhere('title.supports_online = 0');
    }
    
    if (criteria.includeLocal === true) {
        query.andWhere('title.supports_local = 1');
    } else if (criteria.includeLocal === false) {
        query.andWhere('title.supports_local = 0');
    }
    
    if (criteria.includePhysical === true) {
        query.andWhere('title.supports_physical = 1');
    } else if (criteria.includePhysical === false) {
        query.andWhere('title.supports_physical = 0');
    }
    
    // Filter by game types
    if (criteria.gameTypes && criteria.gameTypes.length > 0) {
        query.andWhere('title.type IN (:...gameTypes)', {gameTypes: criteria.gameTypes});
    }
}

/**
 * Apply platform filters (client-side, requires checking releases)
 */
function applyPlatformFilters(
    titles: GameTitle[],
    criteria: SuggestionCriteria
): GameTitle[] {
    let filtered = titles;
    
    if (criteria.includePlatforms && criteria.includePlatforms.length > 0) {
        filtered = filtered.filter(t => 
            t.releases && t.releases.some(r => 
                criteria.includePlatforms!.includes(r.platform)
            )
        );
    }
    
    if (criteria.excludePlatforms && criteria.excludePlatforms.length > 0) {
        filtered = filtered.filter(t => 
            !t.releases || !t.releases.some(r => 
                criteria.excludePlatforms!.includes(r.platform)
            )
        );
    }
    
    return filtered;
}

/**
 * Get all matching game titles based on criteria
 */
async function getMatchingTitles(criteria: SuggestionCriteria): Promise<GameTitle[]> {
    const query = AppDataSource.getRepository(GameTitle)
        .createQueryBuilder('title')
        .leftJoinAndSelect('title.releases', 'release')
        .where('title.owner_id = :ownerId', {ownerId: criteria.ownerId});
    
    applyFiltersToQuery(query, criteria);
    
    const titles = await query.getMany();
    return applyPlatformFilters(titles, criteria);
}

/**
 * Get a random game suggestion based on criteria
 * Returns null if no games match the criteria
 */
export async function getRandomGameSuggestion(criteria: SuggestionCriteria): Promise<GameTitle | null> {
    const titles = await getMatchingTitles(criteria);
    
    if (titles.length === 0) {
        return null;
    }
    
    const randomIndex = Math.floor(Math.random() * titles.length);
    return titles[randomIndex];
}

/**
 * Get multiple random game suggestions (without duplicates)
 */
export async function getRandomGameSuggestions(
    criteria: SuggestionCriteria, 
    count: number = 3
): Promise<GameTitle[]> {
    const titles = await getMatchingTitles(criteria);
    
    // Shuffle array using Fisher-Yates algorithm and return requested count
    for (let i = titles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [titles[i], titles[j]] = [titles[j], titles[i]];
    }
    return titles.slice(0, Math.min(count, titles.length));
}

