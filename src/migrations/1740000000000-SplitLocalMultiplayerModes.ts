import {MigrationInterface, QueryRunner} from "typeorm";

/**
 * Split local multiplayer into separate Couch Co-op and LAN modes.
 * 
 * game_titles:
 *   - supports_local → supports_local_couch + supports_local_lan
 *   - local_min_players → couch_min_players (+ lan_min_players as null)
 *   - local_max_players → couch_max_players (+ lan_max_players as null)
 * 
 * game_releases:
 *   - override_supports_local → override_supports_local_couch + override_supports_local_lan
 *   - override_local_min → override_couch_min (+ override_lan_min as null)
 *   - override_local_max → override_couch_max (+ override_lan_max as null)
 * 
 * Data migration: existing local data defaults to couch co-op mode.
 * 
 * Idempotent: safe to run after TypeORM synchronize (fresh DB).
 */
export class SplitLocalMultiplayerModes1740000000000 implements MigrationInterface {

    private async columnExists(queryRunner: QueryRunner, table: string, column: string): Promise<boolean> {
        const result = await queryRunner.query(
            `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
            [table, column]
        );
        return Number(result[0]?.cnt) > 0;
    }

    public async up(queryRunner: QueryRunner): Promise<void> {
        // If the old column doesn't exist, the schema is already up-to-date (e.g. fresh DB via synchronize)
        const needsMigration = await this.columnExists(queryRunner, 'game_titles', 'supports_local');
        if (!needsMigration) {
            return;
        }

        // === game_titles ===

        // Add new boolean columns
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN supports_local_couch BOOLEAN NOT NULL DEFAULT FALSE`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN supports_local_lan BOOLEAN NOT NULL DEFAULT FALSE`
        );

        // Migrate supports_local → supports_local_couch (default existing local to couch)
        await queryRunner.query(
            `UPDATE game_titles SET supports_local_couch = supports_local WHERE supports_local = TRUE`
        );

        // Add new player count columns
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN couch_min_players INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN couch_max_players INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN lan_min_players INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN lan_max_players INT NULL`
        );

        // Migrate local player counts → couch player counts
        await queryRunner.query(
            `UPDATE game_titles SET couch_min_players = local_min_players, couch_max_players = local_max_players WHERE supports_local = TRUE`
        );

        // Drop old columns
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN supports_local`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN local_min_players`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN local_max_players`
        );

        // === game_releases ===

        // Add new override boolean columns
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_supports_local_couch BOOLEAN NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_supports_local_lan BOOLEAN NULL`
        );

        // Migrate override_supports_local → override_supports_local_couch
        await queryRunner.query(
            `UPDATE game_releases SET override_supports_local_couch = override_supports_local WHERE override_supports_local IS NOT NULL`
        );

        // Add new override player count columns
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_couch_min INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_couch_max INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_lan_min INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_lan_max INT NULL`
        );

        // Migrate override local player counts → override couch player counts
        await queryRunner.query(
            `UPDATE game_releases SET override_couch_min = override_local_min, override_couch_max = override_local_max WHERE override_local_min IS NOT NULL OR override_local_max IS NOT NULL`
        );

        // Drop old columns
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_supports_local`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_local_min`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_local_max`
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // If the old column already exists, nothing to revert (e.g. migration was skipped)
        const needsRevert = await this.columnExists(queryRunner, 'game_titles', 'supports_local_couch');
        if (!needsRevert) {
            return;
        }

        // === game_titles ===

        // Re-add old columns
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN supports_local BOOLEAN NOT NULL DEFAULT FALSE`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN local_min_players INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles ADD COLUMN local_max_players INT NULL`
        );

        // Merge couch + LAN back to single local (OR logic for boolean, couch values for counts)
        await queryRunner.query(
            `UPDATE game_titles SET supports_local = (supports_local_couch OR supports_local_lan)`
        );
        await queryRunner.query(
            `UPDATE game_titles SET local_min_players = COALESCE(couch_min_players, lan_min_players), local_max_players = COALESCE(couch_max_players, lan_max_players) WHERE supports_local_couch = TRUE OR supports_local_lan = TRUE`
        );

        // Drop new columns
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN supports_local_couch`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN supports_local_lan`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN couch_min_players`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN couch_max_players`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN lan_min_players`
        );
        await queryRunner.query(
            `ALTER TABLE game_titles DROP COLUMN lan_max_players`
        );

        // === game_releases ===

        // Re-add old columns
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_supports_local BOOLEAN NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_local_min INT NULL`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases ADD COLUMN override_local_max INT NULL`
        );

        // Merge back
        await queryRunner.query(
            `UPDATE game_releases SET override_supports_local = COALESCE(override_supports_local_couch, override_supports_local_lan) WHERE override_supports_local_couch IS NOT NULL OR override_supports_local_lan IS NOT NULL`
        );
        await queryRunner.query(
            `UPDATE game_releases SET override_local_min = COALESCE(override_couch_min, override_lan_min), override_local_max = COALESCE(override_couch_max, override_lan_max) WHERE override_couch_min IS NOT NULL OR override_couch_max IS NOT NULL OR override_lan_min IS NOT NULL OR override_lan_max IS NOT NULL`
        );

        // Drop new columns
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_supports_local_couch`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_supports_local_lan`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_couch_min`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_couch_max`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_lan_min`
        );
        await queryRunner.query(
            `ALTER TABLE game_releases DROP COLUMN override_lan_max`
        );
    }
}
