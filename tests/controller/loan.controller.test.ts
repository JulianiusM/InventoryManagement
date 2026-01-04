/**
 * Tests for loanController
 */

import {createLoanData, createLoanErrorData, returnLoanData, returnLoanErrorData, TEST_USER_ID} from '../data/controller/loanData';
import {setupMock, verifyThrowsError} from '../keywords/common/controllerKeywords';

// Mock the services
jest.mock('../../src/modules/database/services/LoanService');
jest.mock('../../src/modules/database/services/ItemService');
jest.mock('../../src/modules/database/services/PartyService');

import * as loanService from '../../src/modules/database/services/LoanService';
import * as itemService from '../../src/modules/database/services/ItemService';
import * as partyService from '../../src/modules/database/services/PartyService';
import * as loanController from '../../src/controller/loanController';

describe('loanController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createLoan', () => {
        test.each(createLoanData)('$description', async ({input, ownerId, existingItem, existingActiveLoan, expected}) => {
            setupMock(itemService.getItemById as jest.Mock, existingItem);
            setupMock(loanService.getActiveLoanByItemId as jest.Mock, existingActiveLoan);
            setupMock(partyService.findOrCreateParty as jest.Mock, {id: 'uuid-p1', name: input.partyName});
            setupMock(loanService.createLoan as jest.Mock, {id: 'uuid-l1', ...expected});

            const result = await loanController.createLoan(input, ownerId);

            expect(result).toBeDefined();
            expect(result.id).toBe('uuid-l1');
            expect(loanService.createLoan).toHaveBeenCalled();
        });

        test.each(createLoanErrorData)('$description', async ({input, ownerId, existingItem, existingActiveLoan, errorMessage}) => {
            if (existingItem !== undefined) {
                setupMock(itemService.getItemById as jest.Mock, existingItem);
            }
            if (existingActiveLoan !== undefined) {
                setupMock(loanService.getActiveLoanByItemId as jest.Mock, existingActiveLoan);
            }

            await verifyThrowsError(
                () => loanController.createLoan(input as Parameters<typeof loanController.createLoan>[0], ownerId),
                errorMessage
            );
        });
    });

    describe('returnLoan', () => {
        test.each(returnLoanData)('$description', async ({loanId, existingLoan, input, userId}) => {
            setupMock(loanService.getLoanById as jest.Mock, existingLoan);
            setupMock(loanService.returnLoan as jest.Mock, undefined);

            await loanController.returnLoan(loanId, input, userId);

            expect(loanService.returnLoan).toHaveBeenCalledWith(
                loanId,
                input.conditionIn?.trim() || null
            );
        });

        test.each(returnLoanErrorData)('$description', async ({loanId, existingLoan, userId, errorMessage}) => {
            setupMock(loanService.getLoanById as jest.Mock, existingLoan);

            await verifyThrowsError(
                () => loanController.returnLoan(loanId, undefined, userId),
                errorMessage
            );
        });
    });

    describe('listLoans', () => {
        test('returns active loans and items', async () => {
            const mockLoans = [{id: 'uuid-l1', itemId: 'uuid-1', status: 'active'}];
            const mockItems = [{id: 'uuid-1', name: 'Item 1'}];
            setupMock(loanService.getActiveLoans as jest.Mock, mockLoans);
            setupMock(itemService.getAllItems as jest.Mock, mockItems);

            const result = await loanController.listLoans(TEST_USER_ID);

            expect(result.loans).toEqual(mockLoans);
            expect(result.items).toEqual(mockItems);
        });

        test('filters by owner when provided', async () => {
            setupMock(loanService.getActiveLoans as jest.Mock, []);
            setupMock(itemService.getAllItems as jest.Mock, []);

            await loanController.listLoans(42);

            expect(loanService.getActiveLoans).toHaveBeenCalledWith(42);
            expect(itemService.getAllItems).toHaveBeenCalledWith(42);
        });
    });

    describe('getLoanDetail', () => {
        test('returns loan details', async () => {
            const mockLoan = {id: 'uuid-l1', itemId: 'uuid-1', partyId: 'uuid-p1', status: 'active', ownerId: TEST_USER_ID};
            setupMock(loanService.getLoanById as jest.Mock, mockLoan);

            const result = await loanController.getLoanDetail('uuid-l1', TEST_USER_ID);

            expect(result.loan).toEqual(mockLoan);
        });

        test('throws error when loan not found', async () => {
            setupMock(loanService.getLoanById as jest.Mock, null);

            await verifyThrowsError(
                () => loanController.getLoanDetail('uuid-999', TEST_USER_ID),
                'Loan not found'
            );
        });
    });

    describe('getOverdueLoans', () => {
        test('returns overdue loans', async () => {
            const mockOverdueLoans = [
                {id: 'uuid-l1', itemId: 'uuid-1', dueAt: '2024-01-01', status: 'active'},
            ];
            setupMock(loanService.getOverdueLoans as jest.Mock, mockOverdueLoans);

            const result = await loanController.getOverdueLoans(TEST_USER_ID);

            expect(result).toEqual(mockOverdueLoans);
        });

        test('filters by owner when provided', async () => {
            setupMock(loanService.getOverdueLoans as jest.Mock, []);

            await loanController.getOverdueLoans(42);

            expect(loanService.getOverdueLoans).toHaveBeenCalledWith(42);
        });
    });
});
