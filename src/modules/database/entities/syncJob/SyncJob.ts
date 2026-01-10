import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {ExternalAccount} from "../externalAccount/ExternalAccount";
import {User} from "../user/User";
import {SyncStatus, SyncJobType} from "../../../../types/InventoryEnums";

@Entity("sync_jobs")
export class SyncJob {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => ExternalAccount, (account) => account.syncJobs, {onDelete: "CASCADE", nullable: true})
    @JoinColumn({name: "external_account_id"})
    externalAccount?: ExternalAccount | null;

    @RelationId((job: SyncJob) => job.externalAccount)
    externalAccountId?: string | null;

    @Column({
        type: "enum",
        enum: SyncJobType,
        default: SyncJobType.ACCOUNT_SYNC,
        name: "job_type",
    })
    jobType!: SyncJobType;

    @Column({
        type: "enum",
        enum: SyncStatus,
        default: SyncStatus.PENDING,
    })
    status!: SyncStatus;

    @Column("timestamp", {name: "started_at", nullable: true})
    startedAt?: Date | null;

    @Column("timestamp", {name: "completed_at", nullable: true})
    completedAt?: Date | null;

    @Column("int", {name: "entries_processed", nullable: true})
    entriesProcessed?: number | null;

    @Column("int", {name: "entries_added", nullable: true})
    entriesAdded?: number | null;

    @Column("int", {name: "entries_updated", nullable: true})
    entriesUpdated?: number | null;

    @Column("text", {name: "error_message", nullable: true})
    errorMessage?: string | null;
    
    @ManyToOne(() => User, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "owner_id"})
    owner?: User | null;
    
    @RelationId((job: SyncJob) => job.owner)
    ownerId?: number | null;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
