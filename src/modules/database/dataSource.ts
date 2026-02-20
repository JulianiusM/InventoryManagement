import {DataSource} from 'typeorm';
import settings from '../settings';
import {entities, migrations, subscribers} from "./__index__";

export let AppDataSource: DataSource;
let initialized: boolean = false;

export function createDataSourceOptions() {
    return {
        type: settings.value.dbType,
        host: settings.value.dbHost,
        port: settings.value.dbPort,
        username: settings.value.dbUser,
        password: settings.value.dbPassword,
        database: settings.value.dbName,
        timezone: 'Z',              // treat TIMESTAMP / DATETIME as UTC
        dateStrings: ['DATE'],       // A & B: return DATE as **string**
        entities: entities,
        migrations: migrations,
        subscribers: subscribers,
        synchronize: false as const,
    };
}

export async function initDataSource() {
    if (initialized) {
        return;
    }

    if (!settings.value.initialized) {
        await settings.read();
    }

    AppDataSource = new DataSource(createDataSourceOptions());

    await AppDataSource.initialize();

    // Auto-setup: on a fresh (empty) database, synchronize the schema from
    // entities first so that subsequent migrations can run against real tables.
    const rows = await AppDataSource.query(
        "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE()"
    );
    const tableCount = parseInt(rows[0].cnt, 10);
    if (tableCount === 0) {
        console.log('📦 Empty database detected — synchronizing schema...');
        await AppDataSource.synchronize();
    }

    // Always run pending migrations (TypeORM tracks which have already been applied).
    console.log('📦 Running pending migrations...');
    const applied = await AppDataSource.runMigrations();
    if (applied.length > 0) {
        console.log(`✅ Applied ${applied.length} migration(s): ${applied.map(m => m.name).join(', ')}`);
    } else {
        console.log('✅ Database is up to date — no pending migrations.');
    }

    initialized = true;
}