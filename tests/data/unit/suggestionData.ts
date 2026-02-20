/**
 * Test data for game suggestion tests
 */

import {GameType} from '../../../src/types/InventoryEnums';

export const TEST_USER_ID = 1;

// Sample game titles for testing
export const sampleGameTitles = [
    {
        id: '1',
        name: 'Multiplayer Shooter',
        type: GameType.VIDEO_GAME,
        overallMinPlayers: 1,
        overallMaxPlayers: 16,
        supportsOnline: true,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        onlineMinPlayers: 2,
        onlineMaxPlayers: 16,
        ownerId: TEST_USER_ID,
        releases: [
            {id: 'r1', platform: 'PC', gameTitleId: '1'},
            {id: 'r2', platform: 'PS5', gameTitleId: '1'},
        ],
    },
    {
        id: '2',
        name: 'Local Co-op Platformer',
        type: GameType.VIDEO_GAME,
        overallMinPlayers: 1,
        overallMaxPlayers: 4,
        supportsOnline: false,
        supportsLocalCouch: true, supportsLocalLAN: false,
        supportsPhysical: false,
        couchMinPlayers: 1,
        couchMaxPlayers: 4,
        ownerId: TEST_USER_ID,
        releases: [
            {id: 'r3', platform: 'PC', gameTitleId: '2'},
            {id: 'r4', platform: 'Switch', gameTitleId: '2'},
        ],
    },
    {
        id: '3',
        name: 'Party Board Game',
        type: GameType.BOARD_GAME,
        overallMinPlayers: 3,
        overallMaxPlayers: 8,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: true,
        physicalMinPlayers: 3,
        physicalMaxPlayers: 8,
        ownerId: TEST_USER_ID,
        releases: [
            {id: 'r5', platform: 'Physical', gameTitleId: '3'},
        ],
    },
    {
        id: '4',
        name: 'Singleplayer RPG',
        type: GameType.VIDEO_GAME,
        overallMinPlayers: 1,
        overallMaxPlayers: 1,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: false,
        ownerId: TEST_USER_ID,
        releases: [
            {id: 'r6', platform: 'PC', gameTitleId: '4'},
        ],
    },
    {
        id: '5',
        name: 'Card Game',
        type: GameType.CARD_GAME,
        overallMinPlayers: 2,
        overallMaxPlayers: 6,
        supportsOnline: false,
        supportsLocalCouch: false, supportsLocalLAN: false,
        supportsPhysical: true,
        physicalMinPlayers: 2,
        physicalMaxPlayers: 6,
        ownerId: TEST_USER_ID,
        releases: [
            {id: 'r7', platform: 'Physical', gameTitleId: '5'},
        ],
    },
];

// Test criteria for suggestion service
export const suggestionCriteriaData = [
    {
        description: 'no filters - returns any game',
        criteria: {
            ownerId: TEST_USER_ID,
        },
        expectedMatchIds: ['1', '2', '3', '4', '5'],
    },
    {
        description: '1 player - includes singleplayer games',
        criteria: {
            ownerId: TEST_USER_ID,
            playerCount: 1,
        },
        expectedMatchIds: ['1', '2', '4'],
    },
    {
        description: '2 players - excludes singleplayer and games needing more players',
        criteria: {
            ownerId: TEST_USER_ID,
            playerCount: 2,
        },
        expectedMatchIds: ['1', '2', '5'],
    },
    {
        description: '4 players - includes games supporting 4 players',
        criteria: {
            ownerId: TEST_USER_ID,
            playerCount: 4,
        },
        expectedMatchIds: ['1', '2', '3', '5'],
    },
    {
        description: 'online multiplayer required',
        criteria: {
            ownerId: TEST_USER_ID,
            selectedModes: ['online'],
        },
        expectedMatchIds: ['1'],
    },
    {
        description: 'local co-op required',
        criteria: {
            ownerId: TEST_USER_ID,
            selectedModes: ['couch'],
        },
        expectedMatchIds: ['2'],
    },
    {
        description: 'physical play required',
        criteria: {
            ownerId: TEST_USER_ID,
            selectedModes: ['physical'],
        },
        expectedMatchIds: ['3', '5'],
    },
    {
        description: 'couch or physical games',
        criteria: {
            ownerId: TEST_USER_ID,
            selectedModes: ['couch', 'physical'],
        },
        expectedMatchIds: ['2', '3', '5'],
    },
    {
        description: 'video games only',
        criteria: {
            ownerId: TEST_USER_ID,
            gameTypes: [GameType.VIDEO_GAME],
        },
        expectedMatchIds: ['1', '2', '4'],
    },
    {
        description: 'board games only',
        criteria: {
            ownerId: TEST_USER_ID,
            gameTypes: [GameType.BOARD_GAME],
        },
        expectedMatchIds: ['3'],
    },
    {
        description: 'PC platform required',
        criteria: {
            ownerId: TEST_USER_ID,
            includePlatforms: ['PC'],
        },
        expectedMatchIds: ['1', '2', '4'],
    },
    {
        description: 'PS5 platform excluded',
        criteria: {
            ownerId: TEST_USER_ID,
            excludePlatforms: ['PS5'],
        },
        expectedMatchIds: ['2', '3', '4', '5'],
    },
    {
        description: 'complex filter: 2 players, online, video game',
        criteria: {
            ownerId: TEST_USER_ID,
            playerCount: 2,
            selectedModes: ['online'],
            gameTypes: [GameType.VIDEO_GAME],
        },
        expectedMatchIds: ['1'],
    },
    {
        description: 'complex filter: 4 players, physical, not video game',
        criteria: {
            ownerId: TEST_USER_ID,
            playerCount: 4,
            selectedModes: ['physical'],
            gameTypes: [GameType.BOARD_GAME, GameType.CARD_GAME],
        },
        expectedMatchIds: ['3', '5'],
    },
];
