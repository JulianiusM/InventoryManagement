import {MigrationInterface, QueryRunner} from "typeorm";

export class CreateGamesTables1736092800000 implements MigrationInterface {
    name = 'CreateGamesTables1736092800000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create game_titles table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS game_titles (
                id VARCHAR(36) NOT NULL,
                name VARCHAR(255) NOT NULL,
                type ENUM('video_game', 'board_game', 'card_game', 'tabletop_rpg', 'other_physical_game') NOT NULL DEFAULT 'video_game',
                description TEXT NULL,
                cover_image_url VARCHAR(500) NULL,
                
                -- Overall player counts (required)
                overall_min_players INT NOT NULL DEFAULT 1,
                overall_max_players INT NOT NULL DEFAULT 1,
                
                -- Multiplayer mode support flags (required)
                supports_online BOOLEAN NOT NULL DEFAULT FALSE,
                supports_local BOOLEAN NOT NULL DEFAULT FALSE,
                supports_physical BOOLEAN NOT NULL DEFAULT FALSE,
                
                -- Per-mode player counts (optional, only if mode is supported)
                online_min_players INT NULL,
                online_max_players INT NULL,
                local_min_players INT NULL,
                local_max_players INT NULL,
                physical_min_players INT NULL,
                physical_max_players INT NULL,
                
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_game_title_owner (owner_id),
                CONSTRAINT FK_game_title_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create game_releases table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS game_releases (
                id VARCHAR(36) NOT NULL,
                game_title_id VARCHAR(36) NOT NULL,
                platform ENUM('pc', 'ps5', 'ps4', 'xbox_series', 'xbox_one', 'switch', 'mobile', 'physical_only', 'other') NOT NULL DEFAULT 'other',
                edition VARCHAR(100) NULL,
                region VARCHAR(50) NULL,
                release_date DATE NULL,
                
                -- Optional player count override
                players_override_min INT NULL,
                players_override_max INT NULL,
                
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_game_release_title (game_title_id),
                INDEX FK_game_release_owner (owner_id),
                CONSTRAINT FK_game_release_title FOREIGN KEY (game_title_id) REFERENCES game_titles(id) ON DELETE CASCADE,
                CONSTRAINT FK_game_release_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create external_accounts table (for connector integration)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS external_accounts (
                id VARCHAR(36) NOT NULL,
                provider ENUM('steam', 'epic', 'gog', 'xbox', 'playstation', 'nintendo', 'origin', 'ubisoft', 'other') NOT NULL,
                account_name VARCHAR(255) NOT NULL,
                external_user_id VARCHAR(255) NULL,
                token_ref VARCHAR(500) NULL,
                last_synced_at TIMESTAMP NULL,
                
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_external_account_owner (owner_id),
                UNIQUE INDEX UQ_external_account_provider_user (provider, external_user_id, owner_id),
                CONSTRAINT FK_external_account_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create game_copies table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS game_copies (
                id VARCHAR(36) NOT NULL,
                game_release_id VARCHAR(36) NOT NULL,
                copy_type ENUM('digital_license', 'physical_copy') NOT NULL,
                
                -- Digital license fields
                external_account_id VARCHAR(36) NULL,
                external_game_id VARCHAR(255) NULL,
                entitlement_id VARCHAR(255) NULL,
                playtime_minutes INT NULL,
                last_played_at TIMESTAMP NULL,
                is_installed BOOLEAN NULL,
                
                -- Physical copy fields
                location_id VARCHAR(36) NULL,
                \`condition\` ENUM('new', 'like_new', 'good', 'fair', 'poor') NULL,
                notes TEXT NULL,
                
                -- Common fields
                lendable BOOLEAN NOT NULL DEFAULT TRUE,
                acquired_at DATE NULL,
                
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_game_copy_release (game_release_id),
                INDEX FK_game_copy_external_account (external_account_id),
                INDEX FK_game_copy_location (location_id),
                INDEX FK_game_copy_owner (owner_id),
                CONSTRAINT FK_game_copy_release FOREIGN KEY (game_release_id) REFERENCES game_releases(id) ON DELETE CASCADE,
                CONSTRAINT FK_game_copy_external_account FOREIGN KEY (external_account_id) REFERENCES external_accounts(id) ON DELETE SET NULL,
                CONSTRAINT FK_game_copy_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
                CONSTRAINT FK_game_copy_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create game_copy_barcodes table (physical copies can have barcodes)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS game_copy_barcodes (
                id VARCHAR(36) NOT NULL,
                code VARCHAR(255) NOT NULL,
                symbology ENUM('EAN13', 'EAN8', 'UPC_A', 'UPC_E', 'QR', 'CODE128', 'CODE39', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
                game_copy_id VARCHAR(36) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE INDEX game_copy_barcode_code (code),
                INDEX FK_game_copy_barcode_copy (game_copy_id),
                CONSTRAINT FK_game_copy_barcode_copy FOREIGN KEY (game_copy_id) REFERENCES game_copies(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create game_copy_loans table (for physical copy lending)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS game_copy_loans (
                id VARCHAR(36) NOT NULL,
                game_copy_id VARCHAR(36) NOT NULL,
                party_id VARCHAR(36) NOT NULL,
                direction ENUM('lend', 'borrow') NOT NULL,
                status ENUM('active', 'returned', 'overdue') NOT NULL DEFAULT 'active',
                start_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                due_at DATE NULL,
                returned_at TIMESTAMP NULL,
                condition_out ENUM('new', 'like_new', 'good', 'fair', 'poor') NULL,
                condition_in ENUM('new', 'like_new', 'good', 'fair', 'poor') NULL,
                notes TEXT NULL,
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_game_copy_loan_copy (game_copy_id),
                INDEX FK_game_copy_loan_party (party_id),
                INDEX FK_game_copy_loan_owner (owner_id),
                CONSTRAINT FK_game_copy_loan_copy FOREIGN KEY (game_copy_id) REFERENCES game_copies(id) ON DELETE CASCADE,
                CONSTRAINT FK_game_copy_loan_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
                CONSTRAINT FK_game_copy_loan_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create external_library_entries table (sync snapshots)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS external_library_entries (
                id VARCHAR(36) NOT NULL,
                external_account_id VARCHAR(36) NOT NULL,
                external_game_id VARCHAR(255) NOT NULL,
                external_game_name VARCHAR(255) NOT NULL,
                raw_payload JSON NULL,
                playtime_minutes INT NULL,
                last_played_at TIMESTAMP NULL,
                is_installed BOOLEAN NULL,
                last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE INDEX UQ_external_library_entry (external_account_id, external_game_id),
                INDEX FK_external_library_entry_account (external_account_id),
                CONSTRAINT FK_external_library_entry_account FOREIGN KEY (external_account_id) REFERENCES external_accounts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create game_external_mappings table (manual mappings for sync)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS game_external_mappings (
                id VARCHAR(36) NOT NULL,
                provider ENUM('steam', 'epic', 'gog', 'xbox', 'playstation', 'nintendo', 'origin', 'ubisoft', 'other') NOT NULL,
                external_game_id VARCHAR(255) NOT NULL,
                game_title_id VARCHAR(36) NULL,
                game_release_id VARCHAR(36) NULL,
                status ENUM('pending', 'mapped', 'ignored') NOT NULL DEFAULT 'pending',
                external_game_name VARCHAR(255) NULL,
                confidence_score FLOAT NULL,
                
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE INDEX UQ_game_mapping (provider, external_game_id, owner_id),
                INDEX FK_game_mapping_title (game_title_id),
                INDEX FK_game_mapping_release (game_release_id),
                INDEX FK_game_mapping_owner (owner_id),
                CONSTRAINT FK_game_mapping_title FOREIGN KEY (game_title_id) REFERENCES game_titles(id) ON DELETE SET NULL,
                CONSTRAINT FK_game_mapping_release FOREIGN KEY (game_release_id) REFERENCES game_releases(id) ON DELETE SET NULL,
                CONSTRAINT FK_game_mapping_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create sync_jobs table (track sync operations)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS sync_jobs (
                id VARCHAR(36) NOT NULL,
                external_account_id VARCHAR(36) NOT NULL,
                status ENUM('pending', 'in_progress', 'completed', 'failed') NOT NULL DEFAULT 'pending',
                started_at TIMESTAMP NULL,
                completed_at TIMESTAMP NULL,
                entries_processed INT NULL,
                entries_added INT NULL,
                entries_updated INT NULL,
                error_message TEXT NULL,
                
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_sync_job_account (external_account_id),
                CONSTRAINT FK_sync_job_account FOREIGN KEY (external_account_id) REFERENCES external_accounts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order of creation (to respect foreign key constraints)
        await queryRunner.query(`DROP TABLE IF EXISTS sync_jobs`);
        await queryRunner.query(`DROP TABLE IF EXISTS game_external_mappings`);
        await queryRunner.query(`DROP TABLE IF EXISTS external_library_entries`);
        await queryRunner.query(`DROP TABLE IF EXISTS game_copy_loans`);
        await queryRunner.query(`DROP TABLE IF EXISTS game_copy_barcodes`);
        await queryRunner.query(`DROP TABLE IF EXISTS game_copies`);
        await queryRunner.query(`DROP TABLE IF EXISTS external_accounts`);
        await queryRunner.query(`DROP TABLE IF EXISTS game_releases`);
        await queryRunner.query(`DROP TABLE IF EXISTS game_titles`);
    }
}
