import {AppDataSource} from '../dataSource';
import {SyncJob} from '../entities/syncJob/SyncJob';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';
import {SyncStatus, SyncJobType} from '../../../types/InventoryEnums';

export async function createSyncJob(externalAccountId: string): Promise<SyncJob> {
    const repo = AppDataSource.getRepository(SyncJob);
    const job = new SyncJob();
    job.externalAccount = {id: externalAccountId} as ExternalAccount;
    job.jobType = SyncJobType.ACCOUNT_SYNC;
    job.status = SyncStatus.PENDING;
    return await repo.save(job);
}

/**
 * Create a metadata resync job (not tied to a specific account)
 */
export async function createMetadataResyncJob(ownerId: number): Promise<SyncJob> {
    const repo = AppDataSource.getRepository(SyncJob);
    const job = new SyncJob();
    job.ownerId = ownerId;
    job.jobType = SyncJobType.METADATA_RESYNC;
    job.status = SyncStatus.PENDING;
    return await repo.save(job);
}

export async function getSyncJobById(id: string): Promise<SyncJob | null> {
    const repo = AppDataSource.getRepository(SyncJob);
    return await repo.findOne({
        where: {id},
        relations: ['externalAccount'],
    });
}

export async function getSyncJobsByAccountId(accountId: string): Promise<SyncJob[]> {
    const repo = AppDataSource.getRepository(SyncJob);
    return await repo.find({
        where: {externalAccount: {id: accountId}},
        order: {createdAt: 'DESC'},
    });
}

export async function getLatestSyncJob(accountId: string): Promise<SyncJob | null> {
    const repo = AppDataSource.getRepository(SyncJob);
    return await repo.findOne({
        where: {externalAccount: {id: accountId}},
        order: {createdAt: 'DESC'},
    });
}

export async function startSyncJob(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(SyncJob);
    await repo.update({id}, {
        status: SyncStatus.IN_PROGRESS,
        startedAt: new Date(),
    });
}

export async function completeSyncJob(id: string, stats: {
    entriesProcessed: number;
    entriesAdded: number;
    entriesUpdated: number;
}): Promise<void> {
    const repo = AppDataSource.getRepository(SyncJob);
    await repo.update({id}, {
        status: SyncStatus.COMPLETED,
        completedAt: new Date(),
        entriesProcessed: stats.entriesProcessed,
        entriesAdded: stats.entriesAdded,
        entriesUpdated: stats.entriesUpdated,
    });
}

export async function failSyncJob(id: string, errorMessage: string): Promise<void> {
    const repo = AppDataSource.getRepository(SyncJob);
    await repo.update({id}, {
        status: SyncStatus.FAILED,
        completedAt: new Date(),
        errorMessage: errorMessage,
    });
}

/**
 * Get all in-progress sync jobs (for recovery on app restart)
 */
export async function getInProgressJobs(): Promise<SyncJob[]> {
    const repo = AppDataSource.getRepository(SyncJob);
    return await repo.find({
        where: {status: SyncStatus.IN_PROGRESS},
        relations: ['externalAccount'],
    });
}

/**
 * Get pending sync jobs (for resume functionality)
 */
export async function getPendingJobs(): Promise<SyncJob[]> {
    const repo = AppDataSource.getRepository(SyncJob);
    return await repo.find({
        where: {status: SyncStatus.PENDING},
        relations: ['externalAccount'],
        order: {createdAt: 'ASC'},
    });
}

/**
 * Create a similarity analysis job
 */
export async function createSimilarityAnalysisJob(ownerId: number): Promise<SyncJob> {
    const repo = AppDataSource.getRepository(SyncJob);
    const job = new SyncJob();
    job.ownerId = ownerId;
    job.jobType = SyncJobType.SIMILARITY_ANALYSIS;
    job.status = SyncStatus.PENDING;
    return await repo.save(job);
}

/**
 * Get all sync jobs for a user (across all their accounts + metadata resync jobs)
 * For the Jobs Overview page
 */
export async function getAllJobsForUser(ownerId: number, options?: {
    status?: SyncStatus;
    limit?: number;
    offset?: number;
}): Promise<{jobs: SyncJob[]; total: number}> {
    const repo = AppDataSource.getRepository(SyncJob);
    
    // Get jobs tied to accounts AND jobs directly tied to owner (metadata resync)
    const queryBuilder = repo.createQueryBuilder('job')
        .leftJoinAndSelect('job.externalAccount', 'account')
        .where('(account.owner_id = :ownerId OR job.owner_id = :ownerId)', {ownerId})
        .orderBy('job.createdAt', 'DESC');
    
    if (options?.status) {
        queryBuilder.andWhere('job.status = :status', {status: options.status});
    }
    
    const total = await queryBuilder.getCount();
    
    if (options?.limit) {
        queryBuilder.take(options.limit);
    }
    if (options?.offset) {
        queryBuilder.skip(options.offset);
    }
    
    const jobs = await queryBuilder.getMany();
    
    return {jobs, total};
}
