import {
    Column,
    Entity,
    ManyToOne,
    PrimaryGeneratedColumn,
    JoinColumn,
    RelationId,
    Unique,
} from "typeorm";
import {GameTitle} from "../gameTitle/GameTitle";
import {User} from "../user/User";

/**
 * Stores pre-computed similar title pairs from background similarity analysis.
 * Dismissals are stored per-pair so new matches can be detected when titles are added.
 */
@Entity("similar_title_pairs")
@Unique(["titleA", "titleB", "owner"])
export class SimilarTitlePair {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    // First title in the pair (alphabetically by ID for consistency)
    @ManyToOne(() => GameTitle, {onDelete: "CASCADE"})
    @JoinColumn({name: "title_a_id"})
    titleA!: GameTitle;

    @RelationId((pair: SimilarTitlePair) => pair.titleA)
    titleAId!: string;

    // Second title in the pair
    @ManyToOne(() => GameTitle, {onDelete: "CASCADE"})
    @JoinColumn({name: "title_b_id"})
    titleB!: GameTitle;

    @RelationId((pair: SimilarTitlePair) => pair.titleB)
    titleBId!: string;

    // Owner of both titles
    @ManyToOne(() => User, {onDelete: "CASCADE"})
    @JoinColumn({name: "owner_id"})
    owner!: User;

    @RelationId((pair: SimilarTitlePair) => pair.owner)
    ownerId!: number;

    // Similarity score (0-100, higher = more similar)
    @Column("int", {name: "similarity_score"})
    similarityScore!: number;

    // Match type for UI display
    @Column("varchar", {name: "match_type", length: 50})
    matchType!: string; // 'exact', 'prefix', 'suffix', 'contains', 'fuzzy'

    // Dismissed by user - won't show in UI
    @Column("boolean", {default: false})
    dismissed!: boolean;

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
