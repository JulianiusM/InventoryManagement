/**
 * Game Suggestion Controller
 * Business logic for random game suggestions
 */

import * as gameSuggestionService from '../../modules/database/services/GameSuggestionService';
import * as platformService from '../../modules/database/services/PlatformService';
import {requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {GameType} from '../../types/InventoryEnums';

export interface SuggestionFormData {
    playerCount?: string;
    includePlatforms?: string | string[];
    excludePlatforms?: string | string[];
    selectedModes?: string | string[];
    gameTypes?: string | string[];
}

/**
 * Show the suggestion wizard page
 */
export async function showSuggestionWizard(userId: number, initialCriteria?: Partial<SuggestionFormData>) {
    requireAuthenticatedUser(userId);
    
    // Get all platforms for selection
    const platforms = await platformService.getAllPlatforms(userId);
    
    const gameTypes = [
        {value: GameType.VIDEO_GAME, label: 'Video Game'},
        {value: GameType.BOARD_GAME, label: 'Board Game'},
        {value: GameType.CARD_GAME, label: 'Card Game'},
        {value: GameType.TABLETOP_RPG, label: 'Tabletop RPG'},
        {value: GameType.OTHER_PHYSICAL_GAME, label: 'Other Physical'},
    ];
    
    return {
        platforms,
        gameTypes,
        criteria: initialCriteria || {},
    };
}

/**
 * Get a random game suggestion based on form data
 */
export async function getGameSuggestion(formData: SuggestionFormData, userId: number) {
    requireAuthenticatedUser(userId);
    
    // Parse player count
    const playerCount = formData.playerCount ? parseInt(formData.playerCount, 10) : undefined;
    
    // Parse platforms (can be string or array from form)
    const includePlatforms = formData.includePlatforms 
        ? (Array.isArray(formData.includePlatforms) ? formData.includePlatforms : [formData.includePlatforms])
        : [];
    
    const excludePlatforms = formData.excludePlatforms
        ? (Array.isArray(formData.excludePlatforms) ? formData.excludePlatforms : [formData.excludePlatforms])
        : [];
    
    // Parse game types
    const gameTypes = formData.gameTypes
        ? (Array.isArray(formData.gameTypes) ? formData.gameTypes : [formData.gameTypes])
        : [];
    
    // Parse selected modes (can be string or array from form)
    const selectedModes = formData.selectedModes
        ? (Array.isArray(formData.selectedModes) ? formData.selectedModes : [formData.selectedModes])
            .filter((m): m is 'online' | 'couch' | 'lan' | 'physical' => 
                ['online', 'couch', 'lan', 'physical'].includes(m))
        : undefined;
    
    // Build criteria
    const criteria = {
        ownerId: userId,
        playerCount: playerCount && !isNaN(playerCount) ? playerCount : undefined,
        includePlatforms: includePlatforms.length > 0 ? includePlatforms : undefined,
        excludePlatforms: excludePlatforms.length > 0 ? excludePlatforms : undefined,
        selectedModes: selectedModes && selectedModes.length > 0 ? selectedModes : undefined,
        gameTypes: gameTypes.length > 0 ? gameTypes : undefined,
    };
    
    // Get suggestion
    const suggestion = await gameSuggestionService.getRandomGameSuggestion(criteria);
    
    // Get platforms for display on result page
    const platforms = await platformService.getAllPlatforms(userId);
    
    return {
        suggestion,
        criteria: formData,
        platforms,
        gameTypes: [
            {value: GameType.VIDEO_GAME, label: 'Video Game'},
            {value: GameType.BOARD_GAME, label: 'Board Game'},
            {value: GameType.CARD_GAME, label: 'Card Game'},
            {value: GameType.TABLETOP_RPG, label: 'Tabletop RPG'},
            {value: GameType.OTHER_PHYSICAL_GAME, label: 'Other Physical'},
        ],
    };
}
