import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {User} from "../user/User";
import {GameTitle} from "../gameTitle/GameTitle";
import {GameRelease} from "../gameRelease/GameRelease";
import {MappingStatus} from "../../../../types/InventoryEnums";

@Entity("game_external_mappings")
export class GameExternalMapping {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    // Changed from enum to varchar for user-defined providers (Issue 6)
    @Column("varchar", {name: "provider", length: 100})
    provider!: string;

    @Column("varchar", {name: "external_game_id", length: 255})
    externalGameId!: string;

    @ManyToOne(() => GameTitle, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "game_title_id"})
    gameTitle?: GameTitle | null;

    @RelationId((mapping: GameExternalMapping) => mapping.gameTitle)
    gameTitleId?: string | null;

    @ManyToOne(() => GameRelease, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "game_release_id"})
    gameRelease?: GameRelease | null;

    @RelationId((mapping: GameExternalMapping) => mapping.gameRelease)
    gameReleaseId?: string | null;

    @Column({
        type: "enum",
        enum: MappingStatus,
        default: MappingStatus.PENDING,
    })
    status!: MappingStatus;

    @Column("varchar", {name: "external_game_name", length: 255, nullable: true})
    externalGameName?: string | null;

    @Column("float", {name: "confidence_score", nullable: true})
    confidenceScore?: number | null;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((mapping: GameExternalMapping) => mapping.owner)
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
