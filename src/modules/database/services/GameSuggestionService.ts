/**
 * Game Suggestion Service
 * Provides random game suggestions based on user criteria
 */

import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {Brackets, SelectQueryBuilder} from 'typeorm';

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
 * Build a Brackets condition that checks if a mode-specific player count
 * supports the given player count, falling back to overall counts.
 */
function modePlayerCountBracket(
    modeFlag: string,
    modeMin: string,
    modeMax: string,
): Brackets {
    return new Brackets((qb) => {
        qb.where(`title.${modeFlag} = :trueVal`, {trueVal: true})
          .andWhere(new Brackets((inner) => {
              inner.where(new Brackets((specific) => {
                  specific.where(`title.${modeMin} IS NOT NULL`)
                      .andWhere(`title.${modeMax} IS NOT NULL`)
                      .andWhere(`title.${modeMin} <= :count`)
                      .andWhere(`title.${modeMax} >= :count`);
              })).orWhere(new Brackets((fallback) => {
                  fallback.where(`title.${modeMin} IS NULL`)
                      .andWhere(`title.${modeMax} IS NULL`)
                      .andWhere('title.overallMinPlayers IS NOT NULL')
                      .andWhere('title.overallMaxPlayers IS NOT NULL')
                      .andWhere('title.overallMinPlayers <= :count')
                      .andWhere('title.overallMaxPlayers >= :count');
              }));
          }));
    });
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
        query.andWhere(new Brackets((modeOr) => {
            if (criteria.selectedModes!.includes('online')) {
                modeOr.orWhere('title.supportsOnline = :trueVal', {trueVal: true});
            }
            if (criteria.selectedModes!.includes('couch')) {
                modeOr.orWhere('title.supportsLocalCouch = :trueVal', {trueVal: true});
            }
            if (criteria.selectedModes!.includes('lan')) {
                modeOr.orWhere('title.supportsLocalLAN = :trueVal', {trueVal: true});
            }
            if (criteria.selectedModes!.includes('physical')) {
                modeOr.orWhere('title.supportsPhysical = :trueVal', {trueVal: true});
            }
        }));
    }
    
    // Filter by player count
    if (criteria.playerCount !== undefined && criteria.playerCount > 0) {
        const count = criteria.playerCount;
        query.setParameter('count', count);
        
        if (criteria.selectedModes && criteria.selectedModes.length > 0) {
            // When modes selected: at least one selected mode must satisfy the player count
            query.andWhere(new Brackets((modeCountOr) => {
                if (criteria.selectedModes!.includes('online')) {
                    modeCountOr.orWhere(
                        modePlayerCountBracket('supportsOnline', 'onlineMinPlayers', 'onlineMaxPlayers')
                    );
                }
                if (criteria.selectedModes!.includes('couch')) {
                    modeCountOr.orWhere(
                        modePlayerCountBracket('supportsLocalCouch', 'couchMinPlayers', 'couchMaxPlayers')
                    );
                }
                if (criteria.selectedModes!.includes('lan')) {
                    modeCountOr.orWhere(
                        modePlayerCountBracket('supportsLocalLAN', 'lanMinPlayers', 'lanMaxPlayers')
                    );
                }
                if (criteria.selectedModes!.includes('physical')) {
                    modeCountOr.orWhere(
                        modePlayerCountBracket('supportsPhysical', 'physicalMinPlayers', 'physicalMaxPlayers')
                    );
                }
            }));
        } else {
            // No mode selected - use overall player count
            if (count === 1) {
                query.andWhere(new Brackets((overall) => {
                    overall.where(new Brackets((known) => {
                        known.where('title.overallMinPlayers IS NOT NULL')
                            .andWhere('title.overallMaxPlayers IS NOT NULL')
                            .andWhere('title.overallMinPlayers <= :count')
                            .andWhere('title.overallMaxPlayers >= :count');
                    })).orWhere(new Brackets((singleplayer) => {
                        singleplayer.where('title.overallMinPlayers IS NULL')
                            .andWhere('title.overallMaxPlayers IS NULL')
                            .andWhere('title.supportsOnline = :falseVal', {falseVal: false})
                            .andWhere('title.supportsLocalCouch = :falseVal')
                            .andWhere('title.supportsLocalLAN = :falseVal')
                            .andWhere('title.supportsPhysical = :falseVal');
                    }));
                }));
            } else {
                query.andWhere('title.overallMinPlayers IS NOT NULL')
                    .andWhere('title.overallMaxPlayers IS NOT NULL')
                    .andWhere('title.overallMinPlayers <= :count')
                    .andWhere('title.overallMaxPlayers >= :count');
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

