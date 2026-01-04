import {DataSource} from 'typeorm';
import settings from '../settings';
import {entities, migrations, subscribers} from "./__index__";

export let AppDataSource: DataSource;
let initialized: boolean = false;

export async function initDataSource() {
    if (initialized) {
        return;
    }

    if (!settings.value.initialized) {
        await settings.read();
    }

    AppDataSource = new DataSource({
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
        synchronize: false,
    });

    await AppDataSource.initialize();
    initialized = true;
}