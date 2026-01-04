import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as scanController from '../../controller/scanController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all scan routes
router.use(requireAuth);

// Barcode/QR code resolution
router.post('/resolve', asyncHandler(async (req: Request, res: Response) => {
    const {code} = req.body;
    const userId = req.session.user!.id;
    const result = await scanController.resolveCode(code, userId);
    renderer.respondWithSuccessDataJson(res, 'Code resolved', result);
}));

// Register unmapped barcode
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
    const {code, symbology} = req.body;
    const result = await scanController.registerUnmappedBarcode(code, symbology);
    if (result.success) {
        renderer.respondWithSuccessDataJson(res, result.message, {barcodeId: result.barcodeId});
    } else {
        renderer.respondWithErrorDataJson(res, result.message, {barcodeId: result.barcodeId});
    }
}));

export default router;
