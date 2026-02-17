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
import {GameTitle} from "../gameTitle/GameTitle";
import {Item} from "../item/Item";

@Entity("game_releases")
export class GameRelease {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => GameTitle, (title) => title.releases, {onDelete: "CASCADE"})
    @JoinColumn({name: "game_title_id"})
    gameTitle!: GameTitle;

    @RelationId((release: GameRelease) => release.gameTitle)
    gameTitleId!: string;

    // Changed from enum to varchar for user-defined platforms (Issue 4)
    @Column("varchar", {name: "platform", length: 100, default: "PC"})
    platform!: string;

    @Column("varchar", {name: "edition", length: 100, nullable: true})
    edition?: string | null;

    @Column("varchar", {name: "region", length: 50, nullable: true})
    region?: string | null;

    @Column("date", {name: "release_date", nullable: true})
    releaseDate?: string | null;

    // Optional player count override (overall)
    @Column("int", {name: "players_override_min", nullable: true})
    playersOverrideMin?: number | null;

    @Column("int", {name: "players_override_max", nullable: true})
    playersOverrideMax?: number | null;

    // Mode-specific player overrides
    @Column("boolean", {name: "override_supports_online", nullable: true})
    overrideSupportsOnline?: boolean | null;

    @Column("boolean", {name: "override_supports_local_couch", nullable: true})
    overrideSupportsLocalCouch?: boolean | null;

    @Column("boolean", {name: "override_supports_local_lan", nullable: true})
    overrideSupportsLocalLAN?: boolean | null;

    @Column("boolean", {name: "override_supports_physical", nullable: true})
    overrideSupportsPhysical?: boolean | null;

    @Column("int", {name: "override_online_min", nullable: true})
    overrideOnlineMin?: number | null;

    @Column("int", {name: "override_online_max", nullable: true})
    overrideOnlineMax?: number | null;

    @Column("int", {name: "override_local_min", nullable: true})
    overrideLocalMin?: number | null;

    @Column("int", {name: "override_local_max", nullable: true})
    overrideLocalMax?: number | null;

    @Column("int", {name: "override_physical_min", nullable: true})
    overridePhysicalMin?: number | null;

    @Column("int", {name: "override_physical_max", nullable: true})
    overridePhysicalMax?: number | null;

    @OneToMany(() => Item, (item) => item.gameRelease)
    items?: Item[];

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((release: GameRelease) => release.owner)
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
