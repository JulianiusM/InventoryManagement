/**
 * Wizard Controller
 * Handles guided wizard workflows for creating locations, items, and game titles.
 * Uses existing service-layer functions for actual entity creation.
 */

import * as locationController from './locationController';
import * as itemController from './itemController';
import * as gameTitleController from './games/gameTitleController';
import * as locationService from '../modules/database/services/LocationService';
import * as platformService from '../modules/database/services/PlatformService';
import {requireAuthenticatedUser} from '../middleware/authMiddleware';
import {ExpectedError} from '../modules/lib/errors';
import {ItemType, ItemCondition, LocationKind, GameType} from '../types/InventoryEnums';

/** Supported wizard entity types */
export type WizardEntityType = 'location' | 'item' | 'game';

/** Step definition for the wizard UI */
export interface WizardStep {
    id: string;
    title: string;
    icon: string;
    optional: boolean;
}

/** Wizard definitions keyed by entity type */
const wizardDefinitions: Record<WizardEntityType, {
    title: string;
    icon: string;
    steps: WizardStep[];
}> = {
    location: {
        title: 'Create Location',
        icon: 'bi-geo-alt',
        steps: [
            {id: 'basics', title: 'Basics', icon: 'bi-pencil', optional: false},
            {id: 'details', title: 'Details', icon: 'bi-list-ul', optional: true},
            {id: 'review', title: 'Review', icon: 'bi-check-circle', optional: false},
        ],
    },
    item: {
        title: 'Create Item',
        icon: 'bi-box-seam',
        steps: [
            {id: 'basics', title: 'Basics', icon: 'bi-pencil', optional: false},
            {id: 'location', title: 'Location', icon: 'bi-geo-alt', optional: true},
            {id: 'extras', title: 'Extras', icon: 'bi-tags', optional: true},
            {id: 'review', title: 'Review', icon: 'bi-check-circle', optional: false},
        ],
    },
    game: {
        title: 'Create Game',
        icon: 'bi-controller',
        steps: [
            {id: 'basics', title: 'Basics', icon: 'bi-pencil', optional: false},
            {id: 'players', title: 'Players', icon: 'bi-people', optional: true},
            {id: 'review', title: 'Review', icon: 'bi-check-circle', optional: false},
        ],
    },
};

const VALID_ENTITY_TYPES: WizardEntityType[] = ['location', 'item', 'game'];

function isValidEntityType(type: string): type is WizardEntityType {
    return VALID_ENTITY_TYPES.includes(type as WizardEntityType);
}

/**
 * Show the wizard chooser (entity type selection)
 */
export async function showWizardChooser(userId: number) {
    requireAuthenticatedUser(userId);
    return {
        entityTypes: VALID_ENTITY_TYPES.map(type => ({
            type,
            title: wizardDefinitions[type].title,
            icon: wizardDefinitions[type].icon,
        })),
    };
}

/**
 * Show the wizard form for a given entity type
 */
export async function showWizardForm(entityType: string, userId: number) {
    requireAuthenticatedUser(userId);

    if (!isValidEntityType(entityType)) {
        throw new ExpectedError('Invalid entity type', 'error', 400);
    }

    const definition = wizardDefinitions[entityType];
    const prefetchData = await getPrefetchData(entityType, userId);

    return {
        entityType,
        definition,
        ...prefetchData,
    };
}

/**
 * Handle wizard form submission - creates the entity
 */
export async function submitWizard(entityType: string, body: Record<string, string>, userId: number) {
    requireAuthenticatedUser(userId);

    if (!isValidEntityType(entityType)) {
        throw new ExpectedError('Invalid entity type', 'error', 400);
    }

    switch (entityType) {
        case 'location':
            return await submitLocationWizard(body, userId);
        case 'item':
            return await submitItemWizard(body, userId);
        case 'game':
            return await submitGameWizard(body, userId);
    }
}

/**
 * Handle inline location creation from within an item/game wizard
 */
export async function createInlineLocation(body: {name: string; kind?: string}, userId: number) {
    requireAuthenticatedUser(userId);

    const location = await locationController.createLocation(body, userId);
    return {
        id: location.id,
        name: location.name,
    };
}

// ============ Private Helpers ============

async function getPrefetchData(entityType: WizardEntityType, userId: number) {
    switch (entityType) {
        case 'location': {
            const locations = await locationService.getAllLocations(userId);
            return {
                locations,
                locationKinds: Object.values(LocationKind),
            };
        }
        case 'item': {
            const locations = await locationService.getAllLocations(userId);
            return {
                locations,
                itemTypes: Object.values(ItemType).filter(
                    t => t !== ItemType.GAME && t !== ItemType.GAME_DIGITAL
                ),
                itemConditions: Object.values(ItemCondition),
                locationKinds: Object.values(LocationKind),
            };
        }
        case 'game': {
            const platforms = await platformService.getAllPlatforms(userId);
            return {
                platforms,
                gameTypes: Object.values(GameType),
            };
        }
    }
}

async function submitLocationWizard(body: Record<string, string>, userId: number) {
    const location = await locationController.createLocation({
        name: body.name,
        kind: body.kind || undefined,
        parentId: body.parentId || undefined,
        qrCode: body.qrCode || undefined,
    }, userId);

    return {
        entityType: 'location' as const,
        entityId: location.id,
        entityName: location.name,
        editUrl: `/locations/${location.id}`,
        listUrl: '/locations',
    };
}

async function submitItemWizard(body: Record<string, string>, userId: number) {
    // Handle inline location creation if requested
    let locationId = body.locationId || undefined;
    if (body.newLocationName && body.newLocationName.trim()) {
        const newLocation = await locationController.createLocation({
            name: body.newLocationName.trim(),
            kind: body.newLocationKind || undefined,
        }, userId);
        locationId = newLocation.id;
    }

    const item = await itemController.createItem({
        name: body.name,
        type: body.type || undefined,
        description: body.description || undefined,
        condition: body.condition || undefined,
        serialNumber: body.serialNumber || undefined,
        tags: body.tags || undefined,
        locationId,
    }, userId);

    return {
        entityType: 'item' as const,
        entityId: item.id,
        entityName: item.name,
        editUrl: `/items/${item.id}`,
        listUrl: '/items',
    };
}

async function submitGameWizard(body: Record<string, string>, userId: number) {
    const title = await gameTitleController.createGameTitle({
        name: body.name,
        type: body.type || undefined,
        description: body.description || undefined,
        overallMinPlayers: Number(body.overallMinPlayers) || 1,
        overallMaxPlayers: Number(body.overallMaxPlayers) || 1,
        supportsOnline: body.supportsOnline === 'true' ? true : undefined,
        supportsLocalCouch: body.supportsLocalCouch === 'true' ? true : undefined,
        supportsLocalLAN: body.supportsLocalLAN === 'true' ? true : undefined,
        supportsPhysical: body.supportsPhysical === 'true' ? true : undefined,
    }, userId);

    return {
        entityType: 'game' as const,
        entityId: title.id,
        entityName: title.name,
        editUrl: `/games/titles/${title.id}`,
        listUrl: '/games',
    };
}
