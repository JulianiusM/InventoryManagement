/**
 * Game Suggestion Routes
 * 
 * Routes for random game suggestions
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/games';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// Show suggestion wizard
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    // Accept query parameters as initial criteria (e.g., from "Change Criteria" link)
    const initialCriteria = req.query as Record<string, any>;
    const data = await gamesController.showSuggestionWizard(userId, initialCriteria);
    renderer.renderWithData(res, 'games/suggestion-wizard', data);
}));

// Get suggestion (POST to handle form data)
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const data = await gamesController.getGameSuggestion(req.body, userId);
    renderer.renderWithData(res, 'games/suggestion-result', data);
}));

export default router;
