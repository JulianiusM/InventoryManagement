/**
 * Test data for loan controller tests
 */

export const TEST_USER_ID = 1;

export const createLoanData = [
    {
        description: 'creates loan with valid data',
        input: {
            itemId: 'uuid-1',
            direction: 'lend',
            partyName: 'John Doe',
            partyEmail: 'john@example.com',
        },
        ownerId: TEST_USER_ID,
        existingItem: {id: 'uuid-1', name: 'Test Item', ownerId: TEST_USER_ID},
        existingActiveLoan: null,
        expected: {
            itemId: 'uuid-1',
            direction: 'lend',
            status: 'active',
            ownerId: TEST_USER_ID,
        },
    },
    {
        description: 'creates borrow loan',
        input: {
            itemId: 'uuid-2',
            direction: 'borrow',
            partyName: 'Library',
        },
        ownerId: TEST_USER_ID,
        existingItem: {id: 'uuid-2', name: 'Borrowed Book', ownerId: TEST_USER_ID},
        existingActiveLoan: null,
        expected: {
            itemId: 'uuid-2',
            direction: 'borrow',
            status: 'active',
        },
    },
];

export const createLoanErrorData = [
    {
        description: 'throws error when item not specified',
        input: {direction: 'lend', partyName: 'John'},
        ownerId: TEST_USER_ID,
        errorMessage: 'Item is required',
    },
    {
        description: 'throws error when direction invalid',
        input: {itemId: 'uuid-1', direction: 'invalid', partyName: 'John'},
        ownerId: TEST_USER_ID,
        errorMessage: 'Direction must be "lend" or "borrow"',
    },
    {
        description: 'throws error when party name missing',
        input: {itemId: 'uuid-1', direction: 'lend'},
        ownerId: TEST_USER_ID,
        errorMessage: 'Counterparty name is required',
    },
    {
        description: 'throws error when item not found',
        input: {itemId: 'uuid-999', direction: 'lend', partyName: 'John'},
        ownerId: TEST_USER_ID,
        existingItem: null,
        errorMessage: 'Item not found',
    },
    {
        description: 'throws error when item already on loan',
        input: {itemId: 'uuid-1', direction: 'lend', partyName: 'John'},
        ownerId: TEST_USER_ID,
        existingItem: {id: 'uuid-1', name: 'Test Item', ownerId: TEST_USER_ID},
        existingActiveLoan: {id: 'uuid-l10', itemId: 'uuid-1', status: 'active'},
        errorMessage: 'Item is already on an active loan',
    },
];

export const returnLoanData = [
    {
        description: 'returns loan successfully',
        loanId: 'uuid-l1',
        existingLoan: {id: 'uuid-l1', status: 'active', itemId: 'uuid-1', ownerId: TEST_USER_ID},
        input: {conditionIn: 'Good condition'},
        userId: TEST_USER_ID,
    },
    {
        description: 'returns loan without condition note',
        loanId: 'uuid-l2',
        existingLoan: {id: 'uuid-l2', status: 'active', itemId: 'uuid-2', ownerId: TEST_USER_ID},
        input: {},
        userId: TEST_USER_ID,
    },
];

export const returnLoanErrorData = [
    {
        description: 'throws error when loan not found',
        loanId: 'uuid-999',
        existingLoan: null,
        userId: TEST_USER_ID,
        errorMessage: 'Loan not found',
    },
    {
        description: 'throws error when loan already returned',
        loanId: 'uuid-l1',
        existingLoan: {id: 'uuid-l1', status: 'returned', itemId: 'uuid-1', ownerId: TEST_USER_ID},
        userId: TEST_USER_ID,
        errorMessage: 'Loan is already returned',
    },
];
