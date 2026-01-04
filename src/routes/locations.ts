import express, {Request, Response} from 'express';
import * as locationController from '../controller/locationController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';
import {requireAuth} from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all location routes
router.use(requireAuth);

// List all locations (only user's locations)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await locationController.listLocations(ownerId);
    renderer.renderWithData(res, 'locations/list', data);
}));

// Create location
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    await locationController.createLocation(req.body, ownerId);
    req.flash('success', 'Location created successfully');
    res.redirect('/locations');
}));

// Get location detail (with ownership check)
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await locationController.getLocationDetail(id, userId);
    renderer.renderWithData(res, 'locations/detail', data);
}));

// Update location (with ownership check)
router.post('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await locationController.updateLocation(id, req.body, userId);
    req.flash('success', 'Location updated successfully');
    res.redirect(`/locations/${id}`);
}));

// Delete location (with ownership check)
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await locationController.deleteLocation(id, userId);
    req.flash('success', 'Location deleted successfully');
    res.redirect('/locations');
}));

export default router;
