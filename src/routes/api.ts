import express, {NextFunction} from 'express';
import {handleValidationError, wrapErrorApi} from '../middleware/validationErrorHandler';
import createError from "http-errors";

// Domain-specific API routes
import scanApiRouter from './api/scan';
import itemsApiRouter from './api/items';
import loansApiRouter from './api/loans';
import gamesApiRouter from './api/games';
import playniteApiRouter from './api/playnite';

const router = express.Router();

// Mount domain-specific API routes
router.use('/scan', scanApiRouter);
router.use('/items', itemsApiRouter);
router.use('/loans', loansApiRouter);
router.use('/games', gamesApiRouter);
router.use('/integrations/playnite', playniteApiRouter);

router.use(handleValidationError);
// catch 404 and forward to error handler
router.use(function (req: express.Request, res: express.Response, next: NextFunction) {
    next(createError(404));
});
router.use(wrapErrorApi);

export default router;