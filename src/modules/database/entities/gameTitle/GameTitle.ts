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
import {GameRelease} from "../gameRelease/GameRelease";
import {GameType} from "../../../../types/InventoryEnums";

@Entity("game_titles")
export class GameTitle {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "name", length: 255})
    name!: string;

    @Column({
        type: "enum",
        enum: GameType,
        default: GameType.VIDEO_GAME,
    })
    type!: GameType;

    @Column("text", {name: "description", nullable: true})
    description?: string | null;

    @Column("varchar", {name: "cover_image_url", length: 500, nullable: true})
    coverImageUrl?: string | null;

    // Overall player counts (required)
    @Column("int", {name: "overall_min_players", default: 1})
    overallMinPlayers!: number;

    @Column("int", {name: "overall_max_players", default: 1})
    overallMaxPlayers!: number;

    // Multiplayer mode support flags (required)
    @Column("boolean", {name: "supports_online", default: false})
    supportsOnline!: boolean;

    @Column("boolean", {name: "supports_local", default: false})
    supportsLocal!: boolean;

    @Column("boolean", {name: "supports_physical", default: false})
    supportsPhysical!: boolean;

    // Per-mode player counts (optional)
    @Column("int", {name: "online_min_players", nullable: true})
    onlineMinPlayers?: number | null;

    @Column("int", {name: "online_max_players", nullable: true})
    onlineMaxPlayers?: number | null;

    @Column("int", {name: "local_min_players", nullable: true})
    localMinPlayers?: number | null;

    @Column("int", {name: "local_max_players", nullable: true})
    localMaxPlayers?: number | null;

    @Column("int", {name: "physical_min_players", nullable: true})
    physicalMinPlayers?: number | null;

    @Column("int", {name: "physical_max_players", nullable: true})
    physicalMaxPlayers?: number | null;

    @OneToMany(() => GameRelease, (release) => release.gameTitle)
    releases?: GameRelease[];

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((title: GameTitle) => title.owner)
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
