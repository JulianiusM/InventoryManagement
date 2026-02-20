/**
 * Compiled CLI tool for database migration management.
 *
 * Works in release builds (no ts-node required) — run with:
 *   node dist/cli/migrate.js <command>
 *
 * Commands:
 *   run      – Apply all pending migrations (default)
 *   revert   – Revert the last applied migration
 *   show     – Show migration status (pending / applied)
 */

import {DataSource} from 'typeorm';
import settings from '../modules/settings';
import {createDataSourceOptions} from '../modules/database/dataSource';

const USAGE = `
Usage: node dist/cli/migrate.js <command>

Commands:
  run      Apply all pending migrations (default)
  revert   Revert the last applied migration
  show     Show migration status (pending / applied)
`.trim();

async function main() {
    const command = process.argv[2] ?? 'run';

    if (['--help', '-h'].includes(command)) {
        console.log(USAGE);
        process.exit(0);
    }

    if (!['run', 'revert', 'show'].includes(command)) {
        console.error(`Unknown command: "${command}"\n`);
        console.error(USAGE);
        process.exit(1);
    }

    // Initialize settings (reads CSV / env vars)
    if (!settings.value.initialized) {
        await settings.read();
    }

    const dataSource = new DataSource(createDataSourceOptions());

    try {
        await dataSource.initialize();

        switch (command) {
            case 'run': {
                const applied = await dataSource.runMigrations();
                if (applied.length > 0) {
                    console.log(`✅ Applied ${applied.length} migration(s):`);
                    for (const m of applied) console.log(`   - ${m.name}`);
                } else {
                    console.log('✅ Database is up to date — no pending migrations.');
                }
                break;
            }

            case 'revert': {
                await dataSource.undoLastMigration();
                console.log('✅ Last migration reverted.');
                break;
            }

            case 'show': {
                const hasPending = await dataSource.showMigrations();
                if (hasPending) {
                    console.log('⏳ There are pending migrations. Run "migrate run" to apply them.');
                } else {
                    console.log('✅ All migrations have been applied.');
                }
                break;
            }
        }
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        if (dataSource.isInitialized) {
            await dataSource.destroy();
        }
    }
}

main();
