import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as itemController from '../../controller/itemController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all item API routes
router.use(requireAuth);

// Map barcode to item
router.post('/:id/barcode', asyncHandler(async (req: Request, res: Response) => {
    const itemId = req.params.id;
    const userId = req.session.user!.id;
    const {code, symbology} = req.body;
    const result = await itemController.mapBarcodeToItem(itemId, code, symbology, userId);
    if (result.success) {
        renderer.respondWithSuccessJson(res, result.message);
    } else {
        renderer.respondWithErrorJson(res, result.message);
    }
}));

export default router;
