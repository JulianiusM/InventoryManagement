/**
 * Test data for games controller tests
 */

export const TEST_USER_ID = 1;

// Player profile validation test data
export const validPlayerProfileData = [
    {
        description: 'single player game',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
        },
    },
    {
        description: 'multiplayer online game',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 64,
            supportsOnline: true,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMinPlayers: 2,
            onlineMaxPlayers: 64,
        },
    },
    {
        description: 'local co-op game',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocalCouch: true, supportsLocalLAN: false,
            supportsPhysical: false,
            couchMinPlayers: 1,
            couchMaxPlayers: 4,
        },
    },
    {
        description: 'party card game with physical play',
        profile: {
            overallMinPlayers: 3,
            overallMaxPlayers: 99,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: true,
            physicalMinPlayers: 3,
            physicalMaxPlayers: 99,
        },
    },
    {
        description: 'mixed mode game with all modes',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 8,
            supportsOnline: true,
            supportsLocalCouch: true, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMinPlayers: 2,
            onlineMaxPlayers: 8,
            couchMinPlayers: 1,
            couchMaxPlayers: 4,
        },
    },
    {
        description: 'game with mode-specific ranges falling back to overall',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 16,
            supportsOnline: true,
            supportsLocalCouch: true, supportsLocalLAN: false,
            supportsPhysical: false,
            // No specific mode ranges - should fall back to overall
        },
    },
];

export const invalidPlayerProfileData = [
    {
        description: 'overall min players less than 1',
        profile: {
            overallMinPlayers: 0,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
        },
        expectedError: /minimum players must be at least 1/i,
    },
    {
        description: 'overall max less than min',
        profile: {
            overallMinPlayers: 4,
            overallMaxPlayers: 2,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
        },
        expectedError: /maximum players must be >= minimum/i,
    },
    {
        description: 'online mode specified when not supported',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMinPlayers: 2,
        },
        expectedError: /online.*must be null/i,
    },
    {
        description: 'couch mode specified when not supported',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            couchMaxPlayers: 4,
        },
        expectedError: /couch.*must be null/i,
    },
    {
        description: 'physical mode specified when not supported',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            physicalMinPlayers: 2,
        },
        expectedError: /physical.*must be null/i,
    },
    {
        description: 'online min below overall min',
        profile: {
            overallMinPlayers: 2,
            overallMaxPlayers: 8,
            supportsOnline: true,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMinPlayers: 1, // Below overall min
        },
        expectedError: /online min.*must be >= overall min/i,
    },
    {
        description: 'online max above overall max',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: true,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMaxPlayers: 8, // Above overall max
        },
        expectedError: /online max.*must be <= overall max/i,
    },
    {
        description: 'mode max less than mode min',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 8,
            supportsOnline: true,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMinPlayers: 4,
            onlineMaxPlayers: 2, // Less than min
        },
        expectedError: /max players.*must be >= min/i,
    },
];

export const createGameTitleData = [
    {
        description: 'creates single player video game',
        input: {
            name: 'The Witcher 3',
            type: 'video_game',
            description: 'Open world RPG',
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
        },
        ownerId: TEST_USER_ID,
    },
    {
        description: 'creates multiplayer online game',
        input: {
            name: 'Counter-Strike 2',
            type: 'video_game',
            overallMinPlayers: 1,
            overallMaxPlayers: 10,
            supportsOnline: true,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
            onlineMinPlayers: 2,
            onlineMaxPlayers: 10,
        },
        ownerId: TEST_USER_ID,
    },
    {
        description: 'creates party board game',
        input: {
            name: 'Monopoly',
            type: 'board_game',
            overallMinPlayers: 2,
            overallMaxPlayers: 8,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: true,
            physicalMinPlayers: 2,
            physicalMaxPlayers: 8,
        },
        ownerId: TEST_USER_ID,
    },
];

export const createGameTitleErrorData = [
    {
        description: 'throws error when name is empty',
        input: {
            name: '',
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
        },
        ownerId: TEST_USER_ID,
        errorMessage: 'Name is required',
    },
    {
        description: 'throws error when name is whitespace only',
        input: {
            name: '   ',
            overallMinPlayers: 1,
            overallMaxPlayers: 1,
            supportsOnline: false,
            supportsLocalCouch: false, supportsLocalLAN: false,
            supportsPhysical: false,
        },
        ownerId: TEST_USER_ID,
        errorMessage: 'Name is required',
    },
];

export const lendGameCopyData = [
    {
        description: 'lends physical copy successfully',
        gameCopyId: 'uuid-copy-1',
        partyId: 'uuid-party-1',
        existingCopy: {
            id: 'uuid-copy-1',
            copyType: 'physical_copy',
            lendable: true,
            ownerId: TEST_USER_ID,
        },
        existingLoan: null,
        ownerId: TEST_USER_ID,
    },
];

export const lendGameCopyErrorData = [
    {
        description: 'throws error when copy is digital',
        gameCopyId: 'uuid-copy-1',
        partyId: 'uuid-party-1',
        existingCopy: {
            id: 'uuid-copy-1',
            copyType: 'digital_license',
            lendable: false,
            ownerId: TEST_USER_ID,
        },
        ownerId: TEST_USER_ID,
        errorMessage: 'Cannot lend a digital copy',
    },
    {
        description: 'throws error when copy is not lendable',
        gameCopyId: 'uuid-copy-1',
        partyId: 'uuid-party-1',
        existingCopy: {
            id: 'uuid-copy-1',
            copyType: 'physical_copy',
            lendable: false,
            ownerId: TEST_USER_ID,
        },
        ownerId: TEST_USER_ID,
        errorMessage: 'not lendable',
    },
];

// ============ Metadata Management Test Data ============

// Sample game titles for metadata management tests
export const sampleGameTitles = [
    // Games with similar names (should be grouped)
    {
        id: 'title-1',
        name: 'The Sims 4',
        type: 'video_game',
        description: 'Life simulation game',
        coverImageUrl: 'https://example.com/sims4.jpg',
        overallMinPlayers: 1,
        overallMaxPlayers: 1,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        ownerId: TEST_USER_ID,
        dismissedSimilar: false,
        dismissedMissingMetadata: false,
        dismissedInvalidPlayers: false,
    },
    {
        id: 'title-2',
        name: 'The Sims 4 Premium Edition',
        type: 'video_game',
        description: null, // Missing metadata
        coverImageUrl: null, // Missing metadata
        overallMinPlayers: 1,
        overallMaxPlayers: 1,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        ownerId: TEST_USER_ID,
        dismissedSimilar: false,
        dismissedMissingMetadata: false,
        dismissedInvalidPlayers: false,
    },
    {
        id: 'title-3',
        name: 'Counter-Strike 2',
        type: 'video_game',
        description: 'Competitive shooter',
        coverImageUrl: 'https://example.com/cs2.jpg',
        overallMinPlayers: 1,
        overallMaxPlayers: null, // Invalid: multiplayer with unknown count
        supportsOnline: true,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 2,
        onlineMaxPlayers: null, // Unknown online player count
        ownerId: TEST_USER_ID,
        dismissedSimilar: false,
        dismissedMissingMetadata: false,
        dismissedInvalidPlayers: false,
    },
    {
        id: 'title-4',
        name: 'Minecraft',
        type: 'video_game',
        description: 'Sandbox game',
        coverImageUrl: 'https://example.com/minecraft.jpg',
        overallMinPlayers: 1,
        overallMaxPlayers: 8,
        supportsOnline: true,
        supportsLocalCouch: true, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 1,
        onlineMaxPlayers: 8,
        couchMinPlayers: 1,
        couchMaxPlayers: 4,
        ownerId: TEST_USER_ID,
        dismissedSimilar: false,
        dismissedMissingMetadata: false,
        dismissedInvalidPlayers: false,
    },
    {
        id: 'title-5',
        name: 'Unknown Game',
        type: 'video_game',
        description: null,
        coverImageUrl: null,
        overallMinPlayers: null,
        overallMaxPlayers: null,
        supportsOnline: true, // Multiplayer but unknown counts
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        ownerId: TEST_USER_ID,
        dismissedSimilar: false,
        dismissedMissingMetadata: false,
        dismissedInvalidPlayers: false,
    },
];

// Test data for dismissal functionality
export const dismissalTestData = [
    {
        description: 'dismisses similar title',
        titleId: 'title-1',
        dismissalType: 'similar' as const,
        expectedField: 'dismissedSimilar',
    },
    {
        description: 'dismisses missing metadata title',
        titleId: 'title-2',
        dismissalType: 'missing_metadata' as const,
        expectedField: 'dismissedMissingMetadata',
    },
    {
        description: 'dismisses invalid players title',
        titleId: 'title-3',
        dismissalType: 'invalid_players' as const,
        expectedField: 'dismissedInvalidPlayers',
    },
];
