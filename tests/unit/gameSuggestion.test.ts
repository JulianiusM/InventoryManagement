/**
 * Unit tests for Game Suggestion Controller
 */

import {showSuggestionWizard, getGameSuggestion, SuggestionFormData} from '../../src/controller/games/gameSuggestionController';
import * as gameSuggestionService from '../../src/modules/database/services/GameSuggestionService';
import * as platformService from '../../src/modules/database/services/PlatformService';
import {GameType} from '../../src/types/InventoryEnums';

// Mock the services
jest.mock('../../src/modules/database/services/GameSuggestionService');
jest.mock('../../src/modules/database/services/PlatformService');

const TEST_USER_ID = 1;

describe('GameSuggestionController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('showSuggestionWizard', () => {
        it('should return platforms and game types', async () => {
            const mockPlatforms = [
                {name: 'PC', id: '1'},
                {name: 'PS5', id: '2'},
            ];

            (platformService.getAllPlatforms as jest.Mock).mockResolvedValue(mockPlatforms);

            const result = await showSuggestionWizard(TEST_USER_ID);

            expect(result.platforms).toEqual(mockPlatforms);
            expect(result.gameTypes).toHaveLength(5);
            expect(result.gameTypes[0]).toEqual({value: GameType.VIDEO_GAME, label: 'Video Game'});
        });
    });

    describe('getGameSuggestion', () => {
        const mockPlatforms = [
            {name: 'PC', id: '1'},
            {name: 'PS5', id: '2'},
        ];

        const mockGameTitle = {
            id: '1',
            name: 'Test Game',
            type: GameType.VIDEO_GAME,
            overallMinPlayers: 1,
            overallMaxPlayers: 4,
            supportsOnline: true,
            supportsLocal: false,
            supportsPhysical: false,
        };

        beforeEach(() => {
            (platformService.getAllPlatforms as jest.Mock).mockResolvedValue(mockPlatforms);
        });

        it('should parse player count from form data', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {
                playerCount: '4',
            };

            await getGameSuggestion(formData, TEST_USER_ID);

            expect(gameSuggestionService.getRandomGameSuggestion).toHaveBeenCalledWith(
                expect.objectContaining({
                    ownerId: TEST_USER_ID,
                    playerCount: 4,
                })
            );
        });

        it('should handle invalid player count gracefully', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {
                playerCount: 'invalid',
            };

            await getGameSuggestion(formData, TEST_USER_ID);

            expect(gameSuggestionService.getRandomGameSuggestion).toHaveBeenCalledWith(
                expect.objectContaining({
                    ownerId: TEST_USER_ID,
                    playerCount: undefined,
                })
            );
        });

        it('should parse platform arrays correctly', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {
                includePlatforms: ['PC', 'PS5'],
                excludePlatforms: 'Xbox',
            };

            await getGameSuggestion(formData, TEST_USER_ID);

            expect(gameSuggestionService.getRandomGameSuggestion).toHaveBeenCalledWith(
                expect.objectContaining({
                    includePlatforms: ['PC', 'PS5'],
                    excludePlatforms: ['Xbox'],
                })
            );
        });

        it('should parse game mode filters correctly', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {
                includeOnline: 'require',
                includeLocal: 'exclude',
                includePhysical: 'any',
            };

            await getGameSuggestion(formData, TEST_USER_ID);

            expect(gameSuggestionService.getRandomGameSuggestion).toHaveBeenCalledWith(
                expect.objectContaining({
                    includeOnline: true,
                    includeLocal: false,
                    includePhysical: undefined,
                })
            );
        });

        it('should parse game types array correctly', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {
                gameTypes: [GameType.VIDEO_GAME, GameType.BOARD_GAME],
            };

            await getGameSuggestion(formData, TEST_USER_ID);

            expect(gameSuggestionService.getRandomGameSuggestion).toHaveBeenCalledWith(
                expect.objectContaining({
                    gameTypes: [GameType.VIDEO_GAME, GameType.BOARD_GAME],
                })
            );
        });

        it('should return suggestion with criteria and metadata', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {
                playerCount: '2',
            };

            const result = await getGameSuggestion(formData, TEST_USER_ID);

            expect(result.suggestion).toEqual(mockGameTitle);
            expect(result.criteria).toEqual(formData);
            expect(result.platforms).toEqual(mockPlatforms);
            expect(result.gameTypes).toHaveLength(5);
        });

        it('should handle no matching games', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(null);

            const formData: SuggestionFormData = {
                playerCount: '100',
            };

            const result = await getGameSuggestion(formData, TEST_USER_ID);

            expect(result.suggestion).toBeNull();
            expect(result.criteria).toEqual(formData);
        });

        it('should handle empty form data', async () => {
            (gameSuggestionService.getRandomGameSuggestion as jest.Mock).mockResolvedValue(mockGameTitle);

            const formData: SuggestionFormData = {};

            await getGameSuggestion(formData, TEST_USER_ID);

            expect(gameSuggestionService.getRandomGameSuggestion).toHaveBeenCalledWith(
                expect.objectContaining({
                    ownerId: TEST_USER_ID,
                    playerCount: undefined,
                    includePlatforms: undefined,
                    excludePlatforms: undefined,
                    includeOnline: undefined,
                    includeLocal: undefined,
                    includePhysical: undefined,
                    gameTypes: undefined,
                })
            );
        });
    });
});
