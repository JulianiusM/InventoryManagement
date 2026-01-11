import bcrypt from 'bcryptjs';
import {AppDataSource} from '../dataSource';
import {coerceLimit, generateUniqueToken, maskEmail, SQL_ALLOW_LIST} from '../../lib/util';
import {User} from '../entities/user/User';
import {MoreThan} from "typeorm";
import type {OidcClaims, UserInfo} from "../../../types/UserTypes";
import settings from '../../settings';

export async function registerUser(username: string, name: string, password: string, email: string) {
    const repo = AppDataSource.getRepository(User);
    const hashed = await bcrypt.hash(password, 10);

    const user = repo.create({username, name, password: hashed, email, isActive: false});
    const result = await repo.save(user);
    return result.id;
}

export async function getUserByUsername(username: string) {
    const repo = AppDataSource.getRepository(User);
    return await repo.findOne({
        where: {username},
        select: ['id', 'name', 'username', 'email', 'isActive']
    });
}

export async function verifyPassword(userId: number, password: string) {
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({where: {id: userId}, select: ['password']});
    if (!user || !user.password) return false;
    return bcrypt.compare(password, user.password);
}

export async function generateActivationToken(userId: number) {
    const repo = AppDataSource.getRepository(User);
    const token = generateUniqueToken();
    const expiration = new Date(Date.now() + settings.value.tokenExpirationMs);
    await repo.update({id: userId}, {
        activationToken: token,
        activationTokenExpiration: expiration
    });
    return token;
}

export async function verifyActivationToken(token: string) {
    const repo = AppDataSource.getRepository(User);
    return await repo.findOne({
        where: {
            activationToken: token,
            activationTokenExpiration: MoreThan(new Date())
        },
        select: ['id', 'name', 'username', 'email', 'isActive']
    });
}

export async function activateUser(userId: number) {
    const repo = AppDataSource.getRepository(User);
    await repo.update({id: userId}, {
        isActive: true,
        activationToken: null,
        activationTokenExpiration: null
    });
}

export async function generatePasswordResetToken(username: string) {
    const repo = AppDataSource.getRepository(User);
    const token = generateUniqueToken();
    const expiration = new Date(Date.now() + settings.value.tokenExpirationMs);
    await repo.update({username}, {
        resetToken: token,
        resetTokenExpiration: expiration
    });
    return token;
}

export async function verifyPasswordResetToken(token: string) {
    const repo = AppDataSource.getRepository(User);
    return await repo.findOne({
        where: {
            resetToken: token,
            resetTokenExpiration: MoreThan(new Date())
        },
        select: ['id', 'name', 'username', 'email', 'isActive']
    });
}

export async function resetPassword(username: string, newPassword: string) {
    const repo = AppDataSource.getRepository(User);
    const hashed = await bcrypt.hash(newPassword, 10);
    await repo.update({username}, {
        password: hashed,
        resetToken: null,
        resetTokenExpiration: null
    });
}

/**
 * ---- SSO / OIDC helpers ----
 */

async function usernameExists(username: string): Promise<boolean> {
    const repo = AppDataSource.getRepository(User);
    const count = await repo.count({where: {username}});
    return count > 0;
}

async function toUniqueUsername(base: string): Promise<string> {
    const sanitized = base
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '')
        .slice(0, 30) || 'user';
    if (!(await usernameExists(sanitized))) return sanitized;

    // add numeric suffix
    for (let i = 1; i < 10_000; i++) {
        const candidate = `${sanitized}-${i}`;
        if (!(await usernameExists(candidate))) return candidate;
    }
    // fallback (should never happen)
    return `${sanitized}-${Date.now()}`;
}

/**
 * Find a user by OIDC issuer+sub.
 */
export async function getUserByOidc(oidcIssuer: string, oidcSub: string) {
    const repo = AppDataSource.getRepository(User);
    return await repo.findOne({
        where: {oidcIssuer, oidcSub},
        select: ['id', 'name', 'username', 'email', 'isActive'],
    });
}

/**
 * Link an existing local user to an OIDC identity.
 * Useful if you want a one-time “Connect SSO” button.
 */
export async function linkUserToOidc(
    userId: number,
    oidcIssuer: string,
    oidcSub: string
) {
    const repo = AppDataSource.getRepository(User);
    await repo.update({id: userId}, {oidcIssuer, oidcSub});
}

/**
 * Find or create a user from OIDC claims.
 * - Primary key: (issuer, sub)
 * - Optional fallback: email match (link existing local account)
 * - JIT-provisions a new user when needed.
 */
export async function findOrCreateUserFromOidc(
    oidcIssuer: string,
    claims: OidcClaims,
    opts: { linkByEmail?: boolean } = {linkByEmail: true}
) {
    const repo = AppDataSource.getRepository(User);
    const {sub, email, preferred_username, name} = claims;

    // 1) Try exact OIDC match first
    let user = await repo.findOne({
        where: {oidcIssuer, oidcSub: sub},
    });

    // 2) If not found: try link-by-email (optional)
    if (!user && opts.linkByEmail && email) {
        user = await repo.findOne({where: {email}});
        if (user) {
            user.oidcIssuer = oidcIssuer;
            user.oidcSub = sub;
            if (user.isActive !== true) user.isActive = true;
            await repo.save(user);
        }
    }

    // 3) If still not found: create a new local user (JIT provisioning)
    // inside findOrCreateUserFromOidc, in the "3) If still not found: create a new local user" block
    if (!user) {
        const baseUsername =
            preferred_username ||
            (email ? email.split('@')[0] : `oidc_${sub.slice(0, 8)}`);
        const uniqueUsername = await toUniqueUsername(baseUsername);

        // Ensure we don't violate unique(email)
        let emailToUse = email || `${sub}@no-email.local`;

        // If linkByEmail is disabled OR the email is already taken, use a synthetic email
        if (email) {
            const emailTaken = await repo.exist({where: {email}});
            if (!opts.linkByEmail || emailTaken) {
                emailToUse = `${sub}@no-email.local`;
            }
        }

        user = repo.create({
            username: uniqueUsername,
            name: name || baseUsername,
            email: emailToUse,
            password: null,
            isActive: true,
            oidcIssuer,
            oidcSub: sub,
        });

        try {
            user = await repo.save(user);
        } catch (err: any) {
            // Last-chance fallback for race conditions (MySQL/PG/SQLite)
            const message = String(err?.message || '');
            if (
                err?.code === 'ER_DUP_ENTRY' || // MySQL/MariaDB
                err?.code === '23505' ||        // Postgres
                message.includes('UNIQUE')      // SQLite/others
            ) {
                user.email = `${sub}@no-email.local`;
                user = await repo.save(user);
            } else {
                throw err;
            }
        }
    }

    return user;
}

/**
 * Optional: remove OIDC link (keeps the local account).
 */
export async function unlinkOidc(userId: number) {
    const repo = AppDataSource.getRepository(User);
    await repo.update({id: userId}, {oidcIssuer: null, oidcSub: null});
}

/**
 * Resolve by id | email | username.
 * Use only behind a permission check to avoid enumeration leaks.
 */
export async function findUserByNameOrEmail(identifier: string | number): Promise<User | null> {
    const repo = AppDataSource.getRepository(User);
    const raw = String(identifier).trim();

    if (/^\d+$/.test(raw)) {
        return await repo.findOne({where: {id: Number(raw)}});
    }

    if (raw.includes('@')) {
        // case-insensitive email; avoid LOWER() on column to keep indexes usable where possible
        return await repo
            .createQueryBuilder('u')
            .where('u.email = :email', {email: raw})
            .orWhere('u.email LIKE :emailCase', {emailCase: raw}) // fallback for case-insensitive collations
            .orWhere('u.username = :username', {username: raw})
            .getOne();
    }

    // username exact, email fallback
    return await repo
        .createQueryBuilder('u')
        .where('u.username = :username', {username: raw})
        .orWhere('u.email = :email', {email: raw})
        .getOne();
}

/**
 * Prefix search for username/email (index-friendly). Validates the query.
 * Returns { id, username, emailMasked } (no raw email by default).
 */
export async function searchUsersSecure(query: string, limit = 10): Promise<Array<UserInfo>> {
    const repo = AppDataSource.getRepository(User);
    const q = (query || '').trim();

    if (!SQL_ALLOW_LIST.test(q)) return [];            // too short / invalid chars -> no results
    const lim = coerceLimit(limit, 10, 25);

    const likePrefix = `${q}%`;

    const rows = await repo
        .createQueryBuilder('u')
        .select(['u.id', 'u.username', 'u.email', 'u.name'])
        .where('u.username LIKE :pfx', {pfx: likePrefix})
        .orWhere('u.email LIKE :pfx', {pfx: likePrefix})
        .orWhere('u.name LIKE :pfx', {pfx: likePrefix})
        .orderBy('u.username', 'ASC')
        .limit(lim)
        .getMany();

    return rows.map(u => ({id: u.id, username: u.username, email: maskEmail(u.email), name: u.name}));
}

/**
 * Optional fallback when admins explicitly want substring search.
 * Still validated and heavily limited to avoid table scans abuse.
 */
export async function searchUsersSubstringStrict(query: string, limit = 10): Promise<Array<{
    id: number;
    username: string;
    emailMasked: string
}>> {
    const repo = AppDataSource.getRepository(User);
    const q = (query || '').trim();

    // require >=3 chars for substring and allowlist
    if (q.length < 3 || !SQL_ALLOW_LIST.test(q)) return [];
    const lim = coerceLimit(limit, 10, 10);

    // Escape LIKE wildcards
    const esc = q.replace(/[%_\\]/g, '\\$&');
    const likeAny = `%${esc}%`;

    const rows = await repo
        .createQueryBuilder('u')
        .select(['u.id', 'u.username', 'u.email', 'u.name'])
        .where('u.username LIKE :like ESCAPE "\\\\"', {like: likeAny})
        .orWhere('u.email LIKE :like ESCAPE "\\\\"', {like: likeAny})
        .orWhere('u.name LIKE :like ESCAPE "\\\\"', {like: likeAny})
        .orderBy('u.username', 'ASC')
        .limit(lim)
        .getMany();

    return rows.map(u => ({id: u.id, username: u.username, emailMasked: maskEmail(u.email)}));
}

/** Optional helpers you might find useful elsewhere */
export async function getUserById(id: number): Promise<User | null> {
    return await AppDataSource.getRepository(User).findOne({where: {id}});
}
