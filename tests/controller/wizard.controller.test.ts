/**
 * Tests for wizardController
 */

import {
    wizardChooserData,
    wizardFormData,
    wizardFormErrorData,
    submitLocationData,
    submitItemData,
    submitGameData,
    submitErrorData,
    inlineLocationData,
} from '../data/controller/wizardData';
import {setupMock, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Mock the dependencies
jest.mock('../../src/modules/database/services/LocationService');
jest.mock('../../src/modules/database/services/ItemService');
jest.mock('../../src/modules/database/services/BarcodeService');
jest.mock('../../src/modules/database/services/ItemMovementService');
jest.mock('../../src/modules/database/services/LoanService');
jest.mock('../../src/modules/database/services/PlatformService');
jest.mock('../../src/modules/database/services/GameTitleService');
jest.mock('../../src/modules/database/services/GameReleaseService');
jest.mock('../../src/modules/database/services/SyncJobService');
jest.mock('../../src/modules/database/services/GameValidationService');
jest.mock('../../src/modules/games/sync/MetadataFetcher');

import * as locationService from '../../src/modules/database/services/LocationService';
import * as itemService from '../../src/modules/database/services/ItemService';
import * as itemMovementService from '../../src/modules/database/services/ItemMovementService';
import * as platformService from '../../src/modules/database/services/PlatformService';
import * as gameTitleService from '../../src/modules/database/services/GameTitleService';
import * as wizardController from '../../src/controller/wizardController';

describe('wizardController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('showWizardChooser', () => {
        test(wizardChooserData.description, async () => {
            const result = await wizardController.showWizardChooser(wizardChooserData.userId);

            expect(result.entityTypes).toBeDefined();
            expect(result.entityTypes.map(et => et.type)).toEqual(wizardChooserData.expectedTypes);
        });
    });

    describe('showWizardForm', () => {
        test.each(wizardFormData)('$description', async ({entityType, userId, expectedEntityType, expectedStepCount}) => {
            // Setup mocks for prefetch data
            setupMock(locationService.getAllLocations as jest.Mock, []);
            setupMock(platformService.getAllPlatforms as jest.Mock, []);

            const result = await wizardController.showWizardForm(entityType, userId);

            expect(result.entityType).toBe(expectedEntityType);
            expect(result.definition.steps).toHaveLength(expectedStepCount);
        });

        test.each(wizardFormErrorData)('$description', async ({entityType, userId, errorMessage}) => {
            await verifyThrowsError(
                () => wizardController.showWizardForm(entityType, userId),
                errorMessage
            );
        });
    });

    describe('submitWizard', () => {
        test.each(submitLocationData)('$description', async ({entityType, body, userId, mockLocation, expected}) => {
            setupMock(locationService.getLocationByQrCode as jest.Mock, null);
            setupMock(locationService.createLocation as jest.Mock, mockLocation);

            const result = await wizardController.submitWizard(entityType, body, userId);

            expect(result).toEqual(expected);
            expect(locationService.createLocation).toHaveBeenCalled();
        });

        test.each(submitItemData)('$description', async ({entityType, body, userId, mockItem, mockNewLocation, expected}) => {
            // Mock for inline location creation if needed
            if (mockNewLocation) {
                setupMock(locationService.getLocationByQrCode as jest.Mock, null);
                setupMock(locationService.createLocation as jest.Mock, mockNewLocation);
            }

            setupMock(itemService.createItem as jest.Mock, mockItem);
            setupMock(itemMovementService.recordMovement as jest.Mock, undefined);

            const result = await wizardController.submitWizard(entityType, body, userId);

            expect(result).toEqual(expected);
            expect(itemService.createItem).toHaveBeenCalled();

            // Verify inline location was created if specified
            if (mockNewLocation) {
                expect(locationService.createLocation).toHaveBeenCalled();
            }
        });

        test.each(submitGameData)('$description', async ({entityType, body, userId, mockGameTitle, expected}) => {
            setupMock(gameTitleService.createGameTitle as jest.Mock, mockGameTitle);

            const result = await wizardController.submitWizard(entityType, body, userId);

            expect(result).toEqual(expected);
            expect(gameTitleService.createGameTitle).toHaveBeenCalled();
        });

        test.each(submitErrorData)('$description', async ({entityType, body, userId, errorMessage}) => {
            await verifyThrowsError(
                () => wizardController.submitWizard(entityType, body, userId),
                errorMessage
            );
        });
    });

    describe('createInlineLocation', () => {
        test.each(inlineLocationData)('$description', async ({body, userId, mockLocation, expected}) => {
            setupMock(locationService.getLocationByQrCode as jest.Mock, null);
            setupMock(locationService.createLocation as jest.Mock, mockLocation);

            const result = await wizardController.createInlineLocation(body, userId);

            expect(result).toEqual(expected);
            expect(locationService.createLocation).toHaveBeenCalled();
        });
    });
});
