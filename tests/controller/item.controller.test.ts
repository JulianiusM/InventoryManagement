/**
 * Tests for itemController
 */

import {createItemData, createItemErrorData, moveItemData, mapBarcodeData, mapBarcodeErrorData, TEST_USER_ID} from '../data/controller/itemData';
import {setupMock, verifyResultContains, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Mock the services
jest.mock('../../src/modules/database/services/ItemService');
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/BarcodeService');
jest.mock('../../src/modules/database/services/ItemMovementService');
jest.mock('../../src/modules/database/services/LoanService');

import * as itemService from '../../src/modules/database/services/ItemService';
import * as locationService from '../../src/modules/database/services/LocationService';
import * as barcodeService from '../../src/modules/database/services/BarcodeService';
import * as itemMovementService from '../../src/modules/database/services/ItemMovementService';
import * as loanService from '../../src/modules/database/services/LoanService';
import * as itemController from '../../src/controller/itemController';

describe('itemController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createItem', () => {
        test.each(createItemData)('$description', async ({input, ownerId, expected}) => {
            const mockCreatedItem = {id: 'uuid-1', ...expected};
            setupMock(itemService.createItem as jest.Mock, mockCreatedItem);
            setupMock(itemMovementService.recordMovement as jest.Mock, {id: 'uuid-m1'});

            const result = await itemController.createItem(input, ownerId);

            expect(result).toBeDefined();
            expect(result.id).toBe('uuid-1');
            expect(itemService.createItem).toHaveBeenCalled();
        });

        test.each(createItemErrorData)('$description', async ({input, ownerId, errorMessage}) => {
            await verifyThrowsError(
                () => itemController.createItem(input, ownerId),
                errorMessage
            );
        });
    });

    describe('moveItem', () => {
        test.each(moveItemData)('$description', async ({itemId, existingItem, input, userId, expectedLocationId, expectedNote}) => {
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(itemService.updateItemLocation as jest.Mock, undefined);
            setupMock(itemMovementService.recordMovement as jest.Mock, {id: 'uuid-m1'});

            await itemController.moveItem(itemId, input, userId);

            expect(itemService.updateItemLocation).toHaveBeenCalledWith(itemId, expectedLocationId);
            expect(itemMovementService.recordMovement).toHaveBeenCalledWith(
                itemId,
                existingItem.locationId,
                expectedLocationId,
                expectedNote,
                userId
            );
        });

        test('throws error when item not found', async () => {
            setupMock(itemService.getItemById as jest.Mock, null);

            await verifyThrowsError(
                () => itemController.moveItem('uuid-999', {locationId: 'uuid-1'}, TEST_USER_ID),
                'Item not found'
            );
        });

        test('does nothing when location unchanged', async () => {
            const existingItem = {id: 'uuid-1', name: 'Test', locationId: 'uuid-5', ownerId: TEST_USER_ID};
            setupMock(itemService.getItemById as jest.Mock, existingItem);

            await itemController.moveItem('uuid-1', {locationId: 'uuid-5'}, TEST_USER_ID);

            expect(itemService.updateItemLocation).not.toHaveBeenCalled();
            expect(itemMovementService.recordMovement).not.toHaveBeenCalled();
        });
    });

    describe('mapBarcodeToItem', () => {
        test.each(mapBarcodeData)('$description', async ({itemId, code, userId, existingItem, existingBarcode, expected}) => {
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(barcodeService.getBarcodeByCode as jest.Mock, existingBarcode);
            setupMock(barcodeService.mapBarcodeToItem as jest.Mock, {id: 'uuid-b1', code, itemId});

            const result = await itemController.mapBarcodeToItem(itemId, code, 'unknown', userId);

            verifyResultContains(result, expected);
        });

        test.each(mapBarcodeErrorData)('$description', async ({itemId, code, userId, errorMessage}) => {
            await verifyThrowsError(
                () => itemController.mapBarcodeToItem(itemId, code, 'unknown', userId),
                errorMessage
            );
        });

        test('returns failure when barcode mapped to different item', async () => {
            const existingItem = {id: 'uuid-1', name: 'Item 1', ownerId: TEST_USER_ID};
            const existingBarcode = {
                code: '123',
                itemId: 'uuid-2',
                item: {id: 'uuid-2', name: 'Item 2'},
            };
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(barcodeService.getBarcodeByCode as jest.Mock, existingBarcode);

            const result = await itemController.mapBarcodeToItem('uuid-1', '123', 'unknown', TEST_USER_ID);

            expect(result.success).toBe(false);
            expect(result.message).toContain('already mapped');
        });
    });

    describe('listItems', () => {
        test('returns items and locations', async () => {
            const mockItems = [{id: 'uuid-1', name: 'Item 1'}, {id: 'uuid-2', name: 'Item 2'}];
            const mockLocations = [{id: 'uuid-l1', name: 'Location 1'}];
            setupMock(itemService.getAllItems as jest.Mock, mockItems);
            setupMock(locationService.getAllLocations as jest.Mock, mockLocations);

            const result = await itemController.listItems(TEST_USER_ID);

            expect(result.items).toEqual(mockItems);
            expect(result.locations).toEqual(mockLocations);
        });
    });

    describe('getItemDetail', () => {
        test('returns item with related data', async () => {
            const mockItem = {id: 'uuid-1', name: 'Test Item', ownerId: TEST_USER_ID};
            const mockLocations = [{id: 'uuid-l1', name: 'Location 1'}];
            const mockBarcodes = [{id: 'uuid-b1', code: '123'}];
            const mockMovements = [{id: 'uuid-m1', fromLocationId: null, toLocationId: 'uuid-l1'}];
            const mockLoans = [{id: 'uuid-loan1', itemId: 'uuid-1', direction: 'lend', status: 'active'}];

            setupMock(itemService.getItemById as jest.Mock, mockItem);
            setupMock(locationService.getAllLocations as jest.Mock, mockLocations);
            setupMock(barcodeService.getBarcodesByItemId as jest.Mock, mockBarcodes);
            setupMock(itemMovementService.getMovementsByItemId as jest.Mock, mockMovements);
            setupMock(loanService.getLoansByItemId as jest.Mock, mockLoans);

            const result = await itemController.getItemDetail('uuid-1', TEST_USER_ID);

            expect(result.item).toEqual(mockItem);
            expect(result.locations).toEqual(mockLocations);
            expect(result.barcodes).toEqual(mockBarcodes);
            expect(result.movements).toEqual(mockMovements);
            expect(result.loans).toEqual(mockLoans);
        });

        test('throws error when item not found', async () => {
            setupMock(itemService.getItemById as jest.Mock, null);

            await verifyThrowsError(
                () => itemController.getItemDetail('uuid-999', TEST_USER_ID),
                'Item not found'
            );
        });
    });
});
