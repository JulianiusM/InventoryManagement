import {AppDataSource} from '../dataSource';
import {ExternalAccount} from '../entities/externalAccount/ExternalAccount';
import {User} from '../entities/user/User';

export interface CreateExternalAccountData {
    provider: string;
    accountName: string;
    externalUserId?: string | null;
    tokenRef?: string | null;
    ownerId: number;
}

export async function createExternalAccount(data: CreateExternalAccountData): Promise<ExternalAccount> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    const account = new ExternalAccount();
    account.provider = data.provider;
    account.accountName = data.accountName;
    account.externalUserId = data.externalUserId ?? null;
    account.tokenRef = data.tokenRef ?? null;
    account.owner = {id: data.ownerId} as User;
    return await repo.save(account);
}

export async function getExternalAccountById(id: string, ownerId?: number): Promise<ExternalAccount | null> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    const where: Record<string, unknown> = {id};
    if (ownerId !== undefined) {
        where.owner = {id: ownerId};
    }
    return await repo.findOne({
        where,
        relations: ['owner'],
    });
}

export async function getAllExternalAccounts(ownerId: number): Promise<ExternalAccount[]> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    return await repo.find({
        where: {owner: {id: ownerId}},
        order: {provider: 'ASC', accountName: 'ASC'},
    });
}

export async function getExternalAccountsByProvider(ownerId: number, provider: string): Promise<ExternalAccount[]> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            provider: provider,
        },
        order: {accountName: 'ASC'},
    });
}

export async function updateExternalAccount(
    id: string, 
    ownerId: number, 
    data: Partial<Pick<ExternalAccount, 'accountName' | 'externalUserId' | 'tokenRef'>>
): Promise<void> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    // Ensure ownership
    await repo.update({id, owner: {id: ownerId}}, data as Record<string, unknown>);
}

export async function updateLastSyncedAt(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    await repo.update({id}, {lastSyncedAt: new Date()});
}

export async function deleteExternalAccount(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(ExternalAccount);
    await repo.delete({id});
}
