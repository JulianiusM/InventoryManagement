/**
 * Tests for scanController
 */

import {resolveCodeData, resolveCodeEdgeCaseData, registerBarcodeData, registerBarcodeErrorData, TEST_USER_ID} from '../data/controller/scanData';
import {setupMock, verifyResultContains} from '../keywords/common/controllerKeywords';

// Mock the services
jest.mock('../../src/modules/database/services/BarcodeService');
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/ItemService');

import * as barcodeService from '../../src/modules/database/services/BarcodeService';
import * as locationService from '../../src/modules/database/services/LocationService';
import * as itemService from '../../src/modules/database/services/ItemService';
import * as scanController from '../../src/controller/scanController';

describe('scanController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('resolveCode', () => {
        test.each(resolveCodeData)('$description', async ({code, userId, barcodeResult, locationResult, expected}) => {
            setupMock(barcodeService.getBarcodeByCode as jest.Mock, barcodeResult);
            setupMock(locationService.getLocationByQrCode as jest.Mock, locationResult);

            const result = await scanController.resolveCode(code, userId);

            verifyResultContains(result, expected);
        });

        test.each(resolveCodeEdgeCaseData)('$description', async ({code, userId, expected}) => {
            const result = await scanController.resolveCode(code, userId);

            verifyResultContains(result, expected);
        });
    });

    describe('registerUnmappedBarcode', () => {
        test.each(registerBarcodeData)('$description', async ({code, symbology, existingBarcode, expected}) => {
            setupMock(barcodeService.getBarcodeByCode as jest.Mock, existingBarcode);
            setupMock(barcodeService.createBarcode as jest.Mock, {id: 'uuid-b1', code, symbology});

            const result = await scanController.registerUnmappedBarcode(code, symbology);

            expect(result.success).toBe(expected.success);
            expect(result.message).toBe(expected.message);
        });

        test.each(registerBarcodeErrorData)('$description', async ({code, existingBarcode, expected}) => {
            if (existingBarcode !== undefined) {
                setupMock(barcodeService.getBarcodeByCode as jest.Mock, existingBarcode);
            }

            const result = await scanController.registerUnmappedBarcode(code);

            expect(result.success).toBe(expected.success);
            expect(result.message).toBe(expected.message);
        });
    });

    describe('listScanData', () => {
        test('returns items for scan page', async () => {
            const mockItems = [{id: 'uuid-1', name: 'Item 1'}, {id: 'uuid-2', name: 'Item 2'}];
            setupMock(itemService.getAllItems as jest.Mock, mockItems);

            const result = await scanController.listScanData(TEST_USER_ID);

            expect(result.items).toEqual(mockItems);
        });

        test('filters by owner when provided', async () => {
            setupMock(itemService.getAllItems as jest.Mock, []);

            await scanController.listScanData(42);

            expect(itemService.getAllItems).toHaveBeenCalledWith(42);
        });
    });
});
