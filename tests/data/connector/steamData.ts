/**
 * Test data for Steam connector tests
 * Following data-driven testing approach
 */

// Valid SteamID64 for testing
export const TEST_STEAM_ID = '76561198012345678';

// Test cases for input parsing
export const parseInputTestData = [
    {
        description: 'parses raw SteamID64',
        input: '76561198012345678',
        expected: {type: 'steamid', value: '76561198012345678'},
    },
    {
        description: 'parses profile URL with SteamID64',
        input: 'https://steamcommunity.com/profiles/76561198012345678/',
        expected: {type: 'steamid', value: '76561198012345678'},
    },
    {
        description: 'parses profile URL with SteamID64 without trailing slash',
        input: 'https://steamcommunity.com/profiles/76561198012345678',
        expected: {type: 'steamid', value: '76561198012345678'},
    },
    {
        description: 'parses vanity URL',
        input: 'https://steamcommunity.com/id/gaben/',
        expected: {type: 'vanity', value: 'gaben'},
    },
    {
        description: 'parses vanity URL without trailing slash',
        input: 'https://steamcommunity.com/id/gaben',
        expected: {type: 'vanity', value: 'gaben'},
    },
    {
        description: 'parses vanity name directly',
        input: 'gaben',
        expected: {type: 'vanity', value: 'gaben'},
    },
    {
        description: 'handles whitespace in input',
        input: '  76561198012345678  ',
        expected: {type: 'steamid', value: '76561198012345678'},
    },
    {
        description: 'handles http URL (not https)',
        input: 'http://steamcommunity.com/profiles/76561198012345678/',
        expected: {type: 'steamid', value: '76561198012345678'},
    },
    {
        description: 'handles vanity with underscores',
        input: 'user_name_123',
        expected: {type: 'vanity', value: 'user_name_123'},
    },
    {
        description: 'handles vanity with dashes',
        input: 'user-name-123',
        expected: {type: 'vanity', value: 'user-name-123'},
    },
];

export const parseInputInvalidData = [
    {
        description: 'rejects empty input',
        input: '',
        expectedErrorCode: 'INVALID_INPUT',
    },
    {
        description: 'rejects whitespace-only input',
        input: '   ',
        expectedErrorCode: 'INVALID_INPUT',
    },
    {
        description: 'rejects invalid URL with slashes',
        input: 'something/invalid/path',
        expectedErrorCode: 'INVALID_INPUT',
    },
];

// Mock Steam API responses
export const mockPlayerSummaryResponse = {
    response: {
        players: [{
            steamid: TEST_STEAM_ID,
            personaname: 'Test User',
            profileurl: `https://steamcommunity.com/id/testuser/`,
            avatar: 'https://avatars.steamstatic.com/small.jpg',
            avatarmedium: 'https://avatars.steamstatic.com/medium.jpg',
            avatarfull: 'https://avatars.steamstatic.com/full.jpg',
            personastate: 1,
            communityvisibilitystate: 3, // Public
        }],
    },
};

export const mockPrivatePlayerSummaryResponse = {
    response: {
        players: [{
            steamid: TEST_STEAM_ID,
            personaname: 'Private User',
            profileurl: `https://steamcommunity.com/profiles/${TEST_STEAM_ID}/`,
            avatar: 'https://avatars.steamstatic.com/small.jpg',
            avatarmedium: 'https://avatars.steamstatic.com/medium.jpg',
            avatarfull: 'https://avatars.steamstatic.com/full.jpg',
            personastate: 0,
            communityvisibilitystate: 1, // Private
        }],
    },
};

export const mockEmptyPlayerSummaryResponse = {
    response: {
        players: [],
    },
};

export const mockResolveVanitySuccessResponse = {
    response: {
        success: 1,
        steamid: TEST_STEAM_ID,
    },
};

export const mockResolveVanityFailResponse = {
    response: {
        success: 42,
        message: 'No match',
    },
};

export const mockOwnedGamesResponse = {
    response: {
        game_count: 3,
        games: [
            {
                appid: 570,
                name: 'Dota 2',
                playtime_forever: 12500,
                rtime_last_played: 1704067200, // Unix timestamp
                img_icon_url: 'icon_570.jpg',
            },
            {
                appid: 730,
                name: 'Counter-Strike 2',
                playtime_forever: 5420,
                rtime_last_played: 1703980800,
            },
            {
                appid: 1091500,
                name: 'Cyberpunk 2077',
                playtime_forever: 1250,
                rtime_last_played: 1701388800,
            },
        ],
    },
};

export const mockEmptyOwnedGamesResponse = {
    response: {
        game_count: 0,
    },
};

// Test cases for API URL construction
export const getOwnedGamesUrlTestData = [
    {
        description: 'includes required parameters',
        config: {},
        expectedParams: ['key=', 'steamid=', 'format=json'],
    },
    {
        description: 'includes includeAppInfo when enabled',
        config: {includeAppInfo: true},
        expectedParams: ['include_appinfo=1'],
    },
    {
        description: 'includes includePlayedFreeGames when enabled',
        config: {includePlayedFreeGames: true},
        expectedParams: ['include_played_free_games=1'],
    },
    {
        description: 'includes language parameter',
        config: {language: 'de'},
        expectedParams: ['language=de'],
    },
    {
        description: 'includes skipUnvettedApps when enabled',
        config: {skipUnvettedApps: true},
        expectedParams: ['skip_unvetted_apps=1'],
    },
];

// Test cases for error handling
export const errorHandlingTestData = [
    {
        description: 'handles 401 response as API_KEY_INVALID',
        statusCode: 401,
        expectedErrorCode: 'API_KEY_INVALID',
    },
    {
        description: 'handles 403 response as API_KEY_INVALID',
        statusCode: 403,
        expectedErrorCode: 'API_KEY_INVALID',
    },
];
