import express, {NextFunction, Request, Response} from 'express';
import {handleValidationError, wrapErrorApi} from '../middleware/validationErrorHandler';
import {asyncHandler} from '../modules/lib/asyncHandler';
import * as scanController from '../controller/scanController';
import * as itemController from '../controller/itemController';
import * as loanController from '../controller/loanController';
import renderer from '../modules/renderer';
import createError from "http-errors";

const router = express.Router();

// Barcode/QR code resolution
router.post('/scan/resolve', asyncHandler(async (req: Request, res: Response) => {
    const {code} = req.body;
    const result = await scanController.resolveCode(code);
    renderer.respondWithSuccessDataJson(res, 'Code resolved', result);
}));

// Register unmapped barcode
router.post('/scan/register', asyncHandler(async (req: Request, res: Response) => {
    const {code, symbology} = req.body;
    const result = await scanController.registerUnmappedBarcode(code, symbology);
    if (result.success) {
        renderer.respondWithSuccessDataJson(res, result.message, {barcodeId: result.barcodeId});
    } else {
        renderer.respondWithErrorDataJson(res, result.message, {barcodeId: result.barcodeId});
    }
}));

// Map barcode to item
router.post('/items/:id/barcode', asyncHandler(async (req: Request, res: Response) => {
    const itemId = parseInt(req.params.id, 10);
    const {code, symbology} = req.body;
    const result = await itemController.mapBarcodeToItem(itemId, code, symbology);
    if (result.success) {
        renderer.respondWithSuccessJson(res, result.message);
    } else {
        renderer.respondWithErrorJson(res, result.message);
    }
}));

// Return loan
router.post('/loans/:id/return', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    await loanController.returnLoan(id, req.body);
    renderer.respondWithSuccessJson(res, 'Loan marked as returned');
}));

router.use(handleValidationError);
// catch 404 and forward to error handler
router.use(function (req: express.Request, res: express.Response, next: NextFunction) {
    next(createError(404));
});
router.use(wrapErrorApi);

export default router;