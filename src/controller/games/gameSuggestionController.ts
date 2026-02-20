/**
 * Game Suggestion Controller
 * Business logic for random game suggestions
 */

import * as gameSuggestionService from '../../modules/database/services/GameSuggestionService';
import type {GameMode, ModeWeight} from '../../modules/database/services/GameSuggestionService';
import * as platformService from '../../modules/database/services/PlatformService';
import {requireAuthenticatedUser} from '../../middleware/authMiddleware';
import {GameType} from '../../types/InventoryEnums';

export interface SuggestionFormData {
    playerCount?: string;
    includePlatforms?: string | string[];
    excludePlatforms?: string | string[];
    selectedModes?: string | string[];
    gameTypes?: string | string[];
    // Weights per mode, e.g. modeWeight_online=50, modeWeight_couch=25
    [key: string]: string | string[] | undefined;
}

const VALID_MODES: GameMode[] = ['online', 'couch', 'lan', 'physical'];

const GAME_TYPES = [
    {value: GameType.VIDEO_GAME, label: 'Video Game'},
    {value: GameType.BOARD_GAME, label: 'Board Game'},
    {value: GameType.CARD_GAME, label: 'Card Game'},
    {value: GameType.TABLETOP_RPG, label: 'Tabletop RPG'},
    {value: GameType.OTHER_PHYSICAL_GAME, label: 'Other Physical'},
];

/**
 * Parse a form field that can be a string or array into a string array.
 */
function toStringArray(value: string | string[] | undefined): string[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

/**
 * Show the suggestion wizard page
 */
export async function showSuggestionWizard(userId: number, initialCriteria?: Partial<SuggestionFormData>) {
    requireAuthenticatedUser(userId);
    
    const platforms = await platformService.getAllPlatforms(userId);
    
    return {
        platforms,
        gameTypes: GAME_TYPES,
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
    
    // Parse platforms
    const includePlatforms = toStringArray(formData.includePlatforms);
    const excludePlatforms = toStringArray(formData.excludePlatforms);
    
    // Parse game types
    const gameTypes = toStringArray(formData.gameTypes);
    
    // Parse selected modes
    const selectedModes = toStringArray(formData.selectedModes)
        .filter((m): m is GameMode => VALID_MODES.includes(m as GameMode));
    
    // Parse mode weights from form fields  (modeWeight_online, modeWeight_couch, etc.)
    const modeWeights: ModeWeight[] = [];
    for (const mode of VALID_MODES) {
        const raw = formData[`modeWeight_${mode}`];
        const val = typeof raw === 'string' ? parseInt(raw, 10) : undefined;
        if (val !== undefined && !isNaN(val) && val > 0) {
            modeWeights.push({mode, weight: val});
        }
    }
    
    // Build criteria
    const criteria = {
        ownerId: userId,
        playerCount: playerCount && !isNaN(playerCount) ? playerCount : undefined,
        includePlatforms: includePlatforms.length > 0 ? includePlatforms : undefined,
        excludePlatforms: excludePlatforms.length > 0 ? excludePlatforms : undefined,
        selectedModes: selectedModes.length > 0 ? selectedModes : undefined,
        modeWeights: modeWeights.length > 0 ? modeWeights : undefined,
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
        gameTypes: GAME_TYPES,
    };
}
