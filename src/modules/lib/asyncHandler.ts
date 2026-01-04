import {NextFunction, Request, Response} from 'express';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => any) {
    return (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req, res, next)).catch(next);
}

export function asyncParamHandler(fn: (req: Request, res: Response, next: NextFunction, id: any) => any) {
    return (req: Request, res: Response, next: NextFunction, id: any) =>
        Promise.resolve(fn(req, res, next, id)).catch(next);
}