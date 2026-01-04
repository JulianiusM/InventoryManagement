import "express";
import {Guest} from "../modules/database/entities/user/Guest";
import {User} from "../modules/database/entities/user/User";
import {Settings} from "../modules/settings";
import {PermBundle, PermMetaBundle} from "./PermissionTypes";
import {TokenEndpointResponse} from "openid-client";
import {EntityAdminAssignment} from "../modules/database/entities/permissions/EntityAdminAssignment";

declare module "express" {
    // Inject additional properties on express.Request
    interface Request {
        resource?: Record<string, any>;
        additional?: Record<string, any>[];
    }
}

declare module "express-serve-static-core" {
    interface Locals {
        data?: any,
        user?: User | null,
        guest?: Guest | null,
        version: string,
        settings?: Partial<Settings>,
        permData?: PermBundle,
        perms?: PermMetaBundle,
        admins?: EntityAdminAssignment[],
    }
}

declare module "express-session" {
    interface SessionData {
        user?: User | null;
        guest?: Guest | null;
        tokens?: TokenEndpointResponse;
        oidc?: { code_verifier: string; state: string; nonce?: string };
    }
}

export {};