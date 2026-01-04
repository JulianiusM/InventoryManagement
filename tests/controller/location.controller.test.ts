/**
 * Tests for locationController
 */

import {createLocationData, createLocationErrorData, updateLocationData, updateLocationErrorData} from '../data/controller/locationData';
import {setupMock, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Mock the services
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/ItemService');

import * as locationService from '../../src/modules/database/services/LocationService';
import * as itemService from '../../src/modules/database/services/ItemService';
import * as locationController from '../../src/controller/locationController';

describe('locationController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createLocation', () => {
        test.each(createLocationData)('$description', async ({input, expected, parentExists}) => {
            if (input.parentId && parentExists) {
                setupMock(locationService.getLocationById as jest.Mock, {id: Number(input.parentId), name: 'Parent'});
            } else if (input.parentId) {
                setupMock(locationService.getLocationById as jest.Mock, null);
            }
            setupMock(locationService.getLocationByQrCode as jest.Mock, null);
            setupMock(locationService.createLocation as jest.Mock, {id: 1, ...expected});

            const result = await locationController.createLocation(input);

            expect(result).toBeDefined();
            expect(result.id).toBe(1);
            expect(locationService.createLocation).toHaveBeenCalled();
        });

        test.each(createLocationErrorData)('$description', async ({input, errorMessage, parentExists}) => {
            if (input.parentId !== undefined) {
                if (parentExists) {
                    setupMock(locationService.getLocationById as jest.Mock, {id: Number(input.parentId), name: 'Parent'});
                } else {
                    setupMock(locationService.getLocationById as jest.Mock, null);
                }
            }

            await verifyThrowsError(
                () => locationController.createLocation(input),
                errorMessage
            );
        });

        test('throws error for duplicate QR code', async () => {
            setupMock(locationService.getLocationByQrCode as jest.Mock, {id: 2, qrCode: 'LOC:existing'});

            await verifyThrowsError(
                () => locationController.createLocation({name: 'Test', qrCode: 'LOC:existing'}),
                'QR code already in use'
            );
        });
    });

    describe('updateLocation', () => {
        test.each(updateLocationData)('$description', async ({locationId, existingLocation, input, expected}) => {
            setupMock(locationService.getLocationById as jest.Mock, existingLocation);
            setupMock(locationService.updateLocation as jest.Mock, undefined);

            await locationController.updateLocation(locationId, input);

            expect(locationService.updateLocation).toHaveBeenCalledWith(
                locationId,
                expect.objectContaining(expected)
            );
        });

        test.each(updateLocationErrorData)('$description', async ({locationId, existingLocation, input, errorMessage}) => {
            setupMock(locationService.getLocationById as jest.Mock, existingLocation);

            await verifyThrowsError(
                () => locationController.updateLocation(locationId, input),
                errorMessage
            );
        });
    });

    describe('listLocations', () => {
        test('returns locations and tree', async () => {
            const mockLocations = [{id: 1, name: 'Room 1'}, {id: 2, name: 'Shelf 1'}];
            const mockTree = [{id: 1, name: 'Room 1', childrenNodes: [{id: 2, name: 'Shelf 1'}]}];
            setupMock(locationService.getAllLocations as jest.Mock, mockLocations);
            setupMock(locationService.getLocationTree as jest.Mock, mockTree);

            const result = await locationController.listLocations();

            expect(result.locations).toEqual(mockLocations);
            expect(result.tree).toEqual(mockTree);
        });
    });

    describe('getLocationDetail', () => {
        test('returns location with items', async () => {
            const mockLocation = {id: 1, name: 'Test Location'};
            const mockItems = [{id: 1, name: 'Item 1', locationId: 1}];
            const mockAllLocations = [{id: 1, name: 'Test Location'}];

            setupMock(locationService.getLocationById as jest.Mock, mockLocation);
            setupMock(itemService.getItemsByLocation as jest.Mock, mockItems);
            setupMock(locationService.getAllLocations as jest.Mock, mockAllLocations);

            const result = await locationController.getLocationDetail(1);

            expect(result.location).toEqual(mockLocation);
            expect(result.items).toEqual(mockItems);
            expect(result.locations).toEqual(mockAllLocations);
        });

        test('throws error when location not found', async () => {
            setupMock(locationService.getLocationById as jest.Mock, null);

            await verifyThrowsError(
                () => locationController.getLocationDetail(999),
                'Location not found'
            );
        });
    });
});
