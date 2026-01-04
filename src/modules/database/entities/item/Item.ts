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
import {ItemType, ItemCondition} from "../../../../types/InventoryEnums";

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
