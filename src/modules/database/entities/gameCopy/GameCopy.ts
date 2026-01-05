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
import {ExternalAccount} from "../externalAccount/ExternalAccount";
import {Location} from "../location/Location";
import {GameCopyLoan} from "../gameCopyLoan/GameCopyLoan";
import {GameCopyBarcode} from "../gameCopyBarcode/GameCopyBarcode";
import {GameCopyType, ItemCondition} from "../../../../types/InventoryEnums";

@Entity("game_copies")
export class GameCopy {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => GameRelease, (release) => release.copies, {onDelete: "CASCADE"})
    @JoinColumn({name: "game_release_id"})
    gameRelease!: GameRelease;

    @RelationId((copy: GameCopy) => copy.gameRelease)
    gameReleaseId!: string;

    @Column({
        type: "enum",
        enum: GameCopyType,
        name: "copy_type",
    })
    copyType!: GameCopyType;

    // Digital license fields
    @ManyToOne(() => ExternalAccount, (account) => account.copies, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "external_account_id"})
    externalAccount?: ExternalAccount | null;

    @RelationId((copy: GameCopy) => copy.externalAccount)
    externalAccountId?: string | null;

    @Column("varchar", {name: "external_game_id", length: 255, nullable: true})
    externalGameId?: string | null;

    @Column("varchar", {name: "entitlement_id", length: 255, nullable: true})
    entitlementId?: string | null;

    @Column("int", {name: "playtime_minutes", nullable: true})
    playtimeMinutes?: number | null;

    @Column("timestamp", {name: "last_played_at", nullable: true})
    lastPlayedAt?: Date | null;

    @Column("boolean", {name: "is_installed", nullable: true})
    isInstalled?: boolean | null;

    // Physical copy fields
    @ManyToOne(() => Location, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "location_id"})
    location?: Location | null;

    @RelationId((copy: GameCopy) => copy.location)
    locationId?: string | null;

    @Column({
        type: "enum",
        enum: ItemCondition,
        nullable: true,
    })
    condition?: ItemCondition | null;

    @Column("text", {name: "notes", nullable: true})
    notes?: string | null;

    // Common fields
    @Column("boolean", {name: "lendable", default: true})
    lendable!: boolean;

    @Column("date", {name: "acquired_at", nullable: true})
    acquiredAt?: string | null;

    @OneToMany(() => GameCopyLoan, (loan) => loan.gameCopy)
    loans?: GameCopyLoan[];

    @OneToMany(() => GameCopyBarcode, (barcode) => barcode.gameCopy)
    barcodes?: GameCopyBarcode[];

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((copy: GameCopy) => copy.owner)
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
