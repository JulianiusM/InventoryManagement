/**
 * Game player profile validation service
 * Implements validation rules for player counts and multiplayer modes
 */

export interface PlayerProfile {
    overallMinPlayers: number;
    overallMaxPlayers: number;
    supportsOnline: boolean;
    supportsLocal: boolean;
    supportsPhysical: boolean;
    onlineMinPlayers?: number | null;
    onlineMaxPlayers?: number | null;
    localMinPlayers?: number | null;
    localMaxPlayers?: number | null;
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
 * @throws PlayerProfileValidationError if validation fails
 */
export function validatePlayerProfile(profile: PlayerProfile): void {
    // Validate overall player counts
    if (profile.overallMinPlayers < 1) {
        throw new PlayerProfileValidationError('Overall minimum players must be at least 1');
    }
    
    if (profile.overallMaxPlayers < profile.overallMinPlayers) {
        throw new PlayerProfileValidationError('Overall maximum players must be >= minimum players');
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
    
    // Validate local mode
    if (profile.supportsLocal) {
        validateModePlayerCounts(
            'Local',
            profile.localMinPlayers,
            profile.localMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        if (isDefined(profile.localMinPlayers)) {
            throw new PlayerProfileValidationError('Local min players must be null when local is not supported');
        }
        if (isDefined(profile.localMaxPlayers)) {
            throw new PlayerProfileValidationError('Local max players must be null when local is not supported');
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
 */
function validateModePlayerCounts(
    modeName: string,
    modeMin: number | null | undefined,
    modeMax: number | null | undefined,
    overallMin: number,
    overallMax: number
): void {
    // If provided, validate constraints: overallMin <= modeMin <= modeMax <= overallMax
    if (isDefined(modeMin)) {
        if (modeMin < overallMin) {
            throw new PlayerProfileValidationError(
                `${modeName} min players (${modeMin}) must be >= overall min (${overallMin})`
            );
        }
    }
    
    if (isDefined(modeMax)) {
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
 */
export function getEffectivePlayerCounts(
    profile: PlayerProfile,
    mode: 'online' | 'local' | 'physical'
): {min: number; max: number} | null {
    switch (mode) {
        case 'online':
            if (!profile.supportsOnline) return null;
            return {
                min: profile.onlineMinPlayers ?? profile.overallMinPlayers,
                max: profile.onlineMaxPlayers ?? profile.overallMaxPlayers,
            };
        case 'local':
            if (!profile.supportsLocal) return null;
            return {
                min: profile.localMinPlayers ?? profile.overallMinPlayers,
                max: profile.localMaxPlayers ?? profile.overallMaxPlayers,
            };
        case 'physical':
            if (!profile.supportsPhysical) return null;
            return {
                min: profile.physicalMinPlayers ?? profile.overallMinPlayers,
                max: profile.physicalMaxPlayers ?? profile.overallMaxPlayers,
            };
    }
}
