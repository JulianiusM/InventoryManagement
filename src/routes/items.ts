import express, {Request, Response} from 'express';
import * as itemController from '../controller/itemController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';

const router = express.Router();

// List all items
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user?.id;
    const data = await itemController.listItems(ownerId);
    renderer.renderWithData(res, 'items/list', data);
}));

// Create item
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user?.id;
    await itemController.createItem(req.body, ownerId);
    req.flash('success', 'Item created successfully');
    res.redirect('/items');
}));

// Get item detail
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const data = await itemController.getItemDetail(id);
    renderer.renderWithData(res, 'items/detail', data);
}));

// Move item to new location
router.post('/:id/move', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const userId = req.session.user?.id;
    await itemController.moveItem(id, req.body, userId);
    req.flash('success', 'Item moved successfully');
    res.redirect(`/items/${id}`);
}));

export default router;
