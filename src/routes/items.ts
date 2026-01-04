import express, {Request, Response} from 'express';
import * as itemController from '../controller/itemController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';
import {requireAuth} from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all item routes
router.use(requireAuth);

// List all items (only user's items)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await itemController.listItems(ownerId);
    renderer.renderWithData(res, 'items/list', data);
}));

// Create item
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    await itemController.createItem(req.body, ownerId);
    req.flash('success', 'Item created successfully');
    res.redirect('/items');
}));

// Get item detail (with ownership check)
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await itemController.getItemDetail(id, userId);
    renderer.renderWithData(res, 'items/detail', data);
}));

// Update item (with ownership check)
router.post('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await itemController.updateItem(id, req.body, userId);
    req.flash('success', 'Item updated successfully');
    res.redirect(`/items/${id}`);
}));

// Move item to new location (with ownership check)
router.post('/:id/move', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await itemController.moveItem(id, req.body, userId);
    req.flash('success', 'Item moved successfully');
    res.redirect(`/items/${id}`);
}));

// Delete item (with ownership check)
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await itemController.deleteItem(id, userId);
    req.flash('success', 'Item deleted successfully');
    res.redirect('/items');
}));

export default router;
