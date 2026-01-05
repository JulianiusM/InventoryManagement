import {AppDataSource} from '../dataSource';
import {ExternalLibraryEntry} from '../entities/externalLibraryEntry/ExternalLibraryEntry';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';

export interface CreateOrUpdateLibraryEntryData {
    externalAccountId: string;
    externalGameId: string;
    externalGameName: string;
    rawPayload?: object | null;
    playtimeMinutes?: number | null;
    lastPlayedAt?: Date | null;
    isInstalled?: boolean | null;
}

export async function upsertLibraryEntry(data: CreateOrUpdateLibraryEntryData): Promise<ExternalLibraryEntry> {
    const repo = AppDataSource.getRepository(ExternalLibraryEntry);
    
    // Check if entry exists
    let entry = await repo.findOne({
        where: {
            externalAccount: {id: data.externalAccountId},
            externalGameId: data.externalGameId,
        },
    });
    
    if (entry) {
        // Update existing
        entry.externalGameName = data.externalGameName;
        entry.rawPayload = data.rawPayload ?? entry.rawPayload;
        entry.playtimeMinutes = data.playtimeMinutes ?? entry.playtimeMinutes;
        entry.lastPlayedAt = data.lastPlayedAt ?? entry.lastPlayedAt;
        entry.isInstalled = data.isInstalled ?? entry.isInstalled;
        entry.lastSeenAt = new Date();
        entry.updatedAt = new Date();
        return await repo.save(entry);
    } else {
        // Create new
        entry = new ExternalLibraryEntry();
        entry.externalAccount = {id: data.externalAccountId} as ExternalAccount;
        entry.externalGameId = data.externalGameId;
        entry.externalGameName = data.externalGameName;
        entry.rawPayload = data.rawPayload ?? null;
        entry.playtimeMinutes = data.playtimeMinutes ?? null;
        entry.lastPlayedAt = data.lastPlayedAt ?? null;
        entry.isInstalled = data.isInstalled ?? null;
        entry.lastSeenAt = new Date();
        return await repo.save(entry);
    }
}

export async function getLibraryEntriesByAccountId(accountId: string): Promise<ExternalLibraryEntry[]> {
    const repo = AppDataSource.getRepository(ExternalLibraryEntry);
    return await repo.find({
        where: {externalAccount: {id: accountId}},
        order: {externalGameName: 'ASC'},
    });
}

export async function getLibraryEntryByExternalId(accountId: string, externalGameId: string): Promise<ExternalLibraryEntry | null> {
    const repo = AppDataSource.getRepository(ExternalLibraryEntry);
    return await repo.findOne({
        where: {
            externalAccount: {id: accountId},
            externalGameId: externalGameId,
        },
    });
}

export async function getUnseenEntries(accountId: string, beforeDate: Date): Promise<ExternalLibraryEntry[]> {
    const repo = AppDataSource.getRepository(ExternalLibraryEntry);
    return await repo.createQueryBuilder('entry')
        .where('entry.external_account_id = :accountId', {accountId})
        .andWhere('entry.last_seen_at < :beforeDate', {beforeDate})
        .getMany();
}

export async function deleteLibraryEntry(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(ExternalLibraryEntry);
    await repo.delete({id});
}
