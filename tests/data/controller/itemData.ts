/**
 * Test data for item controller tests
 */

export const TEST_USER_ID = 1;

export const createItemData = [
    {
        description: 'creates item with valid data',
        input: {name: 'Test Item', type: 'book', description: 'A test book'},
        ownerId: TEST_USER_ID,
        expected: {name: 'Test Item', type: 'book', description: 'A test book', ownerId: TEST_USER_ID},
    },
    {
        description: 'creates item with minimal data',
        input: {name: 'Minimal Item'},
        ownerId: TEST_USER_ID,
        expected: {name: 'Minimal Item', type: 'other', description: null, ownerId: TEST_USER_ID},
    },
    {
        description: 'creates item with location',
        input: {name: 'Located Item', type: 'tool', locationId: 'uuid-5'},
        ownerId: 2,
        expected: {name: 'Located Item', type: 'tool', locationId: 'uuid-5', ownerId: 2},
    },
];

export const createItemErrorData = [
    {
        description: 'throws error when name is empty',
        input: {name: ''},
        ownerId: TEST_USER_ID,
        errorMessage: 'Name is required',
    },
    {
        description: 'throws error when name is whitespace only',
        input: {name: '   '},
        ownerId: TEST_USER_ID,
        errorMessage: 'Name is required',
    },
];

export const moveItemData = [
    {
        description: 'moves item to new location',
        itemId: 'uuid-1',
        existingItem: {id: 'uuid-1', name: 'Test', locationId: 'uuid-2', ownerId: TEST_USER_ID},
        input: {locationId: 'uuid-5', note: 'Moved to storage'},
        userId: TEST_USER_ID,
        expectedLocationId: 'uuid-5',
        expectedNote: 'Moved to storage',
    },
    {
        description: 'moves item to unassigned',
        itemId: 'uuid-1',
        existingItem: {id: 'uuid-1', name: 'Test', locationId: 'uuid-3', ownerId: TEST_USER_ID},
        input: {locationId: ''},
        userId: TEST_USER_ID,
        expectedLocationId: null,
        expectedNote: null,
    },
];

export const mapBarcodeData = [
    {
        description: 'maps new barcode to item',
        itemId: 'uuid-1',
        code: '1234567890123',
        userId: TEST_USER_ID,
        existingItem: {id: 'uuid-1', name: 'Test Item', ownerId: TEST_USER_ID},
        existingBarcode: null,
        expected: {success: true, message: 'Barcode mapped successfully'},
    },
    {
        description: 'remaps barcode already assigned to same item',
        itemId: 'uuid-1',
        code: '1234567890123',
        userId: TEST_USER_ID,
        existingItem: {id: 'uuid-1', name: 'Test Item', ownerId: TEST_USER_ID},
        existingBarcode: {code: '1234567890123', itemId: 'uuid-1', item: {id: 'uuid-1', name: 'Test Item'}},
        expected: {success: true, message: 'Barcode mapped successfully'},
    },
];

export const mapBarcodeErrorData = [
    {
        description: 'rejects empty barcode',
        itemId: 'uuid-1',
        code: '',
        userId: TEST_USER_ID,
        errorMessage: 'Barcode is required',
    },
    {
        description: 'rejects whitespace barcode',
        itemId: 'uuid-1',
        code: '   ',
        userId: TEST_USER_ID,
        errorMessage: 'Barcode is required',
    },
];
