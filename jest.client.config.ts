// jest.client.config.ts
// Jest configuration for frontend (client-side) tests
import type {Config} from 'jest';

const config: Config = {
    displayName: 'client',

    // Use ts-jest for TS support
    preset: 'ts-jest',

    /**
     * IMPORTANT: Use "jest-fixed-jsdom" instead of "jest-environment-jsdom".
     *
     * This keeps a DOM via jsdom but restores Node.js globals
     * (fetch, Request, Response, TextEncoder, TextDecoder, streams, etc.)
     * so MSW and any Node-ish code work correctly.
     */
    testEnvironment: 'jest-fixed-jsdom',

    rootDir: '.',
    roots: ['<rootDir>/src/public/js', '<rootDir>/tests/client'],
    testMatch: ['<rootDir>/tests/client/**/*.(test|spec).ts'],

    // Setup files
    setupFiles: [],
    setupFilesAfterEnv: ['<rootDir>/tests/client/setupTests.ts'],

    // Module resolution
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        // Handle CSS imports (ignore them in tests)
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/client/mocks/styleMock.ts',
        // Keep the UUID stub from main config
        '^uuid$': '<rootDir>/tests/util/stubs/uuid.ts',
    },

    /**
     * Transform MSW and its dependencies (ESM) so Jest can run them.
     * You already had this in place; keep it.
     */
    transformIgnorePatterns: [
        'node_modules/(?!(msw|@mswjs|@bundled-es-modules|until-async|strict-event-emitter|@open-draft)/)',
    ],

    // Transform configuration
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: {
                    target: 'ES2020',
                    module: 'ESNext',
                    moduleResolution: 'node',
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    strict: true,
                    skipLibCheck: true,
                    resolveJsonModule: true,
                    isolatedModules: true,
                    lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                    types: ['jest', 'node', 'jsdom', '@testing-library/jest-dom'],
                },
            },
        ],
        '^.+\\.jsx?$': [
            'ts-jest',
            {
                tsconfig: {
                    target: 'ES2020',
                    module: 'ESNext',
                    moduleResolution: 'node',
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    allowJs: true,
                    skipLibCheck: true,
                },
            },
        ],
    },

    // Coverage configuration
    collectCoverageFrom: [
        'src/public/js/**/*.ts',
        '!src/public/js/**/*.d.ts',
        '!src/public/js/**/*.gen.js',
        '!src/public/js/**/stub.ts',
    ],
    coverageDirectory: 'coverage/client',
    coverageReporters: ['text', 'lcov', 'html'],
    // coverageThreshold can be enabled once you have more tests

    // Test timeout
    testTimeout: 10000,

    /**
     * jsdom URL & MSW export conditions:
     *
     * - url: base URL for relative requests like "/api/...".
     * - customExportConditions: ['msw'] makes imports like "msw/node"
     *   resolve correctly even when running under a jsdom-like env.
     */
    testEnvironmentOptions: {
        url: 'http://localhost',
        customExportConditions: ['msw'],
    },
};

export default config;
