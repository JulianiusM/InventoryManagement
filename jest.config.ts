// jest.config.ts
import type {Config} from 'jest';

const base: Config = {
    testEnvironment: 'node',
    rootDir: '.',
    moduleFileExtensions: ['ts', 'js', 'json'],
    setupFiles: ['<rootDir>/tests/env.load.ts'],
    setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.ts'],
    transform: {
        '^.+\\.tsx?$': ['ts-jest', {tsconfig: '<rootDir>/tsconfig.test.json'}],
    },
    moduleNameMapper: {
        '^marked$': '<rootDir>/tests/util/stubs/marked.ts',
        '^openid-client$': '<rootDir>/tests/util/stubs/openid-client.ts',
        '^oauth4webapi$': '<rootDir>/tests/util/stubs/oauth4webapi.ts',
        '^uuid$': '<rootDir>/tests/util/stubs/uuid.ts',
        '^nodemailer$': '<rootDir>/tests/util/stubs/nodemailer.ts',
        '^connect-typeorm$': '<rootDir>/tests/util/stubs/connect-typeorm.ts',
        '^morgan$': '<rootDir>/tests/util/stubs/morgan.ts',
    },
};

const config: Config = {
    // Split into two projects so we can serialize DB tests only
    projects: [
        {
            ...base,
            displayName: 'unit',
            testMatch: ['<rootDir>/tests/unit/**/*.(test|spec).ts'],
        },
        {
            ...base,
            displayName: 'controller',
            testMatch: ['<rootDir>/tests/controller/**/*.(test|spec).ts'],
        },
        {
            ...base,
            displayName: 'middleware',
            testMatch: ['<rootDir>/tests/middleware/**/*.(test|spec).ts'],
        },
        {
            ...base,
            displayName: 'frontend',
            testMatch: ['<rootDir>/tests/frontend/**/*.(test|spec).ts'],
        },
        {
            ...base,
            displayName: 'db',
            testMatch: ['<rootDir>/tests/database/**/*.(test|spec).ts'],
            // serialize DB tests to avoid cross-test interference
            maxWorkers: 1,
            runner: 'jest-serial-runner',
            // optional: add DB-specific setup (e.g., per-worker DB/envs) if you have it
            setupFilesAfterEnv: [
                '<rootDir>/tests/jest.setup.ts',
                '<rootDir>/tests/jest.setup.db.ts', // create this if you need DB hooks
            ],
            // optional: give integration tests more time
            testTimeout: 30000,
        },
    ],
};

export default config;
