import express, {Request, Response} from 'express';
import * as loanController from '../controller/loanController';
import renderer from '../modules/renderer';
import {asyncHandler} from '../modules/lib/asyncHandler';
import {requireAuth} from '../middleware/authMiddleware';

const router = express.Router();

// Apply auth middleware to all loan routes
router.use(requireAuth);

// List all loans (only user's loans)
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const data = await loanController.listLoans(ownerId);
    renderer.renderWithData(res, 'loans/list', data);
}));

// Create loan
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    await loanController.createLoan(req.body, ownerId);
    req.flash('success', 'Loan created successfully');
    res.redirect('/loans');
}));

// Get loan detail (with ownership check)
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await loanController.getLoanDetail(id, userId);
    renderer.renderWithData(res, 'loans/detail', data);
}));

export default router;
