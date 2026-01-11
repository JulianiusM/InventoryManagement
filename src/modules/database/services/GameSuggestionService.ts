/**
 * Game Suggestion Service
 * Provides random game suggestions based on user criteria
 */

import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {GameRelease} from '../entities/gameRelease/GameRelease';

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
 * Get a random game suggestion based on criteria
 * Returns null if no games match the criteria
 */
export async function getRandomGameSuggestion(criteria: SuggestionCriteria): Promise<GameTitle | null> {
    const query = AppDataSource.getRepository(GameTitle)
        .createQueryBuilder('title')
        .leftJoinAndSelect('title.releases', 'release')
        .where('title.owner_id = :ownerId', {ownerId: criteria.ownerId});
    
    // Filter by player count
    if (criteria.playerCount !== undefined && criteria.playerCount > 0) {
        const count = criteria.playerCount;
        query.andWhere(
            `(
                (title.overall_min_players IS NULL OR title.overall_min_players <= :count)
                AND (title.overall_max_players IS NULL OR title.overall_max_players >= :count)
            ) OR (
                title.overall_min_players IS NULL 
                AND title.overall_max_players IS NULL 
                AND title.supports_online = 0 
                AND title.supports_local = 0 
                AND title.supports_physical = 0 
                AND :count = 1
            )`,
            {count}
        );
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
    
    // Get all matching titles
    let titles = await query.getMany();
    
    // Filter by platforms (client-side since it requires checking releases)
    if (criteria.includePlatforms && criteria.includePlatforms.length > 0) {
        titles = titles.filter(t => 
            t.releases && t.releases.some(r => 
                criteria.includePlatforms!.includes(r.platform)
            )
        );
    }
    
    if (criteria.excludePlatforms && criteria.excludePlatforms.length > 0) {
        titles = titles.filter(t => 
            !t.releases || !t.releases.some(r => 
                criteria.excludePlatforms!.includes(r.platform)
            )
        );
    }
    
    // Return random title from matches
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
    const query = AppDataSource.getRepository(GameTitle)
        .createQueryBuilder('title')
        .leftJoinAndSelect('title.releases', 'release')
        .where('title.owner_id = :ownerId', {ownerId: criteria.ownerId});
    
    // Apply same filters as single suggestion
    if (criteria.playerCount !== undefined && criteria.playerCount > 0) {
        const playerCount = criteria.playerCount;
        query.andWhere(
            `(
                (title.overall_min_players IS NULL OR title.overall_min_players <= :playerCount)
                AND (title.overall_max_players IS NULL OR title.overall_max_players >= :playerCount)
            ) OR (
                title.overall_min_players IS NULL 
                AND title.overall_max_players IS NULL 
                AND title.supports_online = 0 
                AND title.supports_local = 0 
                AND title.supports_physical = 0 
                AND :playerCount = 1
            )`,
            {playerCount}
        );
    }
    
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
    
    if (criteria.gameTypes && criteria.gameTypes.length > 0) {
        query.andWhere('title.type IN (:...gameTypes)', {gameTypes: criteria.gameTypes});
    }
    
    let titles = await query.getMany();
    
    // Filter by platforms
    if (criteria.includePlatforms && criteria.includePlatforms.length > 0) {
        titles = titles.filter(t => 
            t.releases && t.releases.some(r => 
                criteria.includePlatforms!.includes(r.platform)
            )
        );
    }
    
    if (criteria.excludePlatforms && criteria.excludePlatforms.length > 0) {
        titles = titles.filter(t => 
            !t.releases || !t.releases.some(r => 
                criteria.excludePlatforms!.includes(r.platform)
            )
        );
    }
    
    // Shuffle and return requested count
    const shuffled = titles.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}
