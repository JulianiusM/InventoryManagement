import {v4 as uuidv4} from 'uuid';
import crypto from 'crypto';
import {Request} from "express";

import {APIError} from "./errors";
import type {
    EntityDescriptor,
    EntityGetter,
    GetAdditional,
    GetResource,
    ItemDescriptor,
    ItemGetter,
    ItemSubject,
    ItemWithParentGetter
} from "../../types/PermissionTypes";
import type {EntityItemType, EntityType} from "../../types/UtilTypes";

// Generic currency helpers for invoice math
export function toAmount(val: string | number | undefined | null): number {
    if (val === undefined || val === null) return 0;
    const num = Number(val);
    return Number.isNaN(num) ? 0 : num;
}

export function formatAmount(amount: number): string {
    return amount.toFixed(2);
}

// Resolve a human-friendly label for the current actor, falling back to usernames where names are missing.
// This keeps email/audit messages readable without duplicating lookup logic across controllers.
export function resolveActorLabel(session: Request['session'] | undefined | null): string {
    if (session?.user?.name) return session.user.name;
    if (session?.user?.username) return session.user.username;
    if (session?.guest?.username) return session.guest.username;
    return 'an organizer';
}

// Sanitize text for use in email content to prevent injection attacks
export function sanitizeForEmail(text: string): string {
    // Remove control characters and limit to printable characters
    return text.replace(/[\x00-\x1F\x7F-\x9F]/g, '').trim();
}

// Funktion zur Generierung eines einzigartigen Tokens
export function generateUniqueToken() {
    return crypto.randomBytes(32).toString('hex');
}

export function generateUniqueId() {
    return uuidv4();
}

// Returns 'YYYY-MM-DD' in the server's local time zone
export function toLocalISODate(dateObj: Date) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function toLocalISOTime(dateObj: Date) {
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    const h = String(dateObj.getUTCHours()).padStart(2, '0');
    const min = String(dateObj.getUTCMinutes()).padStart(2, '0');
    const sec = String(dateObj.getUTCSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}:${sec}`;
}

/**
 * Rewrite an ISO string into a given IANA timezone WITHOUT changing the wall-clock
 * date/time fields. Example: "2025-06-01T12:23:00Z" -> Europe/Berlin => "2025-06-01T12:23:00+02:00"
 *
 * @param {string} isoString - Any ISO 8601 datetime (with or without offset).
 * @param {string} timeZone  - IANA timezone, e.g. "Europe/Berlin".
 * @returns {string} ISO-like string with the same Y-M-D and time, but with the correct tz offset.
 */
export function rewriteISOToZone(isoString: string, timeZone: string): string {
    // 1) Parse *fields only* (ignore original offset when rebuilding)
    const m = isoString.trim().match(
        /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|[+-]\d{2}:?\d{2})?$/
    );
    if (!m) throw new Error("Invalid ISO datetime");

    const [, y, mo, d, h, mi, s = "00", ms = "0"] = m;
    const Y = +y, M = +mo, D = +d, H = +h, Min = +mi, S = +s, Ms = +ms.padEnd(3, "0");

    // 2) Helper: get offset in minutes for a given UTC epoch in the target zone
    function getOffsetMinutes(epochMs: number) {
        const p = new Intl.DateTimeFormat('en-US', {
            timeZone,
            timeZoneName: 'shortOffset'
        }).formatToParts(new Date(epochMs)).find(x => x.type === 'timeZoneName');

        // p.value examples: "GMT", "GMT+2", "GMT-05:30"
        const m = p && p.value.match(/^GMT(?:(?<sign>[+-])(?<hh>\d{1,2})(?::?(?<mm>\d{2}))?)?$/);
        if (!m) return 0;
        const sign = (m.groups?.sign === '-') ? -1 : 1;
        const hh = m.groups?.hh ? parseInt(m.groups.hh, 10) : 0;
        const mm = m.groups?.mm ? parseInt(m.groups.mm, 10) : 0;
        return sign * (hh * 60 + mm);
    }

    // 3) Solve for the UTC instant whose *local time in the zone* equals the parsed fields
    //    L = U + offset(U). Start with a guess and iterate (offset only changes at DST edges).
    let guess = Date.UTC(Y, M - 1, D, H, Min, S, Ms);
    let lastOffset = getOffsetMinutes(guess);
    let utc = guess - lastOffset * 60_000;
    for (let i = 0; i < 3; i++) {
        const off = getOffsetMinutes(utc);
        if (off === lastOffset) break;
        lastOffset = off;
        utc = guess - off * 60_000;
    }

    // 5) Build the offset label ±HH:MM
    const offMin = getOffsetMinutes(utc);
    const sign = offMin < 0 ? '-' : '+';
    const abs = Math.abs(offMin);
    const offHH = String(Math.floor(abs / 60)).padStart(2, '0');
    const offMM = String(abs % 60).padStart(2, '0');
    const offsetStr = `${sign}${offHH}:${offMM}`;

    // 6) Return the *original* wall-clock fields with the computed offset
    const pad = (n: any, len = 2) => String(n).padStart(len, '0');
    const hasSeconds = m[6] !== undefined;
    const hasMillis = m[7] !== undefined;

    const timeCore =
        `${pad(H)}:${pad(Min)}` +
        (hasSeconds ? `:${pad(S)}` : '') +
        (hasMillis ? `.${pad(Ms, 3)}` : '');

    return `${pad(Y, 4)}-${pad(M, 2)}-${pad(D, 2)}T${timeCore}${offsetStr}`;
}

export function fromISOtoLocal(isoDateStr: string) {
    const isoDate = isoDateStr.slice(0, 19);
    const [y, m, d] = isoDate.split('-');
    const [day, time] = d.split('T');
    let h = 0, min = 0, sec = 0;
    if (time) {
        [h, min, sec] = time.split(':').map(Number);
    }
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(day), h, min, sec || 0));
}

export function now() {
    return new Date();
}

export function coerceLimit(n: any, def = 10, max = 25) {
    const v = Number(n);
    if (!Number.isFinite(v)) return def;
    return Math.min(Math.max(v, 1), max);
}

export function maskEmail(email?: string | null) {
    if (!email) return '';
    const [user, domain] = email.split('@');
    if (!domain) return email.replace(/.(?=.{2})/g, '*');
    const u = user.length <= 2 ? user[0] + '*' : user.slice(0, 2) + '***';
    const parts = domain.split('.');
    const d0 = parts[0] || '';
    const d = (d0.slice(0, 1) || '*') + '***' + (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');
    return `${u}@${d}`;
}

export async function performAPIAction(req: Request, action: {
    actionUser: (body: any, userId: number) => Promise<void>,
    actionGuest: (body: any, guestId: number) => Promise<void>,
}) {
    const userId = req.session.user?.id;
    const guestId = req.session.guest?.id;
    if (userId) await action.actionUser(req.body, userId);
    else if (guestId) await action.actionGuest(req.body, guestId);
    else throw new APIError('Unknown user', {}, 401);
}

export function getResource(req: Request, entityName: string) {
    return req.resource ? req.resource[entityName] : undefined;
}

export function getAdditional(req: Request, entityName: string, appendList: any[] = []) {
    appendList.push(req.resource ? req.resource[entityName] : undefined);
    return appendList;
}

export function isWithinWindow(start: string | Date, end: string | Date, a: string | Date, d: string | Date) {
    return a <= d && a >= start && d <= end;
}

/**
 * Utility: add N days to a YYYY-MM-DD string (UTC-safe).
 */
function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/**
 * Utility: compare YYYY-MM-DD strings (lexicographic works for ISO dates).
 */
function minDate(a: string, b: string) {
    return a < b ? a : b;
}

function maxDate(a: string, b: string) {
    return a > b ? a : b;
}

/**
 * Pure helper that builds date totals from an event window and registrations.
 * Each registration contributes 1 to every day between arrival and departure (inclusive).
 */
export function buildDateTotals(
    eventStart: string,
    eventEnd: string,
    regs: Array<{ arrivalDate: string | null; departureDate: string | null }>
): Record<string, number> {
    // Initialize all days in the event window to 0
    const totals: Record<string, number> = {};
    let cur = eventStart;
    while (cur <= eventEnd) {
        totals[cur] = 0;
        cur = addDays(cur, 1);
    }

    // Tally each registration
    for (const r of regs) {
        const arr = r.arrivalDate ?? eventStart;
        const dep = r.departureDate ?? eventEnd;

        // Clamp to event window
        let start = maxDate(arr, eventStart);
        let end = minDate(dep, eventEnd);
        if (start > end) continue; // outside window or invalid

        // Increment each covered day
        let d = start;
        while (d <= end) {
            totals[d] = (totals[d] ?? 0) + 1;
            d = addDays(d, 1);
        }
    }

    return totals;
}

export async function ignoreException(fct: () => any) {
    try {
        return await fct();
    } catch (err) {
        console.warn(err);
    }
}

export function jsonReplacer(key: any, value: any) {
    if (value instanceof Map) {
        return {
            dataType: 'Map',
            value: Array.from(value.entries()), // or with spread: value: [...value]
        };
    } else {
        return value;
    }
}

// simple allowlist to keep LIKE fast and avoid expensive patterns
export const SQL_ALLOW_LIST = /^[a-z0-9._+\-@ ]{3,}$/i;

/**
 * Validate and sanitize a store URL for digital game copies
 * Only allows HTTPS URLs for security
 * @param url The URL to validate
 * @returns The valid URL or null if invalid
 */
export function validateStoreUrl(url: string | undefined | null): string | null {
    if (!url || typeof url !== 'string') return null;
    
    const trimmed = url.trim();
    if (!trimmed) return null;
    
    try {
        const parsed = new URL(trimmed);
        // Only allow HTTPS for security
        if (parsed.protocol !== 'https:') {
            return null;
        }
        // Basic hostname validation - must have at least a domain and TLD
        if (!parsed.hostname.includes('.')) {
            return null;
        }
        return parsed.href;
    } catch {
        return null;
    }
}

/**
 * Check if a URL is a valid store URL (for display purposes)
 * @param url The URL to check
 * @returns true if the URL is valid
 */
export function isValidStoreUrl(url: string | undefined | null): boolean {
    return validateStoreUrl(url) !== null;
}