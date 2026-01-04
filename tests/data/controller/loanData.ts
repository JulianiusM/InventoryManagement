/**
 * Test data for loan controller tests
 */

export const createLoanData = [
    {
        description: 'creates loan with valid data',
        input: {
            itemId: '1',
            direction: 'lend',
            partyName: 'John Doe',
            partyEmail: 'john@example.com',
        },
        ownerId: 1,
        existingItem: {id: 1, name: 'Test Item'},
        existingActiveLoan: null,
        expected: {
            itemId: 1,
            direction: 'lend',
            status: 'active',
            ownerId: 1,
        },
    },
    {
        description: 'creates borrow loan',
        input: {
            itemId: '2',
            direction: 'borrow',
            partyName: 'Library',
        },
        ownerId: 1,
        existingItem: {id: 2, name: 'Borrowed Book'},
        existingActiveLoan: null,
        expected: {
            itemId: 2,
            direction: 'borrow',
            status: 'active',
        },
    },
];

export const createLoanErrorData = [
    {
        description: 'throws error when item not specified',
        input: {direction: 'lend', partyName: 'John'},
        errorMessage: 'Item is required',
    },
    {
        description: 'throws error when direction invalid',
        input: {itemId: '1', direction: 'invalid', partyName: 'John'},
        errorMessage: 'Direction must be "lend" or "borrow"',
    },
    {
        description: 'throws error when party name missing',
        input: {itemId: '1', direction: 'lend'},
        errorMessage: 'Counterparty name is required',
    },
    {
        description: 'throws error when item not found',
        input: {itemId: '999', direction: 'lend', partyName: 'John'},
        existingItem: null,
        errorMessage: 'Item not found',
    },
    {
        description: 'throws error when item already on loan',
        input: {itemId: '1', direction: 'lend', partyName: 'John'},
        existingItem: {id: 1, name: 'Test Item'},
        existingActiveLoan: {id: 10, itemId: 1, status: 'active'},
        errorMessage: 'Item is already on an active loan',
    },
];

export const returnLoanData = [
    {
        description: 'returns loan successfully',
        loanId: 1,
        existingLoan: {id: 1, status: 'active', itemId: 1},
        input: {conditionIn: 'Good condition'},
    },
    {
        description: 'returns loan without condition note',
        loanId: 2,
        existingLoan: {id: 2, status: 'active', itemId: 2},
        input: {},
    },
];

export const returnLoanErrorData = [
    {
        description: 'throws error when loan not found',
        loanId: 999,
        existingLoan: null,
        errorMessage: 'Loan not found',
    },
    {
        description: 'throws error when loan already returned',
        loanId: 1,
        existingLoan: {id: 1, status: 'returned', itemId: 1},
        errorMessage: 'Loan is already returned',
    },
];
