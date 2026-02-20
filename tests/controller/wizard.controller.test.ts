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
jest.mock('../../src/modules/database/services/ExternalAccountService');
jest.mock('../../src/modules/database/services/SyncJobService');
jest.mock('../../src/modules/database/services/GameValidationService');
jest.mock('../../src/modules/games/sync/MetadataFetcher');

import * as locationService from '../../src/modules/database/services/LocationService';
import * as itemService from '../../src/modules/database/services/ItemService';
import * as itemMovementService from '../../src/modules/database/services/ItemMovementService';
import * as platformService from '../../src/modules/database/services/PlatformService';
import * as externalAccountService from '../../src/modules/database/services/ExternalAccountService';
import * as gameTitleService from '../../src/modules/database/services/GameTitleService';
import * as gameReleaseService from '../../src/modules/database/services/GameReleaseService';
import * as barcodeService from '../../src/modules/database/services/BarcodeService';
import {getMetadataFetcher} from '../../src/modules/games/sync/MetadataFetcher';
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
            setupMock(externalAccountService.getAllExternalAccounts as jest.Mock, []);

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

        test.each(submitGameData)('$description', async ({entityType, body, userId, mockGameTitle, mockRelease, mockCopy, mockMetadataResult, hasBarcode, verifyCreateArgs, verifyCoverImageApplied, expected}) => {
            // Mock title creation
            setupMock(gameTitleService.createGameTitle as jest.Mock, mockGameTitle);
            // Mock release creation
            setupMock(gameTitleService.getGameTitleById as jest.Mock, {...mockGameTitle, ownerId: userId});
            setupMock(gameReleaseService.createGameRelease as jest.Mock, mockRelease);
            // Mock copy creation
            setupMock(gameReleaseService.getGameReleaseById as jest.Mock, {...mockRelease, ownerId: userId, gameTitle: mockGameTitle});
            setupMock(itemService.createGameItem as jest.Mock, mockCopy);

            // Mock barcode service for barcode mapping
            if (hasBarcode) {
                setupMock(itemService.getItemById as jest.Mock, {...mockCopy, gameCopyType: 'physical_copy', ownerId: userId});
                setupMock(barcodeService.getBarcodeByCode as jest.Mock, null);
                setupMock(barcodeService.mapBarcodeToItem as jest.Mock, {});
            }

            // Mock metadata fetcher if metadata is selected
            if (mockMetadataResult) {
                const mockFetcher = {fetchMetadataFromProvider: jest.fn().mockResolvedValue(mockMetadataResult)};
                (getMetadataFetcher as jest.Mock).mockReturnValue(mockFetcher);
                setupMock(gameTitleService.updateGameTitle as jest.Mock, undefined);
            }

            const result = await wizardController.submitWizard(entityType, body, userId);

            expect(result).toEqual(expected);
            expect(gameTitleService.createGameTitle).toHaveBeenCalled();
            expect(gameReleaseService.createGameRelease).toHaveBeenCalled();
            expect(itemService.createGameItem).toHaveBeenCalled();

            if (hasBarcode) {
                expect(barcodeService.mapBarcodeToItem).toHaveBeenCalled();
            }

            // Verify mode selection and player counts are passed correctly
            if (verifyCreateArgs) {
                expect(gameTitleService.createGameTitle).toHaveBeenCalledWith(
                    expect.objectContaining(verifyCreateArgs)
                );
            }

            // Verify metadata applies cover image without overwriting modes
            if (verifyCoverImageApplied) {
                expect(gameTitleService.updateGameTitle).toHaveBeenCalledWith(
                    mockGameTitle.id,
                    expect.objectContaining({coverImageUrl: expect.any(String)})
                );
                // Verify updateGameTitle was NOT called with mode/player overrides
                const updateCall = (gameTitleService.updateGameTitle as jest.Mock).mock.calls[0][1];
                expect(updateCall).not.toHaveProperty('supportsOnline');
                expect(updateCall).not.toHaveProperty('overallMinPlayers');
            }
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
