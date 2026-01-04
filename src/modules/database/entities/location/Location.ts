import {
    Column,
    Entity,
    Index,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    JoinColumn,
} from "typeorm";

@Index("location_qr_code", ["qrCode"], {unique: true})
@Entity("locations", {schema: "surveyor"})
export class Location {
    @PrimaryGeneratedColumn({type: "int", name: "id"})
    id!: number;

    @Column("varchar", {name: "name", length: 100})
    name!: string;

    @Column("varchar", {name: "kind", length: 50, default: "other"})
    kind!: string; // room, shelf, box, bin, other

    @Column("int", {name: "parent_id", nullable: true})
    parentId?: number | null;

    @ManyToOne(() => Location, (location) => location.children, {onDelete: "SET NULL"})
    @JoinColumn({name: "parent_id"})
    parent?: Location | null;

    @OneToMany(() => Location, (location) => location.parent)
    children?: Location[];

    @Column("varchar", {name: "qr_code", unique: true, nullable: true, length: 255})
    qrCode?: string | null;

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

    // Virtual property for tree building
    childrenNodes?: Location[];
}
