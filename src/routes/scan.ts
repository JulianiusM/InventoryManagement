import express, {Request, Response} from 'express';
import * as scanController from '../controller/scanController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';

const router = express.Router();

// Scan page
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user?.id;
    const data = await scanController.listScanData(ownerId);
    renderer.renderWithData(res, 'scan/index', data);
}));

export default router;
