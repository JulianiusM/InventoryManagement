import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {GameCopy} from "../gameCopy/GameCopy";
import {BarcodeSymbology} from "../../../../types/InventoryEnums";

@Entity("game_copy_barcodes")
export class GameCopyBarcode {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "code", length: 255})
    code!: string;

    @Column({
        type: "enum",
        enum: BarcodeSymbology,
        default: BarcodeSymbology.UNKNOWN,
    })
    symbology!: BarcodeSymbology;

    @ManyToOne(() => GameCopy, (copy) => copy.barcodes, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "game_copy_id"})
    gameCopy?: GameCopy | null;

    @RelationId((barcode: GameCopyBarcode) => barcode.gameCopy)
    gameCopyId?: string | null;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
