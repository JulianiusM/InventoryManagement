import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {User} from "../user/User";

@Entity("parties")
export class Party {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column("varchar", {name: "name", length: 100})
    name!: string;

    @Column("varchar", {name: "email", length: 255, nullable: true})
    email?: string | null;

    @Column("varchar", {name: "phone", length: 50, nullable: true})
    phone?: string | null;

    @Column("text", {name: "notes", nullable: true})
    notes?: string | null;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((party: Party) => party.owner)
    ownerId!: number;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
