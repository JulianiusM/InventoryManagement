import {MigrationInterface, QueryRunner} from "typeorm";

export class CreateInventoryTables1735993200000 implements MigrationInterface {
    name = 'CreateInventoryTables1735993200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create locations table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS locations (
                id VARCHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                kind ENUM('room', 'shelf', 'box', 'bin', 'drawer', 'cabinet', 'other') NOT NULL DEFAULT 'other',
                parent_id VARCHAR(36) NULL,
                qr_code VARCHAR(255) NULL,
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE INDEX location_qr_code (qr_code),
                INDEX FK_location_parent (parent_id),
                INDEX FK_location_owner (owner_id),
                CONSTRAINT FK_location_parent FOREIGN KEY (parent_id) REFERENCES locations(id) ON DELETE SET NULL,
                CONSTRAINT FK_location_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create items table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS items (
                id VARCHAR(36) NOT NULL,
                name VARCHAR(255) NOT NULL,
                type ENUM('book', 'tool', 'game', 'electronics', 'clothing', 'collectible', 'other') NOT NULL DEFAULT 'other',
                description TEXT NULL,
                \`condition\` ENUM('new', 'like_new', 'good', 'fair', 'poor') NULL,
                serial_number VARCHAR(255) NULL,
                tags JSON NULL,
                location_id VARCHAR(36) NULL,
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_item_location (location_id),
                INDEX FK_item_owner (owner_id),
                CONSTRAINT FK_item_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
                CONSTRAINT FK_item_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create barcodes table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS barcodes (
                id VARCHAR(36) NOT NULL,
                code VARCHAR(255) NOT NULL,
                symbology ENUM('EAN13', 'EAN8', 'UPC_A', 'UPC_E', 'QR', 'CODE128', 'CODE39', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
                item_id VARCHAR(36) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE INDEX barcode_code (code),
                INDEX FK_barcode_item (item_id),
                CONSTRAINT FK_barcode_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create parties table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS parties (
                id VARCHAR(36) NOT NULL,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) NULL,
                phone VARCHAR(50) NULL,
                notes TEXT NULL,
                owner_id INT NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_party_owner (owner_id),
                CONSTRAINT FK_party_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create loans table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS loans (
                id VARCHAR(36) NOT NULL,
                item_id VARCHAR(36) NOT NULL,
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
                INDEX FK_loan_item (item_id),
                INDEX FK_loan_party (party_id),
                INDEX FK_loan_owner (owner_id),
                CONSTRAINT FK_loan_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                CONSTRAINT FK_loan_party FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
                CONSTRAINT FK_loan_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);

        // Create item_movements table (audit log)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS item_movements (
                id VARCHAR(36) NOT NULL,
                item_id VARCHAR(36) NOT NULL,
                from_location_id VARCHAR(36) NULL,
                to_location_id VARCHAR(36) NULL,
                note TEXT NULL,
                moved_by_user_id INT NULL,
                moved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX FK_movement_item (item_id),
                INDEX FK_movement_from_location (from_location_id),
                INDEX FK_movement_to_location (to_location_id),
                INDEX FK_movement_user (moved_by_user_id),
                CONSTRAINT FK_movement_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                CONSTRAINT FK_movement_from_location FOREIGN KEY (from_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                CONSTRAINT FK_movement_to_location FOREIGN KEY (to_location_id) REFERENCES locations(id) ON DELETE SET NULL,
                CONSTRAINT FK_movement_user FOREIGN KEY (moved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order of creation (to respect foreign key constraints)
        await queryRunner.query(`DROP TABLE IF EXISTS item_movements`);
        await queryRunner.query(`DROP TABLE IF EXISTS loans`);
        await queryRunner.query(`DROP TABLE IF EXISTS parties`);
        await queryRunner.query(`DROP TABLE IF EXISTS barcodes`);
        await queryRunner.query(`DROP TABLE IF EXISTS items`);
        await queryRunner.query(`DROP TABLE IF EXISTS locations`);
    }
}
