import {AppDataSource} from '../dataSource';
import {SimilarTitlePair} from '../entities/similarTitlePair/SimilarTitlePair';
import {GameTitle} from '../entities/gameTitle/GameTitle';
import {SyncJob} from '../entities/syncJob/SyncJob';
import {SyncJobType, SyncStatus} from '../../../types/InventoryEnums';

// ============ Similarity Algorithm Constants ============

// Common sequel patterns to exclude from matching
const SEQUEL_PATTERNS = [
    // Roman numerals
    /^(i{1,3}|iv|vi{0,3}|ix|x{1,3}|xi{1,3}|xiv|xv)$/i,
    // Arabic numerals
    /^[0-9]+$/,
    // Word numerals
    /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i,
    /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)$/i,
    // Common sequel suffixes
    ///^(hd|remastered|remake|definitive|ultimate|complete|goty|deluxe|premium|gold|platinum|special|anniversary|enhanced)$/i,
    ///^(edition|version|remaster|redux|extended|director|cut|classic|legacy|standard)$/i,
    // Beta/alpha/demo markers
    ///^(beta|alpha|demo|trial|test|preview)$/i,
];

// Minimum normalized length to consider for matching
const MIN_NORMALIZED_LENGTH = 4;

// Minimum similarity score to create a pair
const MIN_SIMILARITY_SCORE = 50;

/**
 * Aggressively normalize a title for comparison.
 * Removes all non-alphanumeric, converts to lowercase.
 */
function aggressiveNormalize(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

/**
 * Split a title into meaningful tokens.
 */
function tokenize(title: string): string[] {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 0);
}

/**
 * Check if a token is a sequel/edition pattern that should be ignored.
 */
function isSequelPattern(token: string): boolean {
    return SEQUEL_PATTERNS.some(pattern => pattern.test(token));
}

/**
 * Get core tokens (excluding sequel patterns).
 */
function getCoreTokens(title: string): string[] {
    return tokenize(title).filter(t => !isSequelPattern(t));
}

/**
 * Calculate similarity score between two titles.
 * Returns { score: 0-100, matchType: string }
 */
export function calculateSimilarity(nameA: string, nameB: string): {score: number; matchType: string} {
    const normA = aggressiveNormalize(nameA);
    const normB = aggressiveNormalize(nameB);
    
    // Identical after normalization
    if (normA === normB) {
        return {score: 100, matchType: 'exact'};
    }
    
    // Too short to match reliably
    if (normA.length < MIN_NORMALIZED_LENGTH || normB.length < MIN_NORMALIZED_LENGTH) {
        return {score: 0, matchType: 'none'};
    }
    
    const shorter = normA.length <= normB.length ? normA : normB;
    const longer = normA.length <= normB.length ? normB : normA;
    
    // Check containment
    if (longer.includes(shorter)) {
        const position = longer.indexOf(shorter);
        const lengthRatio = shorter.length / longer.length;
        
        // Prefix match (shorter is at the start of longer)
        if (position === 0) {
            // Check if the extra part is just a sequel pattern
            const extra = longer.slice(shorter.length);
            const extraTokens = tokenize(extra);
            const allSequelPatterns = extraTokens.every(t => isSequelPattern(t));
            
            if (allSequelPatterns && extraTokens.length > 0) {
                // High score - likely same game with edition/sequel marker
                return {score: 0, matchType: 'sequel'};
            }
            // Good score - prefix match
            return {score: Math.round(70 + lengthRatio * 25), matchType: 'prefix'};
        }
        
        // Suffix match (shorter is at the end of longer)
        if (position === longer.length - shorter.length) {
            // Less common, medium score
            return {score: Math.round(50 + lengthRatio * 30), matchType: 'suffix'};
        }
        
        // Contains in the middle - less reliable
        return {score: Math.round(40 + lengthRatio * 20), matchType: 'contains'};
    }

    // Token-based comparison (for fuzzy matching)
    const tokensA = tokenize(normA);
    const coreTokensA = getCoreTokens(normA);
    const tokensB = tokenize(normB);
    const coreTokensB = getCoreTokens(normB);

    if (tokensA.length === 0 || tokensB.length === 0) {
        return {score: 0, matchType: 'none'};
    }

    // Calculate Jaccard similarity on core tokens
    const setA = new Set(coreTokensA);
    const fullSetA = new Set(tokensA);
    const setB = new Set(coreTokensB);
    const fullSetB = new Set(tokensB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const fullIntersection = new Set([...fullSetA].filter(x => fullSetB.has(x)));
    const union = new Set([...setA, ...setB]);
    const fullUnion = new Set([...fullSetA, ...fullSetB]);
    const jaccard = intersection.size / union.size;

    // Also check if one set is a subset of the other
    const isSubset = intersection.size === Math.min(setA.size, setB.size);
    const isFullSubset = fullIntersection.size === Math.min(fullSetA.size, fullSetB.size);

    if (isSubset) {
        // See if difference is a sequel pattern
        if(!isFullSubset){
            const fullDiff = [...fullIntersection].filter(x => !fullUnion.has(x));
            if(fullDiff.every(x => isSequelPattern(x))){
                // Only difference is a sequel pattern
                return {score: 0, matchType: 'sequel'};
            }
        }

        // One is a subset of the other - likely related
        return {score: Math.round(60 + jaccard * 30), matchType: 'fuzzy'};
    }
    
    if (jaccard >= 0.5) {
        return {score: Math.round(jaccard * 70), matchType: 'fuzzy'};
    }
    
    return {score: 0, matchType: 'none'};
}

// ============ Database Operations ============

export interface SimilarTitleGroup {
    normalizedName: string;
    titles: GameTitle[];
    pairs: Array<{pairId: string; score: number; matchType: string; dismissed: boolean}>;
}

/**
 * Get all similar title pairs for a user.
 */
export async function getSimilarPairs(
    ownerId: number,
    includeDismissed = false
): Promise<SimilarTitlePair[]> {
    const repo = AppDataSource.getRepository(SimilarTitlePair);
    
    const query = repo.createQueryBuilder('pair')
        .leftJoinAndSelect('pair.titleA', 'titleA')
        .leftJoinAndSelect('pair.titleB', 'titleB')
        .leftJoinAndSelect('titleA.releases', 'releasesA')
        .leftJoinAndSelect('titleB.releases', 'releasesB')
        .where('pair.owner_id = :ownerId', {ownerId})
        .orderBy('pair.similarity_score', 'DESC');
    
    if (!includeDismissed) {
        query.andWhere('pair.dismissed = :dismissed', {dismissed: false});
    }
    
    return await query.getMany();
}

/**
 * Group similar pairs into clusters for display.
 */
export async function getSimilarTitleGroups(
    ownerId: number,
    includeDismissed = false
): Promise<SimilarTitleGroup[]> {
    const pairs = await getSimilarPairs(ownerId, includeDismissed);
    
    // Use union-find to cluster titles
    const titleIndex = new Map<string, number>();
    const titles: GameTitle[] = [];
    const pairsByTitle = new Map<string, Array<{pairId: string; score: number; matchType: string; dismissed: boolean}>>();
    
    for (const pair of pairs) {
        if (!titleIndex.has(pair.titleA.id)) {
            titleIndex.set(pair.titleA.id, titles.length);
            titles.push(pair.titleA);
            pairsByTitle.set(pair.titleA.id, []);
        }
        if (!titleIndex.has(pair.titleB.id)) {
            titleIndex.set(pair.titleB.id, titles.length);
            titles.push(pair.titleB);
            pairsByTitle.set(pair.titleB.id, []);
        }
        
        const pairInfo = {pairId: pair.id, score: pair.similarityScore, matchType: pair.matchType, dismissed: pair.dismissed};
        pairsByTitle.get(pair.titleA.id)!.push(pairInfo);
        pairsByTitle.get(pair.titleB.id)!.push(pairInfo);
    }
    
    if (titles.length === 0) {
        return [];
    }
    
    // Union-find
    const parent: number[] = titles.map((_, i) => i);
    
    function find(i: number): number {
        if (parent[i] !== i) parent[i] = find(parent[i]);
        return parent[i];
    }
    
    function union(i: number, j: number): void {
        const pi = find(i);
        const pj = find(j);
        if (pi !== pj) parent[pi] = pj;
    }
    
    // Union titles that are paired
    for (const pair of pairs) {
        if (!pair.dismissed || includeDismissed) {
            const idxA = titleIndex.get(pair.titleA.id)!;
            const idxB = titleIndex.get(pair.titleB.id)!;
            union(idxA, idxB);
        }
    }
    
    // Group by root
    const groups = new Map<number, GameTitle[]>();
    for (let i = 0; i < titles.length; i++) {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(titles[i]);
    }
    
    // Build result
    const result: SimilarTitleGroup[] = [];
    for (const [rootIdx, groupTitles] of groups) {
        if (groupTitles.length >= 2) {
            // Get all pairs for this group
            const groupPairs = new Map<string, {pairId: string; score: number; matchType: string; dismissed: boolean}>();
            for (const title of groupTitles) {
                for (const pairInfo of pairsByTitle.get(title.id) || []) {
                    groupPairs.set(pairInfo.pairId, pairInfo);
                }
            }
            
            result.push({
                normalizedName: aggressiveNormalize(titles[rootIdx].name),
                titles: groupTitles,
                pairs: Array.from(groupPairs.values()),
            });
        }
    }
    
    // Sort by group size
    result.sort((a, b) => b.titles.length - a.titles.length);
    
    return result;
}

/**
 * Run similarity analysis for a user and store results.
 * This is the background job implementation.
 */
export async function runSimilarityAnalysis(ownerId: number): Promise<{
    pairsFound: number;
    pairsCreated: number;
    pairsRemoved: number;
}> {
    const gameTitleRepo = AppDataSource.getRepository(GameTitle);
    const pairRepo = AppDataSource.getRepository(SimilarTitlePair);
    
    // Get all titles for owner
    const titles = await gameTitleRepo.find({
        where: {owner: {id: ownerId}},
        order: {name: 'ASC'},
    });
    
    // Get existing pairs
    const existingPairs = await pairRepo.find({
        where: {owner: {id: ownerId}},
    });
    
    // Index existing pairs for quick lookup
    const existingPairMap = new Map<string, SimilarTitlePair>();
    for (const pair of existingPairs) {
        const key = [pair.titleAId, pair.titleBId].sort().join(':');
        existingPairMap.set(key, pair);
    }
    
    // Compute all pairs
    const newPairs: Array<{
        titleAId: string;
        titleBId: string;
        score: number;
        matchType: string;
    }> = [];
    
    for (let i = 0; i < titles.length; i++) {
        for (let j = i + 1; j < titles.length; j++) {
            const {score, matchType} = calculateSimilarity(titles[i].name, titles[j].name);
            
            if (score >= MIN_SIMILARITY_SCORE) {
                // Ensure consistent ordering by ID
                const [idA, idB] = [titles[i].id, titles[j].id].sort();
                newPairs.push({
                    titleAId: idA,
                    titleBId: idB,
                    score,
                    matchType,
                });
            }
        }
    }
    
    // Find pairs to create and update
    let pairsCreated = 0;
    let pairsRemoved = 0;
    const seenKeys = new Set<string>();
    
    for (const newPair of newPairs) {
        const key = [newPair.titleAId, newPair.titleBId].sort().join(':');
        seenKeys.add(key);
        
        const existing = existingPairMap.get(key);
        if (!existing) {
            // Create new pair
            const pair = new SimilarTitlePair();
            pair.titleA = {id: newPair.titleAId} as GameTitle;
            pair.titleB = {id: newPair.titleBId} as GameTitle;
            pair.owner = {id: ownerId} as any;
            pair.similarityScore = newPair.score;
            pair.matchType = newPair.matchType;
            pair.dismissed = false;
            await pairRepo.save(pair);
            pairsCreated++;
        } else if (existing.similarityScore !== newPair.score || existing.matchType !== newPair.matchType) {
            // Update existing pair (but preserve dismissed state)
            await pairRepo.update({id: existing.id}, {
                similarityScore: newPair.score,
                matchType: newPair.matchType,
                updatedAt: new Date(),
            });
        }
    }
    
    // Remove pairs that no longer match
    for (const [key, existing] of existingPairMap) {
        if (!seenKeys.has(key)) {
            await pairRepo.delete({id: existing.id});
            pairsRemoved++;
        }
    }
    
    return {
        pairsFound: newPairs.length,
        pairsCreated,
        pairsRemoved,
    };
}

/**
 * Dismiss a similar title pair.
 */
export async function dismissPair(pairId: string): Promise<void> {
    const repo = AppDataSource.getRepository(SimilarTitlePair);
    await repo.update({id: pairId}, {dismissed: true, updatedAt: new Date()});
}

/**
 * Undismiss a similar title pair.
 */
export async function undismissPair(pairId: string): Promise<void> {
    const repo = AppDataSource.getRepository(SimilarTitlePair);
    await repo.update({id: pairId}, {dismissed: false, updatedAt: new Date()});
}

/**
 * Reset all dismissals for a user.
 */
export async function resetSimilarDismissals(ownerId: number): Promise<number> {
    const repo = AppDataSource.getRepository(SimilarTitlePair);
    const result = await repo.update(
        {owner: {id: ownerId}, dismissed: true},
        {dismissed: false, updatedAt: new Date()}
    );
    return result.affected || 0;
}

/**
 * Get count of non-dismissed similar pairs.
 */
export async function getSimilarPairCount(ownerId: number): Promise<number> {
    const repo = AppDataSource.getRepository(SimilarTitlePair);
    return await repo.count({
        where: {owner: {id: ownerId}, dismissed: false},
    });
}

/**
 * Create a similarity analysis job.
 */
export async function createSimilarityAnalysisJob(ownerId: number): Promise<string> {
    const syncJobRepo = AppDataSource.getRepository(SyncJob);
    const job = new SyncJob();
    job.ownerId = ownerId;
    job.jobType = SyncJobType.SIMILARITY_ANALYSIS;
    job.status = SyncStatus.PENDING;
    const savedJob = await syncJobRepo.save(job);
    return savedJob.id;
}
