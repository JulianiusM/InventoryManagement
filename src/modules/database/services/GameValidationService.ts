/**
 * Game player profile validation service
 * Implements validation rules for player counts and multiplayer modes
 * 
 * IMPORTANT: Player count fields can be null to indicate "unknown".
 * - For singleplayer-only games (no modes enabled): null = implied 1 player
 * - For multiplayer games: null = we don't know the actual player count
 * - This distinction is critical for accurate search functionality
 */

export interface PlayerProfile {
    // Overall player counts - null means "unknown"
    overallMinPlayers?: number | null;
    overallMaxPlayers?: number | null;
    supportsOnline: boolean;
    supportsLocalCouch: boolean;
    supportsLocalLAN: boolean;
    supportsPhysical: boolean;
    // Mode-specific counts - null means "unknown for this mode"
    onlineMinPlayers?: number | null;
    onlineMaxPlayers?: number | null;
    couchMinPlayers?: number | null;
    couchMaxPlayers?: number | null;
    lanMinPlayers?: number | null;
    lanMaxPlayers?: number | null;
    physicalMinPlayers?: number | null;
    physicalMaxPlayers?: number | null;
}

export class PlayerProfileValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PlayerProfileValidationError';
    }
}

/**
 * Helper function to check if a value is defined (not null or undefined)
 */
function isDefined<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined;
}

/**
 * Validate player profile data
 * 
 * Player counts can be null (meaning "unknown"):
 * - null overall counts are valid - they indicate we don't know the player count
 * - For singleplayer-only games, null = implied 1 player
 * - For multiplayer games, null = unknown (UI will show warning)
 * 
 * @throws PlayerProfileValidationError if validation fails
 */
export function validatePlayerProfile(profile: PlayerProfile): void {
    // Validate overall player counts (only if provided)
    // null is allowed - it means "unknown"
    if (isDefined(profile.overallMinPlayers)) {
        if (profile.overallMinPlayers < 1) {
            throw new PlayerProfileValidationError('Overall minimum players must be at least 1');
        }
    }
    
    // If both are provided, validate their relationship
    if (isDefined(profile.overallMinPlayers) && isDefined(profile.overallMaxPlayers)) {
        if (profile.overallMaxPlayers < profile.overallMinPlayers) {
            throw new PlayerProfileValidationError('Overall maximum players must be >= minimum players');
        }
    }
    
    // Validate online mode
    if (profile.supportsOnline) {
        validateModePlayerCounts(
            'Online',
            profile.onlineMinPlayers,
            profile.onlineMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        // If mode not supported, mode min/max must be null/absent
        if (isDefined(profile.onlineMinPlayers)) {
            throw new PlayerProfileValidationError('Online min players must be null when online is not supported');
        }
        if (isDefined(profile.onlineMaxPlayers)) {
            throw new PlayerProfileValidationError('Online max players must be null when online is not supported');
        }
    }
    
    // Validate couch mode
    if (profile.supportsLocalCouch) {
        validateModePlayerCounts(
            'Couch',
            profile.couchMinPlayers,
            profile.couchMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        if (isDefined(profile.couchMinPlayers)) {
            throw new PlayerProfileValidationError('Couch min players must be null when couch mode is not supported');
        }
        if (isDefined(profile.couchMaxPlayers)) {
            throw new PlayerProfileValidationError('Couch max players must be null when couch mode is not supported');
        }
    }
    
    // Validate LAN mode
    if (profile.supportsLocalLAN) {
        validateModePlayerCounts(
            'LAN',
            profile.lanMinPlayers,
            profile.lanMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        if (isDefined(profile.lanMinPlayers)) {
            throw new PlayerProfileValidationError('LAN min players must be null when LAN mode is not supported');
        }
        if (isDefined(profile.lanMaxPlayers)) {
            throw new PlayerProfileValidationError('LAN max players must be null when LAN mode is not supported');
        }
    }
    
    // Validate physical mode
    if (profile.supportsPhysical) {
        validateModePlayerCounts(
            'Physical',
            profile.physicalMinPlayers,
            profile.physicalMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        if (isDefined(profile.physicalMinPlayers)) {
            throw new PlayerProfileValidationError('Physical min players must be null when physical is not supported');
        }
        if (isDefined(profile.physicalMaxPlayers)) {
            throw new PlayerProfileValidationError('Physical max players must be null when physical is not supported');
        }
    }
}

/**
 * Validate mode-specific player counts against overall range
 * Note: overall counts may be null (unknown), in which case we skip the range validation
 */
function validateModePlayerCounts(
    modeName: string,
    modeMin: number | null | undefined,
    modeMax: number | null | undefined,
    overallMin: number | null | undefined,
    overallMax: number | null | undefined
): void {
    // If provided, validate basic constraints
    if (isDefined(modeMin) && modeMin < 1) {
        throw new PlayerProfileValidationError(
            `${modeName} min players (${modeMin}) must be at least 1`
        );
    }
    
    // If overall counts are known, validate mode counts are within range
    if (isDefined(modeMin) && isDefined(overallMin)) {
        if (modeMin < overallMin) {
            throw new PlayerProfileValidationError(
                `${modeName} min players (${modeMin}) must be >= overall min (${overallMin})`
            );
        }
    }
    
    if (isDefined(modeMax) && isDefined(overallMax)) {
        if (modeMax > overallMax) {
            throw new PlayerProfileValidationError(
                `${modeName} max players (${modeMax}) must be <= overall max (${overallMax})`
            );
        }
    }
    
    if (isDefined(modeMin) && isDefined(modeMax)) {
        if (modeMax < modeMin) {
            throw new PlayerProfileValidationError(
                `${modeName} max players (${modeMax}) must be >= min players (${modeMin})`
            );
        }
    }
}

/**
 * Get effective player counts for a mode, falling back to overall if not specified
 * Returns null if either:
 * - The mode is not supported
 * - Both mode and overall counts are unknown (null)
 */
export function getEffectivePlayerCounts(
    profile: PlayerProfile,
    mode: 'online' | 'couch' | 'lan' | 'physical'
): {min: number | null; max: number | null} | null {
    switch (mode) {
        case 'online':
            if (!profile.supportsOnline) return null;
            return {
                min: profile.onlineMinPlayers ?? profile.overallMinPlayers ?? null,
                max: profile.onlineMaxPlayers ?? profile.overallMaxPlayers ?? null,
            };
        case 'couch':
            if (!profile.supportsLocalCouch) return null;
            return {
                min: profile.couchMinPlayers ?? profile.overallMinPlayers ?? null,
                max: profile.couchMaxPlayers ?? profile.overallMaxPlayers ?? null,
            };
        case 'lan':
            if (!profile.supportsLocalLAN) return null;
            return {
                min: profile.lanMinPlayers ?? profile.overallMinPlayers ?? null,
                max: profile.lanMaxPlayers ?? profile.overallMaxPlayers ?? null,
            };
        case 'physical':
            if (!profile.supportsPhysical) return null;
            return {
                min: profile.physicalMinPlayers ?? profile.overallMinPlayers ?? null,
                max: profile.physicalMaxPlayers ?? profile.overallMaxPlayers ?? null,
            };
    }
}
