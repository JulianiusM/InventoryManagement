import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {Item} from "../item/Item";
import {Party} from "../party/Party";
import {User} from "../user/User";
import {LoanDirection, LoanStatus} from "../../../../types/InventoryEnums";

@Entity("loans")
export class Loan {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => Item, {onDelete: "CASCADE"})
    @JoinColumn({name: "item_id"})
    item!: Item;

    @RelationId((loan: Loan) => loan.item)
    itemId!: string;

    @ManyToOne(() => Party, {onDelete: "CASCADE"})
    @JoinColumn({name: "party_id"})
    party!: Party;

    @RelationId((loan: Loan) => loan.party)
    partyId!: string;

    @Column({
        type: "enum",
        enum: LoanDirection,
    })
    direction!: LoanDirection;

    @Column({
        type: "enum",
        enum: LoanStatus,
        default: LoanStatus.ACTIVE,
    })
    status!: LoanStatus;

    @Column("timestamp", {
        name: "start_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    startAt!: Date;

    @Column("date", {name: "due_at", nullable: true})
    dueAt?: string | null;

    @Column("timestamp", {name: "returned_at", nullable: true})
    returnedAt?: Date | null;

    @Column("text", {name: "condition_out", nullable: true})
    conditionOut?: string | null;

    @Column("text", {name: "condition_in", nullable: true})
    conditionIn?: string | null;

    @Column("text", {name: "notes", nullable: true})
    notes?: string | null;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((loan: Loan) => loan.owner)
    ownerId!: number;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
