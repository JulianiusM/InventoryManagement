/**
 * Test data for wizard controller tests
 */

export const TEST_USER_ID = 1;

export const wizardChooserData = {
    description: 'returns all entity types for chooser',
    userId: TEST_USER_ID,
    expectedTypes: ['location', 'item', 'game'],
};

export const wizardFormData = [
    {
        description: 'returns location wizard form data',
        entityType: 'location',
        userId: TEST_USER_ID,
        expectedEntityType: 'location',
        expectedStepCount: 3,
    },
    {
        description: 'returns item wizard form data',
        entityType: 'item',
        userId: TEST_USER_ID,
        expectedEntityType: 'item',
        expectedStepCount: 4,
    },
    {
        description: 'returns game wizard form data',
        entityType: 'game',
        userId: TEST_USER_ID,
        expectedEntityType: 'game',
        expectedStepCount: 4,
    },
];

export const wizardFormErrorData = [
    {
        description: 'throws error for invalid entity type',
        entityType: 'invalid',
        userId: TEST_USER_ID,
        errorMessage: 'Invalid entity type',
    },
];

export const submitLocationData = [
    {
        description: 'creates location via wizard',
        entityType: 'location',
        body: {name: 'Living Room', kind: 'room'},
        userId: TEST_USER_ID,
        mockLocation: {id: 'uuid-loc-1', name: 'Living Room', kind: 'room'},
        expected: {
            entityType: 'location',
            entityId: 'uuid-loc-1',
            entityName: 'Living Room',
            editUrl: '/locations/uuid-loc-1',
            listUrl: '/locations',
        },
    },
];

export const submitItemData = [
    {
        description: 'creates item via wizard with existing location',
        entityType: 'item',
        body: {name: 'Power Drill', type: 'tool', locationId: 'uuid-loc-1'},
        userId: TEST_USER_ID,
        mockItem: {id: 'uuid-item-1', name: 'Power Drill', type: 'tool', locationId: 'uuid-loc-1'},
        expected: {
            entityType: 'item',
            entityId: 'uuid-item-1',
            entityName: 'Power Drill',
            editUrl: '/items/uuid-item-1',
            listUrl: '/items',
        },
    },
    {
        description: 'creates item with inline new location',
        entityType: 'item',
        body: {name: 'Book', type: 'book', newLocationName: 'Bookshelf', newLocationKind: 'shelf'},
        userId: TEST_USER_ID,
        mockNewLocation: {id: 'uuid-loc-new', name: 'Bookshelf', kind: 'shelf'},
        mockItem: {id: 'uuid-item-2', name: 'Book', type: 'book', locationId: 'uuid-loc-new'},
        expected: {
            entityType: 'item',
            entityId: 'uuid-item-2',
            entityName: 'Book',
            editUrl: '/items/uuid-item-2',
            listUrl: '/items',
        },
    },
];

export const submitGameData = [
    {
        description: 'creates game title with release and physical copy via wizard',
        entityType: 'game',
        body: {name: 'Catan', type: 'board_game', platform: 'Physical', copyType: 'physical_copy', condition: 'new'},
        userId: TEST_USER_ID,
        mockGameTitle: {id: 'uuid-game-1', name: 'Catan'},
        mockRelease: {id: 'uuid-release-1', gameTitleId: 'uuid-game-1', platform: 'Physical'},
        mockCopy: {id: 'uuid-copy-1', gameReleaseId: 'uuid-release-1'},
        expected: {
            entityType: 'game',
            entityId: 'uuid-game-1',
            entityName: 'Catan',
            editUrl: '/games/titles/uuid-game-1',
            listUrl: '/games',
        },
    },
    {
        description: 'creates game title with release and digital copy via wizard',
        entityType: 'game',
        body: {name: 'Portal 2', type: 'video_game', platform: 'PC', copyType: 'digital_license'},
        userId: TEST_USER_ID,
        mockGameTitle: {id: 'uuid-game-2', name: 'Portal 2'},
        mockRelease: {id: 'uuid-release-2', gameTitleId: 'uuid-game-2', platform: 'PC'},
        mockCopy: {id: 'uuid-copy-2', gameReleaseId: 'uuid-release-2'},
        expected: {
            entityType: 'game',
            entityId: 'uuid-game-2',
            entityName: 'Portal 2',
            editUrl: '/games/titles/uuid-game-2',
            listUrl: '/games',
        },
    },
    {
        description: 'creates game with metadata selection via wizard',
        entityType: 'game',
        body: {name: 'Hades', type: 'video_game', platform: 'PC', copyType: 'digital_license', metadataProviderId: 'igdb', metadataExternalId: '12345'},
        userId: TEST_USER_ID,
        mockGameTitle: {id: 'uuid-game-3', name: 'Hades'},
        mockRelease: {id: 'uuid-release-3', gameTitleId: 'uuid-game-3', platform: 'PC'},
        mockCopy: {id: 'uuid-copy-3', gameReleaseId: 'uuid-release-3'},
        mockMetadataResult: {metadata: {name: 'Hades', description: 'A roguelike'}, providerName: 'IGDB'},
        expected: {
            entityType: 'game',
            entityId: 'uuid-game-3',
            entityName: 'Hades',
            editUrl: '/games/titles/uuid-game-3',
            listUrl: '/games',
        },
    },
];

export const submitErrorData = [
    {
        description: 'throws error for invalid entity type on submit',
        entityType: 'invalid',
        body: {name: 'Test'},
        userId: TEST_USER_ID,
        errorMessage: 'Invalid entity type',
    },
];

export const inlineLocationData = [
    {
        description: 'creates inline location',
        body: {name: 'Kitchen Cabinet', kind: 'cabinet'},
        userId: TEST_USER_ID,
        mockLocation: {id: 'uuid-loc-inline', name: 'Kitchen Cabinet'},
        expected: {id: 'uuid-loc-inline', name: 'Kitchen Cabinet'},
    },
];
