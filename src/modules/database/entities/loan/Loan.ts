import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
} from "typeorm";
import {Item} from "../item/Item";
import {Party} from "../party/Party";

@Entity("loans", {schema: "surveyor"})
export class Loan {
    @PrimaryGeneratedColumn({type: "int", name: "id"})
    id!: number;

    @Column("int", {name: "item_id"})
    itemId!: number;

    @ManyToOne(() => Item, {onDelete: "CASCADE"})
    @JoinColumn({name: "item_id"})
    item!: Item;

    @Column("int", {name: "party_id"})
    partyId!: number;

    @ManyToOne(() => Party, {onDelete: "CASCADE"})
    @JoinColumn({name: "party_id"})
    party!: Party;

    @Column("varchar", {name: "direction", length: 20})
    direction!: string; // 'lend' (you lent to someone) or 'borrow' (you borrowed from someone)

    @Column("varchar", {name: "status", length: 20, default: "active"})
    status!: string; // active, returned

    @Column("timestamp", {
        name: "start_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    startAt!: Date;

    @Column("date", {name: "due_at", nullable: true})
    dueAt?: string | null; // stored as string for date type

    @Column("timestamp", {name: "returned_at", nullable: true})
    returnedAt?: Date | null;

    @Column("text", {name: "condition_out", nullable: true})
    conditionOut?: string | null;

    @Column("text", {name: "condition_in", nullable: true})
    conditionIn?: string | null;

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
