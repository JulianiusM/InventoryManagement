import {Request} from "express";
import {EntityItemType, EntityType, PartialRecord} from "./UtilTypes";
import {User} from "../modules/database/entities/user/User";
import {Guest} from "../modules/database/entities/user/Guest";
import {PERM} from "../modules/lib/permissions";

export type PermType = keyof typeof PERM;

export type GetResource = (req: Request) => any;
export type GetAdditional = (req: Request) => any[];
export type EntityGetter = (req: Request) => Promise<EntityDescriptor> | EntityDescriptor;
export type ItemGetter = (req: Request) => Promise<ItemDescriptor[]> | ItemDescriptor[];

export type ItemWithParentGetter = (req: Request) => Promise<ItemSubject> | ItemSubject;

type DescriptorBase = {
    entityId: string;
    ownerUserId?: number | null;
    ownerGuestId?: number | null;
    eventId?: string | null;
}

export type EntityDescriptor = DescriptorBase & {
    entityType: EntityType;
};

export type ItemDescriptor = DescriptorBase & {
    entityType: EntityItemType;
};

export type ItemSubject = {
    item: ItemDescriptor;
    parent: EntityDescriptor; // parent is the entity
};

export type Subject = { kind: 'entity'; entity: EntityDescriptor } | {
    kind: 'item';
    item: ItemDescriptor;
    parent: EntityDescriptor
};

export type SessionLike = {
    user?: Partial<User> & { id: number } | null,
    guest?: Partial<Guest> & { id: number } | null
};

export type PermMeta = {
    key: string,
    bit: number,
    label: string,
}

export type PermPreset = {
    key: string,
    label: string,
    mask: number,
}

export type PermData = PartialRecord<Audience, number>

export type Audience = 'guest' | 'participant' | 'authenticated' | 'public';

export type SaveOpts = {
    /** Name of the root field in the form body (default: "defaultPerms") */
    fieldBase?: string;
    /**
     * If true, audiences missing from the body are treated as mask 0 (clear).
     * If false (default), missing audiences are left unchanged.
     */
    clearMissing?: boolean;
    /** Which audiences to consider; default covers all. */
    audiences?: Audience[];
};

/** Small caches to avoid repeated calls within a request */
export type PermEngineCaches = {
    participant?: Map<string, boolean>;           // eventId -> isParticipant
    userPerms?: Map<string, number>;              // `${type}:${id}:${userId}` -> mask
    defaults?: Map<string, Record<string, number>>; // `${type}:${id}` -> defaults map
};

export type PermBundle = {
    entity: PermView,
    items: Map<string, PermView>,
    item: (id: string) => PermView,
    itemHas: (id: string, key: keyof typeof PERM) => boolean,
    itemAllow: (
        id: string,
        key: keyof typeof PERM,
        parentKey?: keyof typeof PERM | (keyof typeof PERM)[]
    ) => boolean,
    toJSON?: () => string,
}

export type PermMetaBundle = {
    permMeta: PermMeta[],
    defaultPerms: PermData,
    presets: PermPreset[],
}

/** View model used by Pug */
export type PermView = {
    mask: number;
    parentMask: number;
    has: (k: keyof typeof PERM) => boolean;              // self only
    allow: (k: keyof typeof PERM, parentKey?: keyof typeof PERM | (keyof typeof PERM)[]) => boolean; // self OR parent
    all: (...keys: (keyof typeof PERM)[]) => boolean;    // all on self
    any: (...keys: (keyof typeof PERM)[]) => boolean;    // any on self
    bits: Record<string, boolean>;                       // quick flags
};