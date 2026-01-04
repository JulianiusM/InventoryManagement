/**
 * Tests for itemController
 */

import {createItemData, createItemErrorData, moveItemData, mapBarcodeData, mapBarcodeErrorData} from '../data/controller/itemData';
import {setupMock, verifyResultContains, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Mock the services
jest.mock('../../src/modules/database/services/ItemService');
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/BarcodeService');
jest.mock('../../src/modules/database/services/ItemMovementService');

import * as itemService from '../../src/modules/database/services/ItemService';
import * as locationService from '../../src/modules/database/services/LocationService';
import * as barcodeService from '../../src/modules/database/services/BarcodeService';
import * as itemMovementService from '../../src/modules/database/services/ItemMovementService';
import * as itemController from '../../src/controller/itemController';

describe('itemController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createItem', () => {
        test.each(createItemData)('$description', async ({input, ownerId, expected}) => {
            const mockCreatedItem = {id: 1, ...expected};
            setupMock(itemService.createItem as jest.Mock, mockCreatedItem);
            setupMock(itemMovementService.recordMovement as jest.Mock, {id: 1});

            const result = await itemController.createItem(input, ownerId);

            expect(result).toBeDefined();
            expect(result.id).toBe(1);
            expect(itemService.createItem).toHaveBeenCalled();
        });

        test.each(createItemErrorData)('$description', async ({input, errorMessage}) => {
            await verifyThrowsError(
                () => itemController.createItem(input),
                errorMessage
            );
        });
    });

    describe('moveItem', () => {
        test.each(moveItemData)('$description', async ({itemId, existingItem, input, expectedLocationId, expectedNote}) => {
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(itemService.updateItemLocation as jest.Mock, undefined);
            setupMock(itemMovementService.recordMovement as jest.Mock, {id: 1});

            await itemController.moveItem(itemId, input, 1);

            expect(itemService.updateItemLocation).toHaveBeenCalledWith(itemId, expectedLocationId);
            expect(itemMovementService.recordMovement).toHaveBeenCalledWith(
                itemId,
                existingItem.locationId,
                expectedLocationId,
                expectedNote,
                1
            );
        });

        test('throws error when item not found', async () => {
            setupMock(itemService.getItemById as jest.Mock, null);

            await verifyThrowsError(
                () => itemController.moveItem(999, {locationId: '1'}),
                'Item not found'
            );
        });

        test('does nothing when location unchanged', async () => {
            const existingItem = {id: 1, name: 'Test', locationId: 5};
            setupMock(itemService.getItemById as jest.Mock, existingItem);

            await itemController.moveItem(1, {locationId: '5'});

            expect(itemService.updateItemLocation).not.toHaveBeenCalled();
            expect(itemMovementService.recordMovement).not.toHaveBeenCalled();
        });
    });

    describe('mapBarcodeToItem', () => {
        test.each(mapBarcodeData)('$description', async ({itemId, code, existingItem, existingBarcode, expected}) => {
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(barcodeService.getBarcodeByCode as jest.Mock, existingBarcode);
            setupMock(barcodeService.mapBarcodeToItem as jest.Mock, {id: 1, code, itemId});

            const result = await itemController.mapBarcodeToItem(itemId, code);

            verifyResultContains(result, expected);
        });

        test.each(mapBarcodeErrorData)('$description', async ({itemId, code, errorMessage}) => {
            await verifyThrowsError(
                () => itemController.mapBarcodeToItem(itemId, code),
                errorMessage
            );
        });

        test('returns failure when barcode mapped to different item', async () => {
            const existingItem = {id: 1, name: 'Item 1'};
            const existingBarcode = {
                code: '123',
                itemId: 2,
                item: {id: 2, name: 'Item 2'},
            };
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(barcodeService.getBarcodeByCode as jest.Mock, existingBarcode);

            const result = await itemController.mapBarcodeToItem(1, '123');

            expect(result.success).toBe(false);
            expect(result.message).toContain('already mapped');
        });
    });

    describe('listItems', () => {
        test('returns items and locations', async () => {
            const mockItems = [{id: 1, name: 'Item 1'}, {id: 2, name: 'Item 2'}];
            const mockLocations = [{id: 1, name: 'Location 1'}];
            setupMock(itemService.getAllItems as jest.Mock, mockItems);
            setupMock(locationService.getAllLocations as jest.Mock, mockLocations);

            const result = await itemController.listItems();

            expect(result.items).toEqual(mockItems);
            expect(result.locations).toEqual(mockLocations);
        });
    });

    describe('getItemDetail', () => {
        test('returns item with related data', async () => {
            const mockItem = {id: 1, name: 'Test Item'};
            const mockLocations = [{id: 1, name: 'Location 1'}];
            const mockBarcodes = [{id: 1, code: '123'}];
            const mockMovements = [{id: 1, fromLocationId: null, toLocationId: 1}];

            setupMock(itemService.getItemById as jest.Mock, mockItem);
            setupMock(locationService.getAllLocations as jest.Mock, mockLocations);
            setupMock(barcodeService.getBarcodesByItemId as jest.Mock, mockBarcodes);
            setupMock(itemMovementService.getMovementsByItemId as jest.Mock, mockMovements);

            const result = await itemController.getItemDetail(1);

            expect(result.item).toEqual(mockItem);
            expect(result.locations).toEqual(mockLocations);
            expect(result.barcodes).toEqual(mockBarcodes);
            expect(result.movements).toEqual(mockMovements);
        });

        test('throws error when item not found', async () => {
            setupMock(itemService.getItemById as jest.Mock, null);

            await verifyThrowsError(
                () => itemController.getItemDetail(999),
                'Item not found'
            );
        });
    });
});
