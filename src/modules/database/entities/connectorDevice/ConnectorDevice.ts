import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {ExternalAccount} from "../externalAccount/ExternalAccount";

/**
 * ConnectorDevice entity
 * Represents a device (agent) that can push data to an external account
 * Used by push-style connectors like Playnite
 */
@Entity("connector_devices")
export class ConnectorDevice {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => ExternalAccount, {onDelete: "CASCADE"})
    @JoinColumn({name: "external_account_id"})
    externalAccount!: ExternalAccount;

    @RelationId((device: ConnectorDevice) => device.externalAccount)
    externalAccountId!: string;

    @Column("varchar", {name: "name", length: 255})
    name!: string;

    @Column("varchar", {name: "token_hash", length: 255})
    tokenHash!: string;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;

    @Column("timestamp", {name: "last_seen_at", nullable: true})
    lastSeenAt?: Date | null;

    @Column("timestamp", {name: "last_import_at", nullable: true})
    lastImportAt?: Date | null;

    @Column("timestamp", {name: "revoked_at", nullable: true})
    revokedAt?: Date | null;
}
