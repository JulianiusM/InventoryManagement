import express, {Request, Response} from 'express';
import {asyncHandler} from '../../modules/lib/asyncHandler';
import * as loanController from '../../controller/loanController';
import renderer from '../../modules/renderer';
import {requireAuth} from '../../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all loan API routes
router.use(requireAuth);

// Return loan
router.post('/:id/return', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await loanController.returnLoan(id, req.body, userId);
    renderer.respondWithSuccessJson(res, 'Loan marked as returned');
}));

export default router;
