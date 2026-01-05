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
            supportsLocal: false,
            supportsPhysical: false,
        },
    },
    {
        description: 'multiplayer online game',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 64,
            supportsOnline: true,
            supportsLocal: false,
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
            supportsLocal: true,
            supportsPhysical: false,
            localMinPlayers: 1,
            localMaxPlayers: 4,
        },
    },
    {
        description: 'party card game with physical play',
        profile: {
            overallMinPlayers: 3,
            overallMaxPlayers: 99,
            supportsOnline: false,
            supportsLocal: false,
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
            supportsLocal: true,
            supportsPhysical: false,
            onlineMinPlayers: 2,
            onlineMaxPlayers: 8,
            localMinPlayers: 1,
            localMaxPlayers: 4,
        },
    },
    {
        description: 'game with mode-specific ranges falling back to overall',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 16,
            supportsOnline: true,
            supportsLocal: true,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
            supportsPhysical: false,
            onlineMinPlayers: 2,
        },
        expectedError: /online.*must be null/i,
    },
    {
        description: 'local mode specified when not supported',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocal: false,
            supportsPhysical: false,
            localMaxPlayers: 4,
        },
        expectedError: /local.*must be null/i,
    },
    {
        description: 'physical mode specified when not supported',
        profile: {
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: false,
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
            supportsLocal: false,
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
