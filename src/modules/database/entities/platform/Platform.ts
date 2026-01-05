import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
    Unique,
} from "typeorm";
import {User} from "../user/User";

@Entity("platforms")
@Unique(["name", "owner"])
export class Platform {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "name", length: 100})
    name!: string;

    @Column("varchar", {name: "description", length: 255, nullable: true})
    description?: string | null;

    // Whether this is a default platform (system-provided)
    @Column("boolean", {name: "is_default", default: false})
    isDefault!: boolean;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((platform: Platform) => platform.owner)
    ownerId!: number;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
