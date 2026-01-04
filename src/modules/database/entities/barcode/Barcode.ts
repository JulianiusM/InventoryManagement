import {
    Column,
    Entity,
    Index,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
} from "typeorm";
import {Item} from "../item/Item";

@Index("barcode_code", ["code"], {unique: true})
@Entity("barcodes", {schema: "surveyor"})
export class Barcode {
    @PrimaryGeneratedColumn({type: "int", name: "id"})
    id!: number;

    @Column("varchar", {name: "code", unique: true, length: 255})
    code!: string;

    @Column("varchar", {name: "symbology", length: 50, default: "unknown"})
    symbology!: string; // EAN13, UPC, QR, Code128, unknown

    @Column("int", {name: "item_id", nullable: true})
    itemId?: number | null;

    @ManyToOne(() => Item, {onDelete: "SET NULL"})
    @JoinColumn({name: "item_id"})
    item?: Item | null;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
