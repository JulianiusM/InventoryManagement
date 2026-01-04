/**
 * Test data for location controller tests
 */

export const TEST_USER_ID = 1;

export const createLocationData = [
    {
        description: 'creates location with valid data',
        input: {name: 'Living Room', kind: 'room'},
        ownerId: TEST_USER_ID,
        expected: {name: 'Living Room', kind: 'room', parentId: null, qrCode: null},
    },
    {
        description: 'creates location with parent',
        input: {name: 'Shelf A', kind: 'shelf', parentId: 'uuid-1'},
        ownerId: TEST_USER_ID,
        parentExists: true,
        expected: {name: 'Shelf A', kind: 'shelf', parentId: 'uuid-1', qrCode: null},
    },
    {
        description: 'creates location with QR code',
        input: {name: 'Box 1', kind: 'box', qrCode: 'LOC:box-1'},
        ownerId: TEST_USER_ID,
        expected: {name: 'Box 1', kind: 'box', parentId: null, qrCode: 'LOC:box-1'},
    },
];

export const createLocationErrorData = [
    {
        description: 'throws error when name is empty',
        input: {name: ''},
        ownerId: TEST_USER_ID,
        errorMessage: 'Name is required',
    },
    {
        description: 'throws error when parent not found',
        input: {name: 'Child', parentId: 'uuid-999'},
        ownerId: TEST_USER_ID,
        parentExists: false,
        errorMessage: 'Parent location not found',
    },
];

export const updateLocationData = [
    {
        description: 'updates location name',
        locationId: 'uuid-1',
        existingLocation: {id: 'uuid-1', name: 'Old Name', kind: 'room', ownerId: TEST_USER_ID},
        input: {name: 'New Name'},
        userId: TEST_USER_ID,
        expected: {name: 'New Name'},
    },
    {
        description: 'updates location kind',
        locationId: 'uuid-1',
        existingLocation: {id: 'uuid-1', name: 'Storage', kind: 'room', ownerId: TEST_USER_ID},
        input: {kind: 'shelf'},
        userId: TEST_USER_ID,
        expected: {kind: 'shelf'},
    },
];

export const updateLocationErrorData = [
    {
        description: 'throws error when location not found',
        locationId: 'uuid-999',
        existingLocation: null,
        input: {name: 'New Name'},
        userId: TEST_USER_ID,
        errorMessage: 'Location not found',
    },
    {
        description: 'prevents self-referencing parent',
        locationId: 'uuid-1',
        existingLocation: {id: 'uuid-1', name: 'Test', kind: 'room', ownerId: TEST_USER_ID},
        input: {parentId: 'uuid-1'},
        userId: TEST_USER_ID,
        errorMessage: 'Location cannot be its own parent',
    },
];
