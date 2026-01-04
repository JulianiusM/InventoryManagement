import {
    Column,
    Entity,
    Index,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    JoinColumn,
} from "typeorm";
import {Location} from "../location/Location";

@Entity("items", {schema: "surveyor"})
export class Item {
    @PrimaryGeneratedColumn({type: "int", name: "id"})
    id!: number;

    @Column("varchar", {name: "name", length: 255})
    name!: string;

    @Column("varchar", {name: "type", length: 50, default: "other"})
    type!: string; // book, tool, game, other

    @Column("text", {name: "description", nullable: true})
    description?: string | null;

    @Column("varchar", {name: "condition", length: 50, nullable: true})
    condition?: string | null; // new, good, fair, poor

    @Column("varchar", {name: "serial_number", length: 255, nullable: true})
    serialNumber?: string | null;

    @Column("json", {name: "custom_fields", nullable: true})
    customFields?: Record<string, unknown> | null;

    @Column("int", {name: "location_id", nullable: true})
    locationId?: number | null;

    @ManyToOne(() => Location, {onDelete: "SET NULL"})
    @JoinColumn({name: "location_id"})
    location?: Location | null;

    @Column("int", {name: "owner_id", nullable: true})
    ownerId?: number | null;

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
