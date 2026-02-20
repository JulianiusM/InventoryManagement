import express, {Request, Response} from 'express';
import * as wizardController from '../controller/wizardController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';
import {requireAuth} from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all wizard routes
router.use(requireAuth);

// Wizard chooser – select entity type
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const data = await wizardController.showWizardChooser(userId);
    renderer.renderWithData(res, 'wizard/chooser', data);
}));

// AJAX endpoints must come BEFORE /:entityType to avoid matching 'api' as entity type

// Inline location creation (AJAX endpoint)
router.post('/api/inline-location', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const result = await wizardController.createInlineLocation(req.body, userId);
    res.json(result);
}));

// Game metadata search (AJAX endpoint)
router.get('/api/search-metadata', asyncHandler(async (req: Request, res: Response) => {
    const query = req.query.q as string || '';
    const gameType = req.query.type as string || undefined;
    const results = await wizardController.searchGameMetadata(query, gameType);
    res.json(results);
}));

// Fetch full game metadata for prefilling (AJAX endpoint)
router.get('/api/fetch-metadata', asyncHandler(async (req: Request, res: Response) => {
    const providerId = req.query.provider as string || '';
    const externalId = req.query.externalId as string || '';
    const result = await wizardController.fetchGameMetadata(providerId, externalId);
    res.json(result);
}));

// Wizard form – show step-based form for specific entity type
router.get('/:entityType', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const data = await wizardController.showWizardForm(req.params.entityType, userId);
    renderer.renderWithData(res, 'wizard/form', data);
}));

// Submit wizard – create entity and redirect to success
router.post('/:entityType', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const result = await wizardController.submitWizard(req.params.entityType, req.body, userId);
    req.flash('success', `${result.entityName} created successfully`);
    renderer.renderWithData(res, 'wizard/success', result);
}));

export default router;
