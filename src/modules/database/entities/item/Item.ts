import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {Location} from "../location/Location";
import {User} from "../user/User";
import {GameRelease} from "../gameRelease/GameRelease";
import {ExternalAccount} from "../externalAccount/ExternalAccount";
import {ItemType, ItemCondition, GameCopyType} from "../../../../types/InventoryEnums";

@Entity("items")
export class Item {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "name", length: 255})
    name!: string;

    @Column({
        type: "enum",
        enum: ItemType,
        default: ItemType.OTHER,
    })
    type!: ItemType;

    @Column("text", {name: "description", nullable: true})
    description?: string | null;

    @Column({
        type: "enum",
        enum: ItemCondition,
        nullable: true,
    })
    condition?: ItemCondition | null;

    @Column("varchar", {name: "serial_number", length: 255, nullable: true})
    serialNumber?: string | null;

    @Column("simple-json", {name: "tags", nullable: true})
    tags?: string[] | null;

    @ManyToOne(() => Location, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "location_id"})
    location?: Location | null;

    @RelationId((item: Item) => item.location)
    locationId?: string | null;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((item: Item) => item.owner)
    ownerId!: number;

    // Game-specific fields (for type=GAME or type=GAME_DIGITAL)
    @ManyToOne(() => GameRelease, (release) => release.items, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "game_release_id"})
    gameRelease?: GameRelease | null;

    @RelationId((item: Item) => item.gameRelease)
    gameReleaseId?: string | null;

    @Column({
        type: "enum",
        enum: GameCopyType,
        name: "game_copy_type",
        nullable: true,
    })
    gameCopyType?: GameCopyType | null;

    // Digital license fields
    @ManyToOne(() => ExternalAccount, (account) => account.items, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "external_account_id"})
    externalAccount?: ExternalAccount | null;

    @RelationId((item: Item) => item.externalAccount)
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

    // Aggregator origin fields (for transparent import tracking, e.g., Playnite)
    @Column("varchar", {name: "aggregator_provider_id", length: 100, nullable: true})
    aggregatorProviderId?: string | null;

    @Column("varchar", {name: "aggregator_account_id", length: 255, nullable: true})
    aggregatorAccountId?: string | null;

    @Column("varchar", {name: "aggregator_external_game_id", length: 500, nullable: true})
    aggregatorExternalGameId?: string | null;

    @Column("varchar", {name: "original_provider_plugin_id", length: 255, nullable: true})
    originalProviderPluginId?: string | null;

    @Column("varchar", {name: "original_provider_name", length: 255, nullable: true})
    originalProviderName?: string | null;

    @Column("varchar", {name: "original_provider_game_id", length: 255, nullable: true})
    originalProviderGameId?: string | null;

    @Column("varchar", {name: "original_provider_normalized_id", length: 100, nullable: true})
    originalProviderNormalizedId?: string | null;

    @Column("text", {name: "store_url", nullable: true})
    storeUrl?: string | null;

    @Column("boolean", {name: "needs_review", default: false})
    needsReview!: boolean;

    // Lending fields
    @Column("boolean", {name: "lendable", default: true})
    lendable!: boolean;

    @Column("date", {name: "acquired_at", nullable: true})
    acquiredAt?: string | null;

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
