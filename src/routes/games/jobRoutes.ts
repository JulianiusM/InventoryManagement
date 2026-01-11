/**
 * Job Routes
 * 
 * Routes for sync job listing
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// List all sync jobs
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = req.session.user!.id;
    const status = (req.query.status as string) || '';
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    
    const data = await gamesController.listJobs(userId, {status, page});
    renderer.renderWithData(res, 'games/jobs', data);
}));

export default router;
