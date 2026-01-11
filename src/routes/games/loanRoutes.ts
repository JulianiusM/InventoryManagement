/**
 * Loan Routes
 * 
 * Routes for loan operations
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// Return copy
router.post('/:id/return', asyncHandler(async (req: Request, res: Response) => {
    const loanId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.returnGameCopy(loanId, req.body.conditionIn, userId);
    req.flash('success', 'Copy returned successfully');
    res.redirect('back');
}));

export default router;
