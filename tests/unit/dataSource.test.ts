/**
 * Data Source Auto-Migration Tests
 *
 * Tests for the initDataSource function that auto-synchronizes fresh databases
 * and runs pending migrations on startup.
 */

import {
    emptyDatabaseResult,
    populatedDatabaseResult,
    appliedMigrations,
    noMigrations,
} from '../data/unit/dataSourceData';

// Mock settings before importing dataSource
jest.mock('../../src/modules/settings', () => ({
    __esModule: true,
    default: {
        value: {
            initialized: true,
            dbType: 'mariadb',
            dbHost: 'localhost',
            dbPort: 3306,
            dbUser: 'root',
            dbPassword: 'password',
            dbName: 'test_db',
        },
        read: jest.fn(),
    },
}));

// Mock __index__ to avoid loading real entities/migrations
jest.mock('../../src/modules/database/__index__', () => ({
    entities: [],
    migrations: [],
    subscribers: [],
}));

// Mock TypeORM DataSource
const mockInitialize = jest.fn();
const mockSynchronize = jest.fn();
const mockRunMigrations = jest.fn();
const mockQuery = jest.fn();

jest.mock('typeorm', () => ({
    DataSource: jest.fn().mockImplementation(() => ({
        initialize: mockInitialize,
        synchronize: mockSynchronize,
        runMigrations: mockRunMigrations,
        query: mockQuery,
    })),
}));

import {createDataSourceOptions, initDataSource} from '../../src/modules/database/dataSource';

describe('createDataSourceOptions', () => {
    test('returns options from settings with synchronize disabled', () => {
        const options = createDataSourceOptions();

        expect(options.type).toBe('mariadb');
        expect(options.host).toBe('localhost');
        expect(options.port).toBe(3306);
        expect(options.username).toBe('root');
        expect(options.password).toBe('password');
        expect(options.database).toBe('test_db');
        expect(options.synchronize).toBe(false);
    });

    test('includes timezone and dateStrings configuration', () => {
        const options = createDataSourceOptions();

        expect(options.timezone).toBe('Z');
        expect(options.dateStrings).toEqual(['DATE']);
    });

    test('includes entities, migrations, and subscribers arrays', () => {
        const options = createDataSourceOptions();

        expect(options.entities).toEqual([]);
        expect(options.migrations).toEqual([]);
        expect(options.subscribers).toEqual([]);
    });
});

describe('initDataSource', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the initialized state by re-requiring the module
        // The module-level `initialized` variable needs to be reset
    });

    test('synchronizes schema on empty database then runs migrations', async () => {
        mockQuery.mockResolvedValueOnce(emptyDatabaseResult);
        mockRunMigrations.mockResolvedValueOnce(appliedMigrations);

        await initDataSource();

        expect(mockInitialize).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('information_schema.tables')
        );
        expect(mockSynchronize).toHaveBeenCalledTimes(1);
        expect(mockRunMigrations).toHaveBeenCalledTimes(1);
    });

    test('skips synchronize on populated database', async () => {
        // Need to reset module to clear `initialized` flag
        jest.resetModules();

        // Re-mock everything since resetModules clears them
        jest.mock('../../src/modules/settings', () => ({
            __esModule: true,
            default: {
                value: {initialized: true, dbType: 'mariadb', dbHost: 'localhost', dbPort: 3306, dbUser: 'root', dbPassword: 'password', dbName: 'test_db'},
                read: jest.fn(),
            },
        }));
        jest.mock('../../src/modules/database/__index__', () => ({entities: [], migrations: [], subscribers: []}));

        const mockInit2 = jest.fn();
        const mockSync2 = jest.fn();
        const mockRun2 = jest.fn().mockResolvedValue(noMigrations);
        const mockQuery2 = jest.fn().mockResolvedValue(populatedDatabaseResult);

        jest.mock('typeorm', () => ({
            DataSource: jest.fn().mockImplementation(() => ({
                initialize: mockInit2,
                synchronize: mockSync2,
                runMigrations: mockRun2,
                query: mockQuery2,
            })),
        }));

        const {initDataSource: initDS2} = require('../../src/modules/database/dataSource');
        await initDS2();

        expect(mockInit2).toHaveBeenCalledTimes(1);
        expect(mockSync2).not.toHaveBeenCalled();
        expect(mockRun2).toHaveBeenCalledTimes(1);
    });
});
