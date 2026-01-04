/**
 * Test data for item controller tests
 */

export const createItemData = [
    {
        description: 'creates item with valid data',
        input: {name: 'Test Item', type: 'book', description: 'A test book'},
        ownerId: 1,
        expected: {name: 'Test Item', type: 'book', description: 'A test book', ownerId: 1},
    },
    {
        description: 'creates item with minimal data',
        input: {name: 'Minimal Item'},
        ownerId: 1,
        expected: {name: 'Minimal Item', type: 'other', description: null, ownerId: 1},
    },
    {
        description: 'creates item with location',
        input: {name: 'Located Item', type: 'tool', locationId: '5'},
        ownerId: 2,
        expected: {name: 'Located Item', type: 'tool', locationId: 5, ownerId: 2},
    },
];

export const createItemErrorData = [
    {
        description: 'throws error when name is empty',
        input: {name: ''},
        errorMessage: 'Name is required',
    },
    {
        description: 'throws error when name is whitespace only',
        input: {name: '   '},
        errorMessage: 'Name is required',
    },
];

export const moveItemData = [
    {
        description: 'moves item to new location',
        itemId: 1,
        existingItem: {id: 1, name: 'Test', locationId: 2},
        input: {locationId: '5', note: 'Moved to storage'},
        expectedLocationId: 5,
        expectedNote: 'Moved to storage',
    },
    {
        description: 'moves item to unassigned',
        itemId: 1,
        existingItem: {id: 1, name: 'Test', locationId: 3},
        input: {locationId: ''},
        expectedLocationId: null,
        expectedNote: null,
    },
];

export const mapBarcodeData = [
    {
        description: 'maps new barcode to item',
        itemId: 1,
        code: '1234567890123',
        existingItem: {id: 1, name: 'Test Item'},
        existingBarcode: null,
        expected: {success: true, message: 'Barcode mapped successfully'},
    },
    {
        description: 'remaps barcode already assigned to same item',
        itemId: 1,
        code: '1234567890123',
        existingItem: {id: 1, name: 'Test Item'},
        existingBarcode: {code: '1234567890123', itemId: 1, item: {id: 1, name: 'Test Item'}},
        expected: {success: true, message: 'Barcode mapped successfully'},
    },
];

export const mapBarcodeErrorData = [
    {
        description: 'rejects empty barcode',
        itemId: 1,
        code: '',
        errorMessage: 'Barcode is required',
    },
    {
        description: 'rejects whitespace barcode',
        itemId: 1,
        code: '   ',
        errorMessage: 'Barcode is required',
    },
];
