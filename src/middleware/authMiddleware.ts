import {NextFunction, Request, Response} from 'express';
import {ExpectedError} from '../modules/lib/errors';

/**
 * Middleware to require authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.user) {
        if (req.path.startsWith('/api/')) {
            throw new ExpectedError('Authentication required', 'error', 401);
        }
        req.flash('error', 'Please log in to access this page');
        res.redirect('/users/login');
        return;
    }
    next();
}

/**
 * Middleware factory to check if user owns a resource
 * Use after fetching the resource and attaching it to res.locals
 */
export function requireOwnership(resourceKey: string) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const resource = res.locals[resourceKey];
        const userId = req.session.user?.id;

        if (!resource) {
            throw new ExpectedError('Resource not found', 'error', 404);
        }

        // Check ownerId on the resource
        if (resource.ownerId !== userId) {
            throw new ExpectedError('You do not have permission to access this resource', 'error', 403);
        }

        next();
    };
}

/**
 * Check ownership in controller context (not middleware)
 * Throws an error if user doesn't own the resource
 */
export function checkOwnership(resource: { ownerId?: number | null }, userId?: number): void {
    if (!userId) {
        throw new ExpectedError('Authentication required', 'error', 401);
    }
    if (resource.ownerId !== userId) {
        throw new ExpectedError('You do not have permission to access this resource', 'error', 403);
    }
}

/**
 * Check if user is authenticated (for controller use)
 */
export function requireAuthenticatedUser(userId?: number): asserts userId is number {
    if (!userId) {
        throw new ExpectedError('Authentication required', 'error', 401);
    }
}
