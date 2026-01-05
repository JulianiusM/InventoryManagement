import {
    Column,
    Entity,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {User} from "../user/User";
import {GameProvider} from "../../../../types/InventoryEnums";
import {GameCopy} from "../gameCopy/GameCopy";
import {ExternalLibraryEntry} from "../externalLibraryEntry/ExternalLibraryEntry";
import {SyncJob} from "../syncJob/SyncJob";

@Entity("external_accounts")
export class ExternalAccount {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({
        type: "enum",
        enum: GameProvider,
    })
    provider!: GameProvider;

    @Column("varchar", {name: "account_name", length: 255})
    accountName!: string;

    @Column("varchar", {name: "external_user_id", length: 255, nullable: true})
    externalUserId?: string | null;

    @Column("varchar", {name: "token_ref", length: 500, nullable: true})
    tokenRef?: string | null;

    @Column("timestamp", {name: "last_synced_at", nullable: true})
    lastSyncedAt?: Date | null;

    @OneToMany(() => GameCopy, (copy) => copy.externalAccount)
    copies?: GameCopy[];

    @OneToMany(() => ExternalLibraryEntry, (entry) => entry.externalAccount)
    libraryEntries?: ExternalLibraryEntry[];

    @OneToMany(() => SyncJob, (job) => job.externalAccount)
    syncJobs?: SyncJob[];

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((account: ExternalAccount) => account.owner)
    ownerId!: number;

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
