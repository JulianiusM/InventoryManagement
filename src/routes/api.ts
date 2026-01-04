import express, {NextFunction} from 'express';
import {handleValidationError, wrapErrorApi} from '../middleware/validationErrorHandler';

import createError from "http-errors";

const router = express.Router();


router.use(handleValidationError);
// catch 404 and forward to error handler
router.use(function (req: express.Request, res: express.Response, next: NextFunction) {
    next(createError(404));
});
router.use(wrapErrorApi);

export default router;