/**
 * Game Copy Routes
 * 
 * Routes for game copy/item operations and lending
 */
import express, {Request, Response} from 'express';
import * as gamesController from '../../controller/gamesController';
import renderer from '../../modules/renderer';
import {asyncHandler} from '../../modules/lib/asyncHandler';

const router = express.Router();

// List all copies
router.get('/', asyncHandler(async (req: Request, res: Response) => {
    const ownerId = req.session.user!.id;
    const copyType = (req.query.copyType as string) || '';
    const locationFilter = (req.query.location as string) || '';
    const providerFilter = (req.query.provider as string) || '';
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    
    const data = await gamesController.listGameCopies(ownerId, {
        copyType,
        locationFilter,
        providerFilter,
        page
    });
    renderer.renderWithData(res, 'games/copies', {...data, copyType, locationFilter, providerFilter});
}));

// Get copy detail
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const data = await gamesController.getGameCopyDetail(id, userId);
    renderer.renderWithData(res, 'games/copy-detail', data);
}));

// Move copy
router.post('/:id/move', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.moveGameCopy(id, req.body, userId);
    req.flash('success', 'Copy moved successfully');
    res.redirect(`/games/copies/${id}`);
}));

// Update copy
router.post('/:id/update', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    const body = {
        condition: req.body.condition || null,
        lendable: req.body.lendable === 'true',
        notes: req.body.notes || null,
        storeUrl: req.body.storeUrl || null,
    };
    await gamesController.updateGameCopy(id, body, userId);
    req.flash('success', 'Copy updated successfully');
    res.redirect(`/games/copies/${id}`);
}));

// Delete copy
router.post('/:id/delete', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.deleteGameCopy(id, userId);
    req.flash('success', 'Copy deleted successfully');
    res.redirect('/games/copies');
}));

// ============ Lending ============

// Lend copy
router.post('/:id/lend', asyncHandler(async (req: Request, res: Response) => {
    const copyId = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.lendGameCopy({...req.body, gameCopyId: copyId}, userId);
    req.flash('success', 'Copy lent successfully');
    res.redirect(`/games/copies/${copyId}`);
}));

// Link digital copy to external account
router.post('/:id/link-account', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id;
    const userId = req.session.user!.id;
    await gamesController.linkDigitalCopyToAccount(id, req.body, userId);
    req.flash('success', 'Copy linked to external account');
    res.redirect(`/games/copies/${id}`);
}));

export default router;
