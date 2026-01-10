/**
 * Test data for Playnite controller tests
 */

export const TEST_USER_ID = 1;
export const TEST_DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';

// Valid import payloads
export const validImportPayloads = [
    {
        description: 'minimal valid payload with one game',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [
                {pluginId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab', name: 'Steam'},
            ],
            games: [
                {
                    playniteDatabaseId: 'db-123',
                    name: 'Hades',
                    originalProviderPluginId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab',
                    originalProviderName: 'Steam',
                    originalProviderGameId: '1145360',
                },
            ],
        },
    },
    {
        description: 'full payload with multiple games and providers',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [
                {pluginId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab', name: 'Steam'},
                {pluginId: '00000001-ebb2-4ecc-abcb-75c4f5a78e18', name: 'Epic'},
            ],
            games: [
                {
                    entitlementKey: 'playnite:cb91dfc9-b977-43bf-8e70-55f46e410fab:1145360',
                    playniteDatabaseId: 'db-123',
                    name: 'Hades',
                    isCustomGame: false,
                    hidden: false,
                    installed: true,
                    installDirectory: 'C:\\Games\\Hades',
                    playtimeSeconds: 3600,
                    lastActivity: '2026-01-01T12:00:00Z',
                    platforms: ['PC'],
                    sourceId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab',
                    sourceName: 'Steam',
                    originalProviderPluginId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab',
                    originalProviderName: 'Steam',
                    originalProviderGameId: '1145360',
                    raw: {appId: 1145360},
                },
                {
                    entitlementKey: 'playnite:00000001-ebb2-4ecc-abcb-75c4f5a78e18:epic-game-123',
                    playniteDatabaseId: 'db-456',
                    name: 'Fortnite',
                    isCustomGame: false,
                    hidden: false,
                    installed: false,
                    playtimeSeconds: 7200,
                    platforms: ['PC'],
                    sourceId: '00000001-ebb2-4ecc-abcb-75c4f5a78e18',
                    sourceName: 'Epic',
                    originalProviderPluginId: '00000001-ebb2-4ecc-abcb-75c4f5a78e18',
                    originalProviderName: 'Epic',
                    originalProviderGameId: 'epic-game-123',
                },
            ],
        },
    },
    {
        description: 'payload with custom game (no provider game ID)',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [
                {
                    playniteDatabaseId: 'db-custom-1',
                    name: 'My Custom Game',
                    isCustomGame: true,
                    originalProviderPluginId: 'custom',
                    originalProviderName: 'Manual',
                },
            ],
        },
    },
];

// Invalid import payloads
export const invalidImportPayloads = [
    {
        description: 'missing aggregator',
        payload: {
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [],
        },
        errorPattern: /aggregator/i,
    },
    {
        description: 'wrong aggregator value',
        payload: {
            aggregator: 'steam',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [],
        },
        errorPattern: /aggregator/i,
    },
    {
        description: 'missing exportedAt',
        payload: {
            aggregator: 'playnite',
            plugins: [],
            games: [],
        },
        errorPattern: /exportedAt/i,
    },
    {
        description: 'missing games array',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
        },
        errorPattern: /games/i,
    },
    {
        description: 'game missing name',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [
                {
                    playniteDatabaseId: 'db-123',
                    originalProviderPluginId: 'plugin-123',
                    originalProviderName: 'Test',
                },
            ],
        },
        errorPattern: /name/i,
    },
    {
        description: 'game missing playniteDatabaseId',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [
                {
                    name: 'Test Game',
                    originalProviderPluginId: 'plugin-123',
                    originalProviderName: 'Test',
                },
            ],
        },
        errorPattern: /playniteDatabaseId/i,
    },
    {
        description: 'game missing originalProviderPluginId',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [
                {
                    playniteDatabaseId: 'db-123',
                    name: 'Test Game',
                    originalProviderName: 'Test',
                },
            ],
        },
        errorPattern: /originalProviderPluginId/i,
    },
    {
        description: 'game missing originalProviderName',
        payload: {
            aggregator: 'playnite',
            exportedAt: '2026-01-08T20:15:00Z',
            plugins: [],
            games: [
                {
                    playniteDatabaseId: 'db-123',
                    name: 'Test Game',
                    originalProviderPluginId: 'plugin-123',
                },
            ],
        },
        errorPattern: /originalProviderName/i,
    },
];

// Device registration data
export const registerDeviceData = [
    {
        description: 'registers device with valid name',
        deviceName: 'My Gaming PC',
        userId: TEST_USER_ID,
    },
    {
        description: 'registers device with long name',
        deviceName: 'A'.repeat(255),
        userId: TEST_USER_ID,
    },
];

export const registerDeviceErrorData = [
    {
        description: 'rejects empty device name',
        deviceName: '',
        userId: TEST_USER_ID,
        errorPattern: /device name is required/i,
    },
    {
        description: 'rejects whitespace-only device name',
        deviceName: '   ',
        userId: TEST_USER_ID,
        errorPattern: /device name is required/i,
    },
    {
        description: 'rejects device name too long',
        deviceName: 'A'.repeat(256),
        userId: TEST_USER_ID,
        errorPattern: /255 characters or less/i,
    },
    {
        description: 'requires authentication',
        deviceName: 'Test Device',
        userId: undefined,
        errorPattern: /authentication required/i,
    },
];

// Entitlement key derivation data
export const entitlementKeyData = [
    {
        description: 'uses provided entitlementKey',
        game: {
            entitlementKey: 'playnite:plugin-1:game-1',
            playniteDatabaseId: 'db-123',
            originalProviderPluginId: 'plugin-1',
            originalProviderGameId: 'game-1',
        },
        expected: {
            key: 'playnite:plugin-1:game-1',
            needsReview: false,
        },
    },
    {
        description: 'derives key from provider info when entitlementKey missing',
        game: {
            playniteDatabaseId: 'db-123',
            originalProviderPluginId: 'plugin-1',
            originalProviderGameId: 'game-1',
        },
        expected: {
            key: 'playnite:plugin-1:game-1',
            needsReview: false,
        },
    },
    {
        description: 'falls back to database ID when no provider game ID',
        game: {
            playniteDatabaseId: 'db-123',
            originalProviderPluginId: 'plugin-1',
        },
        expected: {
            key: 'playnite-db:db-123',
            needsReview: true,
        },
    },
];

// Provider normalization data
export const providerNormalizationData = [
    {
        description: 'normalizes Steam plugin ID',
        pluginId: 'cb91dfc9-b977-43bf-8e70-55f46e410fab',
        expected: 'steam',
    },
    {
        description: 'normalizes Epic plugin ID',
        pluginId: '00000001-ebb2-4ecc-abcb-75c4f5a78e18',
        expected: 'epic',
    },
    {
        description: 'normalizes GOG plugin ID',
        pluginId: 'aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e',
        expected: 'gog',
    },
    {
        description: 'returns unknown for unrecognized plugin ID',
        pluginId: 'unknown-plugin-guid',
        expected: 'unknown',
    },
];
