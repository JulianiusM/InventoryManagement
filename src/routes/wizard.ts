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

// Inline location creation (AJAX endpoint)
router.post('/api/inline-location', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const result = await wizardController.createInlineLocation(req.body, userId);
    res.json(result);
}));

export default router;
