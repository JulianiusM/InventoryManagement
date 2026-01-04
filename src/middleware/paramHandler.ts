import {APIError, ExpectedError} from "../modules/lib/errors";
import {asyncHandler, asyncParamHandler} from "../modules/lib/asyncHandler";
import {NextFunction, Request, Response, Router} from "express";
import type {GuestFlowDb} from "../types/UserTypes";

export function apiParamHandler(param: string, router: Router, getById: GuestFlowDb['getById'], entityType: string) {
    handleParam(param, router, getById, entityType, new APIError(`${entityType} not found`, {}, 404));
}

export function paramHandler(param: string, router: Router, getById: GuestFlowDb['getById'], entityType: string) {
    handleParam(param, router, getById, entityType, new ExpectedError(`${entityType} not found`, 'error', 404));
}

export function queryHandler(param: string, router: Router, getById: GuestFlowDb['getById'], entityName: string, error?: Error) {
    router.use(asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
        await handle(req.query[param], getById, entityName, req, res, next, error)
    }));
}

export function createPathQueryHandler(param: string, router: Router, getById: GuestFlowDb['getById'], entityName: string, error?: Error) {
    router.use(asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
            if (!req.path.endsWith("/create") && !req.path.endsWith("/duplicate")) {
                console.log(req.path);
                return next();
            }

            return await handle(req.query[param], getById, entityName, req, res, next, error)
        }
    ));
}

export function handleParam(param: string, router: Router, getById: GuestFlowDb['getById'], entityName: string, error?: Error) {
    router.param(param, asyncParamHandler(async (req: Request, res: Response, next: NextFunction, id: any) =>
        await handle(id, getById, entityName, req, res, next, error)
    ));
}

async function handle(
    id: any,
    getById: GuestFlowDb['getById'],
    entityName: string,
    req: Request,
    res: Response,
    next: NextFunction,
    error?: Error,
) {
    let entity = undefined;
    if (id !== undefined) {
        entity = await getById(id);
    }
    if (!entity) {
        if (error) throw error;
        // No error --> Optional resource
        return next();
    }
    req.resource = req.resource || {};
    req.resource[entityName] = entity;
    if (entity.event) {
        req.resource['event'] = entity.event;
    }
    return next();
}