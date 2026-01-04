import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
} from "typeorm";
import {Item} from "../item/Item";
import {Location} from "../location/Location";

@Entity("item_movements", {schema: "surveyor"})
export class ItemMovement {
    @PrimaryGeneratedColumn({type: "int", name: "id"})
    id!: number;

    @Column("int", {name: "item_id"})
    itemId!: number;

    @ManyToOne(() => Item, {onDelete: "CASCADE"})
    @JoinColumn({name: "item_id"})
    item!: Item;

    @Column("int", {name: "from_location_id", nullable: true})
    fromLocationId?: number | null;

    @ManyToOne(() => Location, {onDelete: "SET NULL"})
    @JoinColumn({name: "from_location_id"})
    fromLocation?: Location | null;

    @Column("int", {name: "to_location_id", nullable: true})
    toLocationId?: number | null;

    @ManyToOne(() => Location, {onDelete: "SET NULL"})
    @JoinColumn({name: "to_location_id"})
    toLocation?: Location | null;

    @Column("text", {name: "note", nullable: true})
    note?: string | null;

    @Column("int", {name: "moved_by_user_id", nullable: true})
    movedByUserId?: number | null;

    @Column("timestamp", {
        name: "moved_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    movedAt!: Date;
}
