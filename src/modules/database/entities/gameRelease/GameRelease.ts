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
import {GameCopy} from "../gameCopy/GameCopy";
import {GamePlatform} from "../../../../types/InventoryEnums";

@Entity("game_releases")
export class GameRelease {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => GameTitle, (title) => title.releases, {onDelete: "CASCADE"})
    @JoinColumn({name: "game_title_id"})
    gameTitle!: GameTitle;

    @RelationId((release: GameRelease) => release.gameTitle)
    gameTitleId!: string;

    @Column({
        type: "enum",
        enum: GamePlatform,
        default: GamePlatform.OTHER,
    })
    platform!: GamePlatform;

    @Column("varchar", {name: "edition", length: 100, nullable: true})
    edition?: string | null;

    @Column("varchar", {name: "region", length: 50, nullable: true})
    region?: string | null;

    @Column("date", {name: "release_date", nullable: true})
    releaseDate?: string | null;

    // Optional player count override
    @Column("int", {name: "players_override_min", nullable: true})
    playersOverrideMin?: number | null;

    @Column("int", {name: "players_override_max", nullable: true})
    playersOverrideMax?: number | null;

    @OneToMany(() => GameCopy, (copy) => copy.gameRelease)
    copies?: GameCopy[];

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
