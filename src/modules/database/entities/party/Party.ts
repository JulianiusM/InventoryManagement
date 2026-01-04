import {
    Column,
    Entity,
    PrimaryGeneratedColumn,
} from "typeorm";

@Entity("parties", {schema: "surveyor"})
export class Party {
    @PrimaryGeneratedColumn({type: "int", name: "id"})
    id!: number;

    @Column("varchar", {name: "name", length: 100})
    name!: string;

    @Column("varchar", {name: "email", length: 255, nullable: true})
    email?: string | null;

    @Column("varchar", {name: "phone", length: 50, nullable: true})
    phone?: string | null;

    @Column("text", {name: "notes", nullable: true})
    notes?: string | null;

    @Column("int", {name: "owner_id", nullable: true})
    ownerId?: number | null;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
