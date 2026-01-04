import {DataSource} from 'typeorm';

const env = (k: string, d?: string) => process.env[k] ?? d ?? '';

const host = env('TEST_DB_HOST', '127.0.0.1');
const port = Number(env('TEST_DB_PORT', '3306'));
const user = env('TEST_DB_USER', 'root');
const password = env('TEST_DB_PASSWORD', 'password');
const database = env('TEST_DB_NAME', 'surveyor_test');
const logging = env('TEST_DB_LOGGING', 'false') === 'true';

export const AppDataSource = new DataSource({
    type: 'mariadb',
    host,
    port,
    username: user,
    password,
    database,
    logging,
    timezone: 'Z' as any,
    // @ts-ignore common driver option
    dateStrings: ['DATE'],
    entities: ['src/modules/database/entities/**/*.ts'],
    migrations: ['src/migrations/*.ts'],
    subscribers: ['src/modules/database/subscribers/**/*.ts'],
    // Enable synchronize for tests to automatically create schema
    // This works around the need for initial migration
    synchronize: true,
});

export async function initDataSource() {
    if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
        // Synchronize is enabled in config above
        // After sync, run migrations (now idempotent with IF NOT EXISTS clauses)
        await AppDataSource.runMigrations();
    }
}
