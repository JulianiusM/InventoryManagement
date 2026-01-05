import {AppDataSource} from '../dataSource';
import {GameCopyLoan} from '../entities/gameCopyLoan/GameCopyLoan';
import {GameCopy} from '../entities/gameCopy/GameCopy';
import {Party} from '../entities/party/Party';
import {User} from '../entities/user/User';
import {ItemCondition, LoanDirection, LoanStatus} from '../../../types/InventoryEnums';

export interface CreateGameCopyLoanData {
    gameCopyId: string;
    partyId: string;
    direction: LoanDirection;
    dueAt?: string | null;
    conditionOut?: ItemCondition | null;
    notes?: string | null;
    ownerId: number;
}

export async function createGameCopyLoan(data: CreateGameCopyLoanData): Promise<GameCopyLoan> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    const loan = new GameCopyLoan();
    loan.gameCopy = {id: data.gameCopyId} as GameCopy;
    loan.party = {id: data.partyId} as Party;
    loan.direction = data.direction;
    loan.status = LoanStatus.ACTIVE;
    loan.dueAt = data.dueAt ?? null;
    loan.conditionOut = data.conditionOut ?? null;
    loan.notes = data.notes ?? null;
    loan.owner = {id: data.ownerId} as User;
    return await repo.save(loan);
}

export async function getGameCopyLoanById(id: string): Promise<GameCopyLoan | null> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    return await repo.findOne({
        where: {id},
        relations: ['gameCopy', 'gameCopy.gameRelease', 'gameCopy.gameRelease.gameTitle', 'party', 'owner'],
    });
}

export async function getLoansByGameCopyId(gameCopyId: string): Promise<GameCopyLoan[]> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    return await repo.find({
        where: {gameCopy: {id: gameCopyId}},
        relations: ['party'],
        order: {startAt: 'DESC'},
    });
}

export async function getActiveLoanByGameCopyId(gameCopyId: string): Promise<GameCopyLoan | null> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    return await repo.findOne({
        where: {
            gameCopy: {id: gameCopyId},
            status: LoanStatus.ACTIVE,
        },
        relations: ['party'],
    });
}

export async function getAllActiveLoans(ownerId: number): Promise<GameCopyLoan[]> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    return await repo.find({
        where: {
            owner: {id: ownerId},
            status: LoanStatus.ACTIVE,
        },
        relations: ['gameCopy', 'gameCopy.gameRelease', 'gameCopy.gameRelease.gameTitle', 'party'],
        order: {startAt: 'DESC'},
    });
}

export async function returnGameCopyLoan(id: string, conditionIn?: ItemCondition | null): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    await repo.update({id}, {
        status: LoanStatus.RETURNED,
        returnedAt: new Date(),
        conditionIn: conditionIn ?? null,
    });
}

export async function updateGameCopyLoan(id: string, data: Partial<Omit<GameCopyLoan, 'gameCopy' | 'party' | 'owner'>>): Promise<void> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function markOverdueLoans(ownerId: number): Promise<number> {
    const repo = AppDataSource.getRepository(GameCopyLoan);
    const today = new Date().toISOString().split('T')[0];
    const result = await repo.createQueryBuilder()
        .update(GameCopyLoan)
        .set({status: LoanStatus.OVERDUE})
        .where('owner_id = :ownerId', {ownerId})
        .andWhere('status = :activeStatus', {activeStatus: LoanStatus.ACTIVE})
        .andWhere('due_at < :today', {today})
        .execute();
    return result.affected || 0;
}
