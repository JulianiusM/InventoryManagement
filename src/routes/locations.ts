import express, {Request, Response} from 'express';
import * as locationController from '../controller/locationController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';

const router = express.Router();

// List all locations
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const data = await locationController.listLocations();
    renderer.renderWithData(res, 'locations/list', data);
}));

// Create location
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    await locationController.createLocation(req.body);
    req.flash('success', 'Location created successfully');
    res.redirect('/locations');
}));

// Get location detail
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const data = await locationController.getLocationDetail(id);
    renderer.renderWithData(res, 'locations/detail', data);
}));

// Update location
router.post('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    await locationController.updateLocation(id, req.body);
    req.flash('success', 'Location updated successfully');
    res.redirect(`/locations/${id}`);
}));

export default router;
