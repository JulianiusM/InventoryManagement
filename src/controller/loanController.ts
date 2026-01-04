import * as loanService from '../modules/database/services/LoanService';
import * as itemService from '../modules/database/services/ItemService';
import * as partyService from '../modules/database/services/PartyService';
import {ExpectedError} from '../modules/lib/errors';
import {checkOwnership, requireAuthenticatedUser} from '../middleware/authMiddleware';
import {Loan} from '../modules/database/entities/loan/Loan';
import {ItemCondition, LoanDirection, LoanStatus} from '../types/InventoryEnums';

const validConditions = Object.values(ItemCondition) as string[];

export async function listLoans(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    const loans = await loanService.getActiveLoans(ownerId);
    const items = await itemService.getAllItems(ownerId);
    return {loans, items};
}

export async function createLoan(body: {
    itemId: string;
    direction: string;
    partyName: string;
    partyEmail?: string;
    partyPhone?: string;
    dueAt?: string;
    conditionOut?: string;
    notes?: string;
}, ownerId: number): Promise<Loan> {
    requireAuthenticatedUser(ownerId);
    const {itemId, direction, partyName, partyEmail, partyPhone, dueAt, conditionOut, notes} = body;
    
    if (!itemId) {
        throw new ExpectedError('Item is required', 'error', 400);
    }
    
    if (!direction || !['lend', 'borrow'].includes(direction)) {
        throw new ExpectedError('Direction must be "lend" or "borrow"', 'error', 400);
    }
    
    if (!partyName || partyName.trim() === '') {
        throw new ExpectedError('Counterparty name is required', 'error', 400);
    }
    
    // Validate condition if provided
    let validatedConditionOut: ItemCondition | null = null;
    if (conditionOut && conditionOut.trim() !== '') {
        if (!validConditions.includes(conditionOut)) {
            throw new ExpectedError('Invalid condition value', 'error', 400);
        }
        validatedConditionOut = conditionOut as ItemCondition;
    }
    
    // Check item exists and belongs to user
    const item = await itemService.getItemById(itemId);
    if (!item) {
        throw new ExpectedError('Item not found', 'error', 404);
    }
    checkOwnership(item, ownerId);
    
    // Check if item is already on active loan
    const existingLoan = await loanService.getActiveLoanByItemId(itemId);
    if (existingLoan) {
        throw new ExpectedError('Item is already on an active loan', 'error', 400);
    }
    
    // Find or create party
    const party = await partyService.findOrCreateParty(
        partyName.trim(),
        partyEmail?.trim() || null,
        partyPhone?.trim() || null,
        ownerId
    );
    
    return await loanService.createLoan({
        itemId,
        partyId: party.id,
        direction: direction as LoanDirection,
        status: LoanStatus.ACTIVE,
        dueAt: dueAt || null,
        conditionOut: validatedConditionOut,
        notes: notes?.trim() || null,
        ownerId,
    });
}

export async function returnLoan(
    id: string,
    body?: {conditionIn?: string},
    userId?: number
): Promise<void> {
    requireAuthenticatedUser(userId);
    const loan = await loanService.getLoanById(id);
    if (!loan) {
        throw new ExpectedError('Loan not found', 'error', 404);
    }
    checkOwnership(loan, userId);
    
    if (loan.status === LoanStatus.RETURNED) {
        throw new ExpectedError('Loan is already returned', 'error', 400);
    }
    
    // Validate condition if provided
    let validatedConditionIn: ItemCondition | null = null;
    if (body?.conditionIn && body.conditionIn.trim() !== '') {
        if (!validConditions.includes(body.conditionIn)) {
            throw new ExpectedError('Invalid condition value', 'error', 400);
        }
        validatedConditionIn = body.conditionIn as ItemCondition;
    }
    
    await loanService.returnLoan(id, validatedConditionIn);
}

export async function getLoanDetail(id: string, userId: number) {
    requireAuthenticatedUser(userId);
    const loan = await loanService.getLoanById(id);
    if (!loan) {
        throw new ExpectedError('Loan not found', 'error', 404);
    }
    checkOwnership(loan, userId);
    return {loan};
}

export async function getOverdueLoans(ownerId: number) {
    requireAuthenticatedUser(ownerId);
    return await loanService.getOverdueLoans(ownerId);
}
