/**
 * Game Suggestion Service
 * Provides random game suggestions based on user criteria
 */

import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {SelectQueryBuilder} from 'typeorm';

export interface SuggestionCriteria {
    playerCount?: number;
    includePlatforms?: string[];
    excludePlatforms?: string[];
    
    // Mode selection - OR logic: game must support at least one selected mode
    // Empty/undefined = no mode filter (any game)
    selectedModes?: ('online' | 'couch' | 'lan' | 'physical')[];
    
    gameTypes?: string[];
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
    // Filter by game modes (OR logic: game must support at least one selected mode)
    if (criteria.selectedModes && criteria.selectedModes.length > 0) {
        const modeConditions: string[] = [];
        
        if (criteria.selectedModes.includes('online')) {
            modeConditions.push('title.supports_online = 1');
        }
        if (criteria.selectedModes.includes('couch')) {
            modeConditions.push('title.supports_local_couch = 1');
        }
        if (criteria.selectedModes.includes('lan')) {
            modeConditions.push('title.supports_local_lan = 1');
        }
        if (criteria.selectedModes.includes('physical')) {
            modeConditions.push('title.supports_physical = 1');
        }
        
        query.andWhere(`(${modeConditions.join(' OR ')})`);
    }
    
    // Filter by player count
    if (criteria.playerCount !== undefined && criteria.playerCount > 0) {
        const count = criteria.playerCount;
        
        if (criteria.selectedModes && criteria.selectedModes.length > 0) {
            // When modes selected: check mode-specific player counts for selected modes
            const modeCountConditions: string[] = [];
            
            if (criteria.selectedModes.includes('online')) {
                modeCountConditions.push(
                    `(title.supports_online = 1 AND (
                        (title.online_min_players IS NOT NULL AND title.online_max_players IS NOT NULL 
                         AND title.online_min_players <= :count AND title.online_max_players >= :count)
                        OR (title.online_min_players IS NULL AND title.online_max_players IS NULL 
                            AND title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                            AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                    ))`
                );
            }
            
            if (criteria.selectedModes.includes('couch') || criteria.selectedModes.includes('lan')) {
                modeCountConditions.push(
                    `((title.supports_local_couch = 1 OR title.supports_local_lan = 1) AND (
                        (title.local_min_players IS NOT NULL AND title.local_max_players IS NOT NULL 
                         AND title.local_min_players <= :count AND title.local_max_players >= :count)
                        OR (title.local_min_players IS NULL AND title.local_max_players IS NULL 
                            AND title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                            AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                    ))`
                );
            }
            
            if (criteria.selectedModes.includes('physical')) {
                modeCountConditions.push(
                    `(title.supports_physical = 1 AND (
                        (title.physical_min_players IS NOT NULL AND title.physical_max_players IS NOT NULL 
                         AND title.physical_min_players <= :count AND title.physical_max_players >= :count)
                        OR (title.physical_min_players IS NULL AND title.physical_max_players IS NULL 
                            AND title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                            AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                    ))`
                );
            }
            
            if (modeCountConditions.length > 0) {
                // At least one selected mode must satisfy the player count
                query.andWhere(`(${modeCountConditions.join(' OR ')})`, {count});
            }
        } else {
            // No mode selected - use overall player count
            if (count === 1) {
                query.andWhere(
                    `(
                        (title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                         AND title.overall_min_players <= :count AND title.overall_max_players >= :count)
                        OR (title.overall_min_players IS NULL AND title.overall_max_players IS NULL 
                            AND title.supports_online = 0 AND title.supports_local_couch = 0 
                            AND title.supports_local_lan = 0 AND title.supports_physical = 0)
                    )`,
                    {count}
                );
            } else {
                query.andWhere(
                    `(title.overall_min_players IS NOT NULL AND title.overall_max_players IS NOT NULL
                     AND title.overall_min_players <= :count AND title.overall_max_players >= :count)`,
                    {count}
                );
            }
        }
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

