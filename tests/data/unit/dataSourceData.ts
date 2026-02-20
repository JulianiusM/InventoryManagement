/**
 * Test data for dataSource auto-migration behavior.
 */

export const emptyDatabaseResult = [{cnt: '0'}];
export const populatedDatabaseResult = [{cnt: '12'}];

export const appliedMigrations = [
    {name: 'Migration1'},
    {name: 'Migration2'},
];

export const noMigrations: any[] = [];
