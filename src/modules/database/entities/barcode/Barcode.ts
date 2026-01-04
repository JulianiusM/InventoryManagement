import {
    Column,
    Entity,
    Index,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {Item} from "../item/Item";
import {BarcodeSymbology} from "../../../../types/InventoryEnums";

@Index("barcode_code", ["code"], {unique: true})
@Entity("barcodes")
export class Barcode {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "code", unique: true, length: 255})
    code!: string;

    @Column({
        type: "enum",
        enum: BarcodeSymbology,
        default: BarcodeSymbology.UNKNOWN,
    })
    symbology!: BarcodeSymbology;

    @ManyToOne(() => Item, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "item_id"})
    item?: Item | null;

    @RelationId((barcode: Barcode) => barcode.item)
    itemId?: string | null;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
