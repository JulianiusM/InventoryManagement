/**
 * Game Suggestion Service
 * Provides random game suggestions based on user criteria
 */

import {AppDataSource} from '../dataSource';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {Brackets, SelectQueryBuilder} from 'typeorm';

export type GameMode = 'online' | 'couch' | 'lan' | 'physical';

export interface ModeWeight {
    mode: GameMode;
    weight: number; // 0-100, percentage
}

export interface SuggestionCriteria {
    playerCount?: number;
    includePlatforms?: string[];
    excludePlatforms?: string[];
    
    // Mode selection - OR logic: game must support at least one selected mode
    // Empty/undefined = no mode filter (any game)
    selectedModes?: GameMode[];
    
    // Optional: weight distribution per mode (must sum to 100)
    // If not provided, uniform distribution across selected modes
    modeWeights?: ModeWeight[];
    
    gameTypes?: string[];
    ownerId: number;
}

/** Map a GameMode to its entity column name for the supports flag */
const MODE_SUPPORT_COLUMN: Record<GameMode, string> = {
    online: 'supportsOnline',
    couch: 'supportsLocalCouch',
    lan: 'supportsLocalLAN',
    physical: 'supportsPhysical',
};

/** Map a GameMode to its entity column names for min/max player counts */
const MODE_PLAYER_COLUMNS: Record<GameMode, {min: string; max: string}> = {
    online: {min: 'onlineMinPlayers', max: 'onlineMaxPlayers'},
    couch: {min: 'couchMinPlayers', max: 'couchMaxPlayers'},
    lan: {min: 'lanMinPlayers', max: 'lanMaxPlayers'},
    physical: {min: 'physicalMinPlayers', max: 'physicalMaxPlayers'},
};

/**
 * Get the database-specific random ordering expression.
 * MariaDB and MySQL both use RAND(); could be extended for other DB types.
 */
function getRandomOrderExpression(): string {
    const dbType = AppDataSource.options.type;
    switch (dbType) {
        case 'postgres':
            return 'RANDOM()';
        default:
            // MariaDB, MySQL
            return 'RAND()';
    }
}

/**
 * Build a WHERE condition string for a single game mode.
 *
 * When `withPlayerCount` is false, just checks the mode support flag.
 * When `withPlayerCount` is true, additionally checks the mode-specific
 * player count with smart fallback:
 *   - Both mode min & max set → use mode counts only
 *   - Only mode max set → use mode max for upper bound, overall min for lower
 *   - Only mode min set → use mode min for lower bound, overall max for upper
 *   - Both null → full fallback to overall counts
 *
 * This prevents over-matching (e.g. couch max=4 but overall max=8 would
 * wrongly match a request for 6 players if we fell back entirely to overall).
 *
 * Uses parameterised `:count` (set on the query builder elsewhere).
 * Column names come from our own constant lookup tables — no user input.
 */
function modeCondition(mode: GameMode, withPlayerCount: boolean): string {
    const flag = MODE_SUPPORT_COLUMN[mode];
    if (!withPlayerCount) {
        return `title.${flag} = 1`;
    }
    const {min, max} = MODE_PLAYER_COLUMNS[mode];
    return (
        `(title.${flag} = 1 AND (` +
            // Case 1: both mode-specific counts available — use them
            `(title.${min} IS NOT NULL AND title.${max} IS NOT NULL ` +
                `AND title.${min} <= :count AND title.${max} >= :count)` +
            ` OR ` +
            // Case 2: only mode max set — bound upper by mode, lower by overall
            `(title.${min} IS NULL AND title.${max} IS NOT NULL ` +
                `AND title.${max} >= :count ` +
                `AND title.overallMinPlayers IS NOT NULL AND title.overallMinPlayers <= :count)` +
            ` OR ` +
            // Case 3: only mode min set — bound lower by mode, upper by overall
            `(title.${min} IS NOT NULL AND title.${max} IS NULL ` +
                `AND title.${min} <= :count ` +
                `AND title.overallMaxPlayers IS NOT NULL AND title.overallMaxPlayers >= :count)` +
            ` OR ` +
            // Case 4: both null — full fallback to overall
            `(title.${min} IS NULL AND title.${max} IS NULL ` +
                `AND title.overallMinPlayers IS NOT NULL AND title.overallMaxPlayers IS NOT NULL ` +
                `AND title.overallMinPlayers <= :count AND title.overallMaxPlayers >= :count)` +
        `))`
    );
}

/**
 * Create a base query builder with owner, game-type, and player-count filters
 * that are independent of the mode selection.
 */
function createBaseQuery(criteria: SuggestionCriteria): SelectQueryBuilder<GameTitle> {
    const query = AppDataSource.getRepository(GameTitle)
        .createQueryBuilder('title')
        .leftJoinAndSelect('title.releases', 'release')
        .where('title.owner_id = :ownerId', {ownerId: criteria.ownerId});

    // Filter by game types
    if (criteria.gameTypes && criteria.gameTypes.length > 0) {
        query.andWhere('title.type IN (:...gameTypes)', {gameTypes: criteria.gameTypes});
    }

    // Set :count parameter if a player count is specified (used by mode conditions)
    if (criteria.playerCount !== undefined && criteria.playerCount > 0) {
        query.setParameter('count', criteria.playerCount);
    }

    return query;
}

/**
 * Apply mode and player-count filters to the query.
 *
 * Logic:
 *  - No modes selected + no player count  → no extra filter
 *  - No modes selected + player count     → overall player count filter
 *  - Modes selected  + no player count    → mode support OR filter
 *  - Modes selected  + player count       → combined (support AND count) OR per mode
 */
function applyModeAndCountFilters(
    query: SelectQueryBuilder<GameTitle>,
    criteria: SuggestionCriteria,
    singleMode?: GameMode,
): void {
    const hasPlayerCount = criteria.playerCount !== undefined && criteria.playerCount > 0;
    const modes = singleMode ? [singleMode] : (criteria.selectedModes ?? []);

    if (modes.length > 0) {
        // One Brackets with OR across modes; each branch combines support + count
        query.andWhere(new Brackets((modeOr) => {
            for (const m of modes) {
                modeOr.orWhere(modeCondition(m, hasPlayerCount));
            }
        }));
    } else if (hasPlayerCount) {
        // No modes selected — filter by overall player count
        if (criteria.playerCount === 1) {
            query.andWhere(new Brackets((overall) => {
                overall.where(
                    '(title.overallMinPlayers IS NOT NULL AND title.overallMaxPlayers IS NOT NULL ' +
                    'AND title.overallMinPlayers <= :count AND title.overallMaxPlayers >= :count)'
                ).orWhere(
                    '(title.overallMinPlayers IS NULL AND title.overallMaxPlayers IS NULL ' +
                    'AND title.supportsOnline = 0 AND title.supportsLocalCouch = 0 ' +
                    'AND title.supportsLocalLAN = 0 AND title.supportsPhysical = 0)'
                );
            }));
        } else {
            query.andWhere('title.overallMinPlayers IS NOT NULL')
                .andWhere('title.overallMaxPlayers IS NOT NULL')
                .andWhere('title.overallMinPlayers <= :count')
                .andWhere('title.overallMaxPlayers >= :count');
        }
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
 * Pick a random element from an array.  Returns undefined for empty arrays.
 */
function pickRandom<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get all matching game titles for a single mode (or all modes with OR logic).
 */
async function getTitlesForMode(
    criteria: SuggestionCriteria,
    mode?: GameMode,
): Promise<GameTitle[]> {
    const query = createBaseQuery(criteria);
    applyModeAndCountFilters(query, criteria, mode);

    // Randomize at the database level for reliable randomness
    query.orderBy(getRandomOrderExpression());

    const titles = await query.getMany();
    return applyPlatformFilters(titles, criteria);
}

/**
 * Normalize weights so they sum to 100, distributing evenly if none provided.
 */
function normalizeWeights(
    selectedModes: GameMode[],
    modeWeights?: ModeWeight[],
): ModeWeight[] {
    if (!modeWeights || modeWeights.length === 0) {
        // Uniform distribution — last mode absorbs any rounding remainder
        const w = Math.floor(100 / selectedModes.length);
        return selectedModes.map((mode, i) => ({
            mode,
            weight: i === selectedModes.length - 1 ? 100 - w * (selectedModes.length - 1) : w,
        }));
    }

    // Only keep weights for modes that are actually selected
    const filtered = modeWeights.filter(mw => selectedModes.includes(mw.mode));
    const total = filtered.reduce((s, mw) => s + mw.weight, 0);

    if (total <= 0) {
        return normalizeWeights(selectedModes);
    }

    // Rescale to sum to 100
    return filtered.map(mw => ({
        mode: mw.mode,
        weight: Math.round((mw.weight / total) * 100),
    }));
}

/**
 * Weighted random mode selection based on mode weights.
 * Uses cumulative distribution; final entry is the fallback if
 * rounding causes weights to sum to slightly less than 100.
 */
function pickWeightedMode(weights: ModeWeight[]): GameMode {
    const roll = Math.random() * 100;
    let cumulative = 0;
    for (const mw of weights) {
        cumulative += mw.weight;
        if (roll < cumulative) return mw.mode;
    }
    return weights[weights.length - 1].mode;
}

/**
 * Get a random game suggestion based on criteria.
 *
 * When `modeWeights` is provided (and modes are selected), the service first
 * picks a mode according to the weighted distribution, then queries games for
 * that specific mode.  If the chosen mode yields no results, it falls back to
 * OR-across-all-modes to avoid returning null unnecessarily.
 *
 * Returns null if no games match the criteria at all.
 */
export async function getRandomGameSuggestion(criteria: SuggestionCriteria): Promise<GameTitle | null> {
    const modes = criteria.selectedModes;

    // Weighted path: pick a mode, query for it, fall back to OR if empty
    if (modes && modes.length > 0 && criteria.modeWeights && criteria.modeWeights.length > 0) {
        const weights = normalizeWeights(modes, criteria.modeWeights);
        const chosenMode = pickWeightedMode(weights);

        const titles = await getTitlesForMode(criteria, chosenMode);
        if (titles.length > 0) {
            return pickRandom(titles) ?? null;
        }
        // Fallback: try OR across all modes
    }

    // Non-weighted (or fallback): OR across all selected modes
    const titles = await getTitlesForMode(criteria);
    return pickRandom(titles) ?? null;
}

/**
 * Get multiple random game suggestions (without duplicates)
 */
export async function getRandomGameSuggestions(
    criteria: SuggestionCriteria, 
    count: number = 3
): Promise<GameTitle[]> {
    const titles = await getTitlesForMode(criteria);

    // Already randomized by RAND() at the DB level
    return titles.slice(0, Math.min(count, titles.length));
}

