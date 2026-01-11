/**
 * Mapping Routes
 * 
 * Routes for game mapping queue and metadata management operations
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import {DismissalType} from '../../modules/database/services/GameTitleService';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// List metadata management page (pending mappings + metadata issues)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await gamesController.getMetadataManagementData(ownerId);
    renderer.renderWithData(res, 'games/mappings', data);
}));

// Bulk create all pending mappings
router.post('/bulk-create', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const created = await gamesController.bulkCreateMappings(userId);
    req.flash('success', `Created ${created} new game titles`);
    res.redirect('/games/mappings');
}));

// Bulk ignore all pending mappings
router.post('/bulk-ignore', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const ignored = await gamesController.bulkIgnoreMappings(userId);
    req.flash('success', `Ignored ${ignored} mappings`);
    res.redirect('/games/mappings');
}));

// Resolve mapping
router.post('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.resolveMappings(id, req.body, userId);
    req.flash('success', 'Mapping resolved');
    res.redirect('/games/mappings');
}));

// ============ Metadata Management Routes ============

// Dismiss a title from an issue type
router.post('/dismiss/:titleId', asyncHandler(async (req: Request, res: Response) => {
    const titleId = req.params.titleId;
    const userId = req.session.user!.id;
    const dismissalType = req.body.type as DismissalType;
    
    if (!['similar', 'missing_metadata', 'invalid_players'].includes(dismissalType)) {
        req.flash('error', 'Invalid dismissal type');
        return res.redirect('/games/mappings');
    }
    
    await gamesController.dismissTitle(titleId, dismissalType, userId);
    req.flash('success', 'Title dismissed');
    res.redirect('/games/mappings');
}));

// Undismiss a title from an issue type
router.post('/undismiss/:titleId', asyncHandler(async (req: Request, res: Response) => {
    const titleId = req.params.titleId;
    const userId = req.session.user!.id;
    const dismissalType = req.body.type as DismissalType;
    
    if (!['similar', 'missing_metadata', 'invalid_players'].includes(dismissalType)) {
        req.flash('error', 'Invalid dismissal type');
        return res.redirect('/games/mappings');
    }
    
    await gamesController.undismissTitle(titleId, dismissalType, userId);
    req.flash('success', 'Title restored');
    res.redirect('/games/mappings');
}));

// Reset all dismissals (global reset)
router.post('/reset-dismissals', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const dismissalType = req.body.type as DismissalType | undefined;
    
    // Validate type if provided
    if (dismissalType && !['similar', 'missing_metadata', 'invalid_players'].includes(dismissalType)) {
        req.flash('error', 'Invalid dismissal type');
        return res.redirect('/games/mappings');
    }
    
    const affected = await gamesController.resetDismissals(userId, dismissalType);
    req.flash('success', `Reset dismissals for ${affected} title(s)`);
    res.redirect('/games/mappings');
}));

export default router;
