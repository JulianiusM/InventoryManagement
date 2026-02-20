/**
 * Game player profile validation service
 * Implements validation rules for player counts and multiplayer modes
 * 
 * IMPORTANT: Player count fields can be null to indicate "unknown".
 * - For singleplayer-only games (no modes enabled): null = implied 1 player
 * - For multiplayer games: null = we don't know the actual player count
 * - This distinction is critical for accurate search functionality
 * 
 * When a mode is disabled, any associated player counts are silently cleared
 * (the mode flag takes precedence over orphaned counts).
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
 * Normalize player profile data.
 * 
 * - Silently clears mode-specific player counts when the mode is not supported
 *   (the supported flag takes precedence).
 * - Validates remaining data for consistency (min/max relationships, positive values).
 * 
 * @throws PlayerProfileValidationError if data is invalid
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
    
    // For each mode: if supported, validate counts; if not, silently clear counts
    if (profile.supportsOnline) {
        validateModePlayerCounts(
            'Online',
            profile.onlineMinPlayers,
            profile.onlineMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        profile.onlineMinPlayers = null;
        profile.onlineMaxPlayers = null;
    }
    
    if (profile.supportsLocalCouch) {
        validateModePlayerCounts(
            'Couch',
            profile.couchMinPlayers,
            profile.couchMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        profile.couchMinPlayers = null;
        profile.couchMaxPlayers = null;
    }
    
    if (profile.supportsLocalLAN) {
        validateModePlayerCounts(
            'LAN',
            profile.lanMinPlayers,
            profile.lanMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        profile.lanMinPlayers = null;
        profile.lanMaxPlayers = null;
    }
    
    if (profile.supportsPhysical) {
        validateModePlayerCounts(
            'Physical',
            profile.physicalMinPlayers,
            profile.physicalMaxPlayers,
            profile.overallMinPlayers,
            profile.overallMaxPlayers
        );
    } else {
        profile.physicalMinPlayers = null;
        profile.physicalMaxPlayers = null;
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
