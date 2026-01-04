import {AppDataSource} from '../dataSource';
import {Loan} from '../entities/loan/Loan';
import {LoanStatus} from '../../../types/InventoryEnums';

export async function createLoan(data: Partial<Loan>): Promise<Loan> {
    const repo = AppDataSource.getRepository(Loan);
    const loan = repo.create(data);
    return await repo.save(loan);
}

export async function getLoanById(id: string): Promise<Loan | null> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.findOne({
        where: {id},
        relations: ['item', 'party', 'owner'],
    });
}

export async function getActiveLoans(ownerId: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.find({
        where: {status: LoanStatus.ACTIVE, ownerId},
        relations: ['item', 'party'],
        order: {startAt: 'DESC'},
    });
}

export async function getAllLoans(ownerId: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.find({
        where: {ownerId},
        relations: ['item', 'party'],
        order: {createdAt: 'DESC'},
    });
}

export async function getLoansByItemId(itemId: string): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.find({
        where: {itemId},
        relations: ['item', 'party'],
        order: {startAt: 'DESC'},
    });
}

export async function getActiveLoanByItemId(itemId: string): Promise<Loan | null> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.findOne({
        where: {itemId, status: LoanStatus.ACTIVE},
        relations: ['item', 'party'],
    });
}

export async function returnLoan(id: string, conditionIn?: string | null): Promise<void> {
    const repo = AppDataSource.getRepository(Loan);
    await repo.update({id}, {
        status: LoanStatus.RETURNED,
        returnedAt: new Date(),
        conditionIn,
    } as Record<string, unknown>);
}

export async function updateLoan(id: string, data: Partial<Omit<Loan, 'item' | 'party' | 'owner'>>): Promise<void> {
    const repo = AppDataSource.getRepository(Loan);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteLoan(id: string): Promise<void> {
    const repo = AppDataSource.getRepository(Loan);
    await repo.delete({id});
}

/**
 * Get overdue loans (active loans past their due date)
 */
export async function getOverdueLoans(ownerId: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    const today = new Date().toISOString().split('T')[0];
    
    const query = repo.createQueryBuilder('loan')
        .leftJoinAndSelect('loan.item', 'item')
        .leftJoinAndSelect('loan.party', 'party')
        .where('loan.status = :status', {status: LoanStatus.ACTIVE})
        .andWhere('loan.due_at IS NOT NULL')
        .andWhere('loan.due_at < :today', {today})
        .andWhere('loan.owner_id = :ownerId', {ownerId});
    
    return await query.orderBy('loan.due_at', 'ASC').getMany();
}
