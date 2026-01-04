/**
 * Test data for location controller tests
 */

export const createLocationData = [
    {
        description: 'creates location with valid data',
        input: {name: 'Living Room', kind: 'room'},
        expected: {name: 'Living Room', kind: 'room', parentId: null, qrCode: null},
    },
    {
        description: 'creates location with parent',
        input: {name: 'Shelf A', kind: 'shelf', parentId: '1'},
        parentExists: true,
        expected: {name: 'Shelf A', kind: 'shelf', parentId: 1, qrCode: null},
    },
    {
        description: 'creates location with QR code',
        input: {name: 'Box 1', kind: 'box', qrCode: 'LOC:box-1'},
        expected: {name: 'Box 1', kind: 'box', parentId: null, qrCode: 'LOC:box-1'},
    },
];

export const createLocationErrorData = [
    {
        description: 'throws error when name is empty',
        input: {name: ''},
        errorMessage: 'Name is required',
    },
    {
        description: 'throws error when parent not found',
        input: {name: 'Child', parentId: '999'},
        parentExists: false,
        errorMessage: 'Parent location not found',
    },
];

export const updateLocationData = [
    {
        description: 'updates location name',
        locationId: 1,
        existingLocation: {id: 1, name: 'Old Name', kind: 'room'},
        input: {name: 'New Name'},
        expected: {name: 'New Name'},
    },
    {
        description: 'updates location kind',
        locationId: 1,
        existingLocation: {id: 1, name: 'Storage', kind: 'room'},
        input: {kind: 'shelf'},
        expected: {kind: 'shelf'},
    },
];

export const updateLocationErrorData = [
    {
        description: 'throws error when location not found',
        locationId: 999,
        existingLocation: null,
        input: {name: 'New Name'},
        errorMessage: 'Location not found',
    },
    {
        description: 'prevents self-referencing parent',
        locationId: 1,
        existingLocation: {id: 1, name: 'Test', kind: 'room'},
        input: {parentId: '1'},
        errorMessage: 'Location cannot be its own parent',
    },
];
