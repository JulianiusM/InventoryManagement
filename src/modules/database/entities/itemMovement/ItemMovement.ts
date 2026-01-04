import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {Item} from "../item/Item";
import {Location} from "../location/Location";
import {User} from "../user/User";

@Entity("item_movements")
export class ItemMovement {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => Item, {onDelete: "CASCADE"})
    @JoinColumn({name: "item_id"})
    item!: Item;

    @RelationId((movement: ItemMovement) => movement.item)
    itemId!: string;

    @ManyToOne(() => Location, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "from_location_id"})
    fromLocation?: Location | null;

    @RelationId((movement: ItemMovement) => movement.fromLocation)
    fromLocationId?: string | null;

    @ManyToOne(() => Location, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "to_location_id"})
    toLocation?: Location | null;

    @RelationId((movement: ItemMovement) => movement.toLocation)
    toLocationId?: string | null;

    @Column("text", {name: "note", nullable: true})
    note?: string | null;

    @ManyToOne(() => User, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "moved_by_user_id"})
    movedByUser?: User | null;

    @RelationId((movement: ItemMovement) => movement.movedByUser)
    movedByUserId?: number | null;

    @Column("timestamp", {
        name: "moved_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    movedAt!: Date;
}
