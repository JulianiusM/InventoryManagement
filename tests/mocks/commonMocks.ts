/**
 * Common mock configurations shared across controller tests
 */

export const ENTITIES_MOCK = {
    ACTIVITY: 'activity',
    DRIVERS: 'drivers',
    EVENT: 'event',
    PACKING: 'packing',
    SURVEY: 'survey',
};

export const mockUtil = (overrides = {}) => ({
    generateUniqueId: jest.fn(() => 'uid-xyz'),
    ENTITIES: ENTITIES_MOCK,
    ...overrides,
});

export const mockPermissionEngine = () => ({
    saveDefaultPermsFromBody: jest.fn(),
});
