import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {ExternalAccount} from "../externalAccount/ExternalAccount";

@Entity("external_library_entries")
export class ExternalLibraryEntry {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => ExternalAccount, (account) => account.libraryEntries, {onDelete: "CASCADE"})
    @JoinColumn({name: "external_account_id"})
    externalAccount!: ExternalAccount;

    @RelationId((entry: ExternalLibraryEntry) => entry.externalAccount)
    externalAccountId!: string;

    @Column("varchar", {name: "external_game_id", length: 255})
    externalGameId!: string;

    @Column("varchar", {name: "external_game_name", length: 255})
    externalGameName!: string;

    @Column("simple-json", {name: "raw_payload", nullable: true})
    rawPayload?: object | null;

    @Column("int", {name: "playtime_minutes", nullable: true})
    playtimeMinutes?: number | null;

    @Column("timestamp", {name: "last_played_at", nullable: true})
    lastPlayedAt?: Date | null;

    @Column("boolean", {name: "is_installed", nullable: true})
    isInstalled?: boolean | null;

    @Column("timestamp", {
        name: "last_seen_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    lastSeenAt!: Date;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;

    @Column("timestamp", {
        name: "updated_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    updatedAt!: Date;
}
