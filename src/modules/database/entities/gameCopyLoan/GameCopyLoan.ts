import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
} from "typeorm";
import {GameCopy} from "../gameCopy/GameCopy";
import {Party} from "../party/Party";
import {User} from "../user/User";
import {ItemCondition, LoanDirection, LoanStatus} from "../../../../types/InventoryEnums";

@Entity("game_copy_loans")
export class GameCopyLoan {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @ManyToOne(() => GameCopy, (copy) => copy.loans, {onDelete: "CASCADE"})
    @JoinColumn({name: "game_copy_id"})
    gameCopy!: GameCopy;

    @RelationId((loan: GameCopyLoan) => loan.gameCopy)
    gameCopyId!: string;

    @ManyToOne(() => Party, {onDelete: "CASCADE"})
    @JoinColumn({name: "party_id"})
    party!: Party;

    @RelationId((loan: GameCopyLoan) => loan.party)
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

    @Column({
        type: "enum",
        enum: ItemCondition,
        name: "condition_out",
        nullable: true,
    })
    conditionOut?: ItemCondition | null;

    @Column({
        type: "enum",
        enum: ItemCondition,
        name: "condition_in",
        nullable: true,
    })
    conditionIn?: ItemCondition | null;

    @Column("text", {name: "notes", nullable: true})
    notes?: string | null;

    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((loan: GameCopyLoan) => loan.owner)
    ownerId!: number;

    @Column("timestamp", {
        name: "created_at",
        default: () => "CURRENT_TIMESTAMP",
    })
    createdAt!: Date;
}
