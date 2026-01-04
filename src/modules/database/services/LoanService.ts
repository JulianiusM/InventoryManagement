import {AppDataSource} from '../dataSource';
import {Loan} from '../entities/loan/Loan';

export async function createLoan(data: Partial<Loan>): Promise<Loan> {
    const repo = AppDataSource.getRepository(Loan);
    const loan = repo.create(data);
    return await repo.save(loan);
}

export async function getLoanById(id: number): Promise<Loan | null> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.findOne({
        where: {id},
        relations: ['item', 'party'],
    });
}

export async function getActiveLoans(ownerId?: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    const where: { status: string; ownerId?: number } = {status: 'active'};
    if (ownerId !== undefined) {
        where.ownerId = ownerId;
    }
    return await repo.find({
        where,
        relations: ['item', 'party'],
        order: {startAt: 'DESC'},
    });
}

export async function getAllLoans(ownerId?: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    const where: { ownerId?: number } = {};
    if (ownerId !== undefined) {
        where.ownerId = ownerId;
    }
    return await repo.find({
        where,
        relations: ['item', 'party'],
        order: {createdAt: 'DESC'},
    });
}

export async function getLoansByItemId(itemId: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.find({
        where: {itemId},
        relations: ['item', 'party'],
        order: {startAt: 'DESC'},
    });
}

export async function getActiveLoanByItemId(itemId: number): Promise<Loan | null> {
    const repo = AppDataSource.getRepository(Loan);
    return await repo.findOne({
        where: {itemId, status: 'active'},
        relations: ['item', 'party'],
    });
}

export async function returnLoan(id: number, conditionIn?: string | null): Promise<void> {
    const repo = AppDataSource.getRepository(Loan);
    await repo.update({id}, {
        status: 'returned',
        returnedAt: new Date(),
        conditionIn,
    });
}

export async function updateLoan(id: number, data: Partial<Omit<Loan, 'item' | 'party'>>): Promise<void> {
    const repo = AppDataSource.getRepository(Loan);
    await repo.update({id}, data as Record<string, unknown>);
}

export async function deleteLoan(id: number): Promise<void> {
    const repo = AppDataSource.getRepository(Loan);
    await repo.delete({id});
}

/**
 * Get overdue loans (active loans past their due date)
 */
export async function getOverdueLoans(ownerId?: number): Promise<Loan[]> {
    const repo = AppDataSource.getRepository(Loan);
    const today = new Date().toISOString().split('T')[0];
    
    const query = repo.createQueryBuilder('loan')
        .leftJoinAndSelect('loan.item', 'item')
        .leftJoinAndSelect('loan.party', 'party')
        .where('loan.status = :status', {status: 'active'})
        .andWhere('loan.due_at IS NOT NULL')
        .andWhere('loan.due_at < :today', {today});
    
    if (ownerId !== undefined) {
        query.andWhere('loan.owner_id = :ownerId', {ownerId});
    }
    
    return await query.orderBy('loan.due_at', 'ASC').getMany();
}
