/**
 * Types for Games Controller
 */

export interface CreateGameTitleBody {
    name: string;
    type?: string;
    description?: string;
    coverImageUrl?: string;
    overallMinPlayers: number;
    overallMaxPlayers: number;
    supportsOnline?: boolean;
    supportsLocalCouch?: boolean;
    supportsLocalLAN?: boolean;
    supportsPhysical?: boolean;
    onlineMinPlayers?: number;
    onlineMaxPlayers?: number;
    localMinPlayers?: number;
    localMaxPlayers?: number;
    physicalMinPlayers?: number;
    physicalMaxPlayers?: number;
}

export interface CreateGameReleaseBody {
    gameTitleId: string;
    platform?: string;
    edition?: string;
    region?: string;
    releaseDate?: string;
    playersOverrideMin?: number;
    playersOverrideMax?: number;
    // Mode-specific overrides
    overrideSupportsOnline?: boolean;
    overrideSupportsLocalCouch?: boolean;
    overrideSupportsLocalLAN?: boolean;
    overrideSupportsPhysical?: boolean;
    overrideOnlineMin?: number;
    overrideOnlineMax?: number;
    overrideLocalMin?: number;
    overrideLocalMax?: number;
    overridePhysicalMin?: number;
    overridePhysicalMax?: number;
}

export interface CreateGameCopyBody {
    gameReleaseId: string;
    copyType: string;
    externalAccountId?: string;
    externalGameId?: string;
    locationId?: string;
    condition?: string;
    notes?: string;
    lendable?: boolean;
    acquiredAt?: string;
}

export interface MoveGameCopyBody {
    locationId?: string;
}

export interface LendGameCopyBody {
    gameCopyId: string;
    partyId: string;
    dueAt?: string;
    conditionOut?: string;
    notes?: string;
}

export interface CreateExternalAccountBody {
    provider: string;
    accountName: string;
    externalUserId?: string;
    tokenRef?: string;
}

export interface ResolveMappingBody {
    gameTitleId?: string;
    gameReleaseId?: string;
    action: 'map' | 'ignore' | 'create';
}

// New types for enhanced functionality

export interface MergeGameTitlesBody {
    sourceId: string;
    targetId: string;
}

export interface MergeGameReleasesBody {
    sourceId: string;
    targetId: string;
}

export interface LinkDigitalCopyToAccountBody {
    externalAccountId: string;
    externalGameId?: string;
}

export interface ScheduleSyncBody {
    intervalMinutes: number;
}

/**
 * Device info for push-style connectors
 */
export interface ConnectorDevice {
    id: string;
    name: string;
    createdAt: Date;
    lastSeenAt?: Date | null;
    lastImportAt?: Date | null;
    status: 'active' | 'revoked';
}

/**
 * Device registration result
 */
export interface DeviceRegistrationResult {
    deviceId: string;
    deviceName: string;
    token: string; // Only returned on registration, not stored
}