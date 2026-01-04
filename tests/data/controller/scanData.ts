/**
 * Test data for scan controller tests
 */

export const resolveCodeData = [
    {
        description: 'resolves known barcode to item',
        code: '1234567890123',
        barcodeResult: {
            code: '1234567890123',
            itemId: 1,
            item: {id: 1, name: 'Test Book', type: 'book'},
        },
        locationResult: null,
        expected: {
            type: 'item',
            code: '1234567890123',
            item: {id: 1, name: 'Test Book', type: 'book'},
        },
    },
    {
        description: 'resolves location QR code',
        code: 'LOC:shelf-1',
        barcodeResult: null,
        locationResult: {id: 5, name: 'Shelf 1', kind: 'shelf'},
        expected: {
            type: 'location',
            code: 'LOC:shelf-1',
            location: {id: 5, name: 'Shelf 1', kind: 'shelf'},
        },
    },
    {
        description: 'returns unknown for unmapped barcode',
        code: '9999999999999',
        barcodeResult: {code: '9999999999999', itemId: null, item: null},
        locationResult: null,
        expected: {
            type: 'unknown',
            code: '9999999999999',
            message: 'Barcode exists but is not mapped to any item',
        },
    },
    {
        description: 'returns unknown for new code',
        code: 'NEWCODE123',
        barcodeResult: null,
        locationResult: null,
        expected: {
            type: 'unknown',
            code: 'NEWCODE123',
            message: 'Code not found in database',
        },
    },
];

export const resolveCodeEdgeCaseData = [
    {
        description: 'handles empty code',
        code: '',
        expected: {
            type: 'unknown',
            code: '',
            message: 'No code provided',
        },
    },
    {
        description: 'handles whitespace code',
        code: '   ',
        expected: {
            type: 'unknown',
            code: '',
            message: 'No code provided',
        },
    },
];

export const registerBarcodeData = [
    {
        description: 'registers new barcode',
        code: 'NEW123456',
        symbology: 'EAN13',
        existingBarcode: null,
        expected: {success: true, message: 'Barcode registered'},
    },
];

export const registerBarcodeErrorData = [
    {
        description: 'rejects empty barcode',
        code: '',
        expected: {success: false, message: 'Barcode is required'},
    },
    {
        description: 'rejects already registered barcode',
        code: 'EXISTING123',
        existingBarcode: {id: 1, code: 'EXISTING123', itemId: null},
        expected: {success: false, message: 'Barcode already registered'},
    },
    {
        description: 'rejects barcode already mapped to item',
        code: 'MAPPED123',
        existingBarcode: {id: 2, code: 'MAPPED123', itemId: 5},
        expected: {success: false, message: 'Barcode already mapped to an item'},
    },
];
