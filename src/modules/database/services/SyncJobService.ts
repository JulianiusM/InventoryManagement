import {AppDataSource} from '../dataSource';
import {SyncJob} from '../entities/syncJob/SyncJob';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';
import {SyncStatus} from '../../../types/InventoryEnums';

export async function createSyncJob(externalAccountId: string): Promise<SyncJob> {
    const repo = AppDataSource.getRepository(SyncJob);
    const job = new SyncJob();
    job.externalAccount = {id: externalAccountId} as ExternalAccount;
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
