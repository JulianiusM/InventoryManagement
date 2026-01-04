import express, {Request, Response} from 'express';
import * as loanController from '../controller/loanController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';

const router = express.Router();

// List all loans
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user?.id;
    const data = await loanController.listLoans(ownerId);
    renderer.renderWithData(res, 'loans/list', data);
}));

// Create loan
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user?.id;
    await loanController.createLoan(req.body, ownerId);
    req.flash('success', 'Loan created successfully');
    res.redirect('/loans');
}));

// Get loan detail
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const data = await loanController.getLoanDetail(id);
    renderer.renderWithData(res, 'loans/detail', data);
}));

export default router;
