// src/types/global.d.ts
import type {ActivitySlot} from '../modules/database/entities/activity/ActivitySlot';
import type {PackingItem} from '../modules/database/entities/packing/PackingItem';
import type {PermBundle} from './PermissionTypes';

export {};

declare global {
    interface Window {
        Surveyor: {
            init?: () => void;
            // Add more functions/properties if needed
            // Entity IDs from server
            entityId?: string;
            eventId?: string;

            // Prefilled data from server
            prefilledItems?: Partial<PackingItem>[];
            prefilledSlots?: Record<string, Partial<ActivitySlot>[]>;
            prefilledCombinations?: { weekday: string; nth_week?: string }[];

            // Serialized permissions bundle
            rawPermissions?: string;
            permissions?: PermBundle;

            allRoles?: RoleSummary[];
            slotRoles?: string;
        };

        // Bootstrap types
        bootstrap?: {
            Modal: {
                getOrCreateInstance(element: HTMLElement): { show(): void; hide(): void };
                getInstance(element: HTMLElement): { show(): void; hide(): void } | null;
                new(element: HTMLElement): { show(): void; hide(): void };
            };
        };

    }
}
