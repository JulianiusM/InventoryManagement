import express, {Request, Response} from 'express';
import * as helpController from '../controller/helpController';
import {asyncHandler} from '../modules/lib/asyncHandler';

const router = express.Router();

// GET /help - Help index (shows README)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const data = helpController.fetchHelpIndex();
    res.render('help', data);
}));

// GET /help/:docName - Specific help document
router.get('/:docName', asyncHandler(async (req: Request, res: Response) => {
    const docName = req.params.docName;
    const data = helpController.fetchHelpDoc(docName);
    res.render('help', data);
}));

export default router;
