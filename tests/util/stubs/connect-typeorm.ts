// tests/stubs/connect-typeorm.ts
import {EventEmitter} from 'events';

type SessionLike = { id: string; json: string; expiredAt: number; destroyedAt?: Date };

export class TypeormStore extends EventEmitter {
    private map = new Map<string, SessionLike>();
    private ttlSeconds = 60 * 60 * 24;

    constructor(opts?: { cleanupLimit?: number; limitSubquery?: boolean; ttl?: number }) {
        super();
        if (opts?.ttl) this.ttlSeconds = opts.ttl;
        queueMicrotask(() => this.emit('connect'));
    }

    connect(_repo: any) {
        return this;
    }

    get = (sid: string, cb: (err?: any, session?: any) => void) => {
        try {
            const rec = this.map.get(sid);
            if (!rec) return cb(undefined, undefined);
            if (rec.expiredAt < Date.now()) {
                this.map.delete(sid);
                return cb(undefined, undefined);
            }
            const sess = JSON.parse(rec.json);
            return cb(undefined, sess);
        } catch (err) {
            return cb(err as any);
        }
    };

    set = (sid: string, sess: any, cb: (err?: any) => void) => {
        try {
            const expires = (sess && sess.cookie && sess.cookie.expires)
                ? new Date(sess.cookie.expires).getTime()
                : (Date.now() + this.ttlSeconds * 1000);
            const json = JSON.stringify(sess || {});
            this.map.set(sid, {id: sid, json, expiredAt: expires});
            cb();
        } catch (err) {
            cb(err as any);
        }
    };

    destroy = (sid: string, cb: (err?: any) => void) => {
        this.map.delete(sid);
        cb();
    };

    touch = (sid: string, sess: any, cb: (err?: any) => void) => {
        const rec = this.map.get(sid);
        if (rec) {
            const expires = (sess && sess.cookie && sess.cookie.expires)
                ? new Date(sess.cookie.expires).getTime()
                : (Date.now() + this.ttlSeconds * 1000);
            rec.expiredAt = expires;
            this.map.set(sid, rec);
        }
        cb();
    };

    length = (cb: (err: any, length?: number) => void) => {
        for (const [k, v] of Array.from(this.map.entries())) {
            if (v.expiredAt < Date.now()) this.map.delete(k);
        }
        cb(null, this.map.size);
    };

    clear = (cb: (err?: any) => void) => {
        this.map.clear();
        cb();
    };

    all = (cb: (err: any, obj?: any[]) => void) => {
        const out: any[] = [];
        for (const v of this.map.values()) {
            if (v.expiredAt >= Date.now()) {
                try {
                    out.push(JSON.parse(v.json));
                } catch {
                }
            }
        }
        cb(null, out);
    };
}

export default {TypeormStore};
