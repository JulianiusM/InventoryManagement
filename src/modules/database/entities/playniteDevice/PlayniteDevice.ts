import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {User} from "../user/User";

@Entity("playnite_devices")
export class PlayniteDevice {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "user_id"})
    user!: User;

    @RelationId((device: PlayniteDevice) => device.user)
    userId!: number;

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
