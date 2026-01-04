import {
    Column,
    Entity,
    Index,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {LocationKind} from "../../../../types/InventoryEnums";
import {User} from "../user/User";

@Index("location_qr_code", ["qrCode"], {unique: true})
@Entity("locations")
export class Location {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "name", length: 100})
    name!: string;

    @Column({
        type: "enum",
        enum: LocationKind,
        default: LocationKind.OTHER,
    })
    kind!: LocationKind;

    @ManyToOne(() => Location, (location) => location.children, {onDelete: "SET NULL", nullable: true})
    @JoinColumn({name: "parent_id"})
    parent?: Location | null;

    @RelationId((location: Location) => location.parent)
    parentId?: string | null;

    @OneToMany(() => Location, (location) => location.parent)
    children?: Location[];

    @Column("varchar", {name: "qr_code", unique: true, nullable: true, length: 255})
    qrCode?: string | null;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((location: Location) => location.owner)
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

    // Virtual property for tree building
    childrenNodes?: Location[];
}
