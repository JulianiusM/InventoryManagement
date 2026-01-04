# Testing Guide

This document provides a comprehensive guide to testing in the Surveyor application, covering our data-driven and keyword-driven testing approaches.

## Table of Contents

- [Overview](#overview)
- [Testing Approaches](#testing-approaches)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Running Tests](#running-tests)
- [Best Practices](#best-practices)

## Overview

The Surveyor test suite uses a combination of data-driven and keyword-driven testing approaches to ensure:

1. **Maintainability**: Separation of test data from test logic
2. **Reusability**: Shared test keywords and data across multiple tests
3. **Readability**: High-level, business-focused test descriptions
4. **Coverage**: Comprehensive testing through parameterized test cases
5. **Consistency**: Standardized patterns across all test types

## Testing Approaches

### Data-Driven Testing

Data-driven testing separates test data from test logic, enabling:
- Multiple test cases from a single test function
- Easy addition of new test scenarios without code changes
- Clear test data management and organization

**Example:**
```typescript
// Test data (in tests/data/controller/surveyData.ts)
export const preprocessCreateData = [
    {
        description: 'normalizes combos and trims strings',
        input: { title: '  My Survey  ', description: '', combinations: [...] },
        expected: { title: 'My Survey', description: null, combinations: [...] },
    },
    {
        description: 'handles single combination',
        input: { title: 'Single', description: 'Test', combinations: [...] },
        expected: { title: 'Single', description: 'Test', combinations: [...] },
    },
];

// Test (in tests/controller/survey.controller.test.ts)
test.each(preprocessCreateData)(
    '$description',
    ({ input, expected }) => {
        const result = preprocessCreate(input);
        expect(result).toEqual(expected);
    }
);
```

### Keyword-Driven Testing

Keyword-driven testing uses reusable, high-level test actions (keywords) to compose tests:
- Abstract implementation details behind meaningful actions
- Enable test code reuse across multiple test files
- Make tests read like business requirements

**Example:**
```typescript
// Keywords (in tests/keywords/middleware/middlewareKeywords.ts)
export async function expectMiddlewareSuccess(
    middleware: any,
    session: any,
    resource: any
): Promise<void> {
    const app = buildMiddlewareApp(middleware, { session, resource });
    const response = await makeGetRequest(app);
    verifyMiddlewareAllows(response);
}

// Test usage
test('allows when user owns resource', async () => {
    await expectMiddlewareSuccess(
        requireOwner(),
        { user: { id: 1 } },
        { ownerId: 1 }
    );
});
```

## Test Structure

### Directory Organization

```
tests/
├── data/                   # Test data (data-driven testing)
│   ├── unit/              # Unit test data
│   ├── controller/        # Controller test data
│   ├── middleware/        # Middleware test data
│   ├── database/          # Database integration test data
│   ├── e2e/              # E2E test data
│   ├── builders/         # Test data builders
│   └── fixtures/         # Fixed test data sets
├── keywords/              # Test keywords (keyword-driven testing)
│   ├── common/           # Shared keywords
│   ├── controller/       # Controller test keywords
│   ├── middleware/       # Middleware test keywords
│   ├── database/         # Database test keywords
│   └── e2e/             # E2E test keywords
├── client/               # Frontend tests (no backend required)
│   ├── unit/            # Pure logic frontend tests
│   ├── ui/              # DOM behavior tests
│   ├── flows/           # Multi-step frontend flows
│   ├── msw/             # MSW server and API handlers
│   └── mocks/           # Frontend test mocks
├── unit/                 # Backend unit tests
├── controller/           # Controller tests
├── middleware/           # Middleware tests
├── database/             # Database integration tests
├── e2e/                 # End-to-end tests (Playwright)
└── util/                # Test utilities and mocks
```

### Test Data Files

Test data files export arrays of test cases:

```typescript
// tests/data/controller/surveyData.ts
export const preprocessCreateData = [
    {
        description: 'test case description',
        input: { /* input data */ },
        expected: { /* expected output */ },
    },
    // ... more test cases
];

export const preprocessCreateErrorData = [
    {
        description: 'error case description',
        input: { /* input that should cause error */ },
        errorType: 'ValidationError',
        errorMessage: /pattern/i,
    },
    // ... more error cases
];
```

### Keyword Files

Keyword files export reusable test functions:

```typescript
// tests/keywords/common/controllerKeywords.ts
export function setupMock(mockFn: jest.Mock, returnValue?: any): void {
    if (returnValue !== undefined) {
        mockFn.mockResolvedValue(returnValue);
    }
}

export function verifyMockCall(mockFn: jest.Mock, ...args: any[]): void {
    expect(mockFn).toHaveBeenCalledWith(...args);
}
```

## Writing Tests

### Unit Tests

Unit tests focus on testing individual functions in isolation:

1. **Import test data and keywords**:
```typescript
import { utilTestData } from '../data/unit/utilData';
import { verifyResult } from '../keywords/common/controllerKeywords';
```

2. **Use data-driven approach**:
```typescript
describe('toLocalISODate', () => {
    test.each(toLocalISODateData)('$description', ({ input, expected }) => {
        const result = toLocalISODate(input);
        verifyResult(result, expected);
    });
});
```

### Controller Tests

Controller tests verify business logic with mocked services:

1. **Setup mocks using keywords**:
```typescript
import { setupMock, verifyMockCall } from '../keywords/common/controllerKeywords';

setupMock(surveyService.createSurveyTx as jest.Mock, 'survey-123');
```

2. **Use data-driven tests**:
```typescript
test.each(createEntityData)(
    '$description',
    async ({ userId, payload, expectedServiceCall, mockReturnValue }) => {
        setupMock(surveyService.createSurveyTx as jest.Mock, mockReturnValue);
        const result = await createEntity(userId, payload);
        verifyResult(result, mockReturnValue);
        verifyMockCall(surveyService.createSurveyTx as jest.Mock, ...);
    }
);
```

### Middleware Tests

Middleware tests verify request/response handling:

1. **Use middleware keywords**:
```typescript
import {
    expectMiddlewareSuccess,
    expectMiddlewareFailure,
} from '../keywords/middleware/middlewareKeywords';
```

2. **Test with data**:
```typescript
test.each(requireOwnerSuccessData)(
    '$description',
    async ({ session, resource, additional }) => {
        await expectMiddlewareSuccess(requireOwner(), session, resource, additional);
    }
);
```

### Database Tests

Database integration tests verify database operations:

1. **Use database keywords**:
```typescript
import {
    createTestEntity,
    verifyEntityExists,
    cleanupTestData,
} from '../keywords/database/databaseKeywords';
```

2. **Test with real database**:
```typescript
test('creates entity with valid data', async () => {
    const id = await createTestEntity({ title: 'Test' });
    await verifyEntityExists(id, { title: 'Test' });
});
```

3. **UUID Handling in Tests**:
Database entities with UUID primary keys require valid UUIDs. **Never use simple strings** like `'item-1'` or `'test-id'` in test data.

**Correct approach** - Generate UUIDs at runtime:
```typescript
import { v4 as uuidv4 } from 'uuid';

test.each(testData)('$description', async (testCase) => {
    // Generate UUIDs for items at runtime
    const itemIdMap = new Map<string, string>();
    testCase.items.forEach(item => {
        itemIdMap.set(item.id, uuidv4());
    });
    
    // Map items to use real UUIDs
    const items = testCase.items.map(item => ({
        ...item,
        id: itemIdMap.get(item.id)!
    }));
    
    // Use mapped items in service calls
    await createItems(listId, items);
    
    // Map expected results using itemIdMap
    const expectedIds = testCase.expectedIds.map(id => itemIdMap.get(id)!);
    expect(actualIds).toEqual(expectedIds);
});
```

**Why this pattern?**
- Entities use `@PrimaryGeneratedColumn("uuid")` which requires valid UUID format
- Test data should use readable IDs ('item-1', 'pack-item-1') for clarity
- Runtime mapping provides both readability and database compatibility

### E2E Tests

E2E tests verify complete user workflows using Playwright. They follow the same data-driven and keyword-driven patterns as other tests.

1. **Use test data and keywords**:
```typescript
// Import test data with all constants
import { surveyCreationData } from '../data/e2e/surveyData';
import { testCredentials, authUrls, formFields, successMessages, selectors } from '../data/e2e/authData';

// Import keywords
import { loginUser } from '../keywords/e2e/authKeywords';
import { createSurvey, generateEntityTitle } from '../keywords/e2e/entityKeywords';

// Data-driven test using for loop (Playwright pattern)
for (const data of surveyCreationData) {
    test(data.description, async ({ page }) => {
        await loginUser(page, testCredentials.username, testCredentials.password);
        const surveyTitle = generateEntityTitle(data.title);
        await page.goto(data.createUrl);
        await createSurvey(page, surveyTitle, data.surveyDescription, data.submitButtonText);
        await page.waitForURL((url) => data.expectedRedirectPattern.test(url.pathname));
    });
}
```

2. **Test data structure with all constants externalized**:
```typescript
// Common constants (authData.ts)
export const authUrls = {
    login: '/users/login',
    register: '/users/register',
    dashboard: '/users/dashboard',
};

export const formFields = {
    username: 'username',
    password: 'password',
};

export const successMessages = {
    accountActivated: 'Your account has been activated',
};

export const selectors = {
    alertSuccess: '.alert, .alert-success',
    alertDanger: '.alert, .alert-danger, [role="alert"]',
};

// Entity creation data
export const surveyCreationData = [
    {
        description: 'can create a new survey with valid data',
        createUrl: '/survey/create',
        title: 'E2E Survey',
        surveyDescription: 'Test survey description',
        submitButtonText: /create.*survey/i,
        expectedRedirectPattern: /\/(users\/dashboard|survey\/[\w-]*-[\w-]+)/,
        verifyTitleInPage: true,
        titleSelector: 'h1',
    },
];
```

3. **Consolidated success/failure data**:
```typescript
// Single array with flag indicating expected outcome
export const loginData = [
    {
        description: 'rejects wrong credentials',
        url: authUrls.login,
        username: 'invalid_user',
        password: 'wrong_password',
        shouldSucceed: false,
        expectedUrl: /\/users\/login/,
        expectedAlert: true,
    },
    {
        description: 'logs in with valid credentials',
        url: authUrls.login,
        username: testCredentials.username,
        password: testCredentials.password,
        shouldSucceed: true,
        expectedUrl: /\/users\/dashboard/,
    },
];

// Test uses conditional logic based on data
for (const data of loginData) {
    test(data.description, async ({ page }) => {
        await page.goto(data.url);
        await fillLoginForm(page, data.username, data.password);
        
        if (data.shouldSucceed) {
            await expect(page).toHaveURL(data.expectedUrl);
        } else {
            await verifyErrorAlert(page);
        }
    });
}
```

4. **Use keywords for common operations**:
```typescript
// Authentication keyword
await loginUser(page, username, password);

// Entity management keywords
await navigateToEntityCreatePage(page, 'survey', expectedUrl, expectedHeading);
await verifyUnauthenticatedRedirect(page, targetUrl, expectedRedirectUrl);
await verifyDashboardEmptyState(page, accordionId, buttonText, expectedEmptyText);

// Navigation keywords
await verifyLinkVisible(page, linkName);
await navigateThroughSteps(page, steps);

// Validation keywords
await verifyErrorMessage(page, selector, expectedText);
await verifyFieldRequired(page, fieldName);
```

5. **E2E test organization**:
- Test files: `tests/e2e/*.test.ts`
- Test data: `tests/data/e2e/*.ts` (includes all URLs, selectors, messages, field names)
- Test keywords: `tests/keywords/e2e/*.ts`
- Database helpers: `tests/keywords/e2e/dbKeywords.ts`
- **Zero hardcoded strings** - All constants defined in data files

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suite
```bash
npm test -- tests/unit/util.test.ts
npm test -- tests/controller/survey.controller.test.ts
```

### Watch Mode
```bash
npm run test:watch
```

### With Coverage
```bash
npm test -- --coverage
```

### E2E Tests
```bash
npm run e2e
npm run e2e:headed  # With browser visible
npm run e2e:ui      # With Playwright UI
```

## Best Practices

### Test Data

1. **Organize by category**: Keep test data files organized by test type
2. **Use descriptive names**: Name test cases clearly (use `description` field)
3. **Cover edge cases**: Include boundary conditions, empty inputs, invalid data
4. **Avoid duplication**: Reuse test data where possible
5. **Use builders**: Leverage test data builders for complex objects

### Test Keywords

1. **Single responsibility**: Each keyword should do one thing well
2. **Composable**: Design keywords to be composed into complex scenarios
3. **Clear naming**: Use action-oriented names (create*, verify*, setup*)
4. **Return useful data**: Return values that enable further assertions
5. **Handle errors gracefully**: Include error handling in keywords

### Test Code

1. **Use data-driven tests**: Prefer `test.each()` over multiple similar tests
2. **Use keywords**: Abstract common operations into reusable keywords
3. **Clear assertions**: Use descriptive keywords like `verifyResult()`
4. **Minimal mocking**: Mock only external dependencies
5. **Clean setup/teardown**: Use `beforeEach`/`afterEach` for test isolation

### Naming Conventions

**Test Data**:
- `*Data.ts` - test data files
- `*SuccessData` - success scenario test cases
- `*FailureData` - failure scenario test cases
- `*ErrorData` - error condition test cases

**Keywords**:
- `*Keywords.ts` - keyword files
- `create*` - create entities or data
- `verify*` - verify conditions or state
- `setup*` - setup test preconditions
- `expect*` - expect specific outcomes
- `cleanup*` - cleanup test data

**Test Files**:
- `*.test.ts` - test files
- `*.refactored.test.ts` - temporary refactored version (before replacement)
- `*.backup` - backup of original test (kept for reference)

### Test Coverage

- Aim for high coverage of critical paths
- Cover both success and failure scenarios
- Include edge cases and boundary conditions
- Test error handling and validation
- Focus on behavior, not implementation

### Migration Guidelines

When migrating existing tests to data-driven/keyword-driven approach:

1. **Analyze current tests**: Identify patterns and repetition
2. **Extract test data**: Move hard-coded values to data files
3. **Create keywords**: Extract common operations into keywords
4. **Refactor tests**: Rewrite tests using data and keywords
5. **Verify coverage**: Ensure new tests cover same scenarios (or more)
6. **Run tests**: Verify all tests pass
7. **Compare metrics**: Check that coverage is maintained or improved
8. **Replace original**: Replace original test file with refactored version

## Examples

### Complete Unit Test Example

```typescript
// tests/data/unit/utilData.ts
export const toLocalISODateData = [
    {
        description: 'converts UTC date to YYYY-MM-DD format',
        input: new Date(Date.UTC(2025, 5, 1, 12, 23, 45)),
        expected: '2025-06-01',
    },
    // ... more cases
];

// tests/unit/util.test.ts
import { toLocalISODateData } from '../data/unit/utilData';

describe('toLocalISODate', () => {
    test.each(toLocalISODateData)('$description', async ({ input, expected }) => {
        const { toLocalISODate } = await importWithMocks();
        const result = toLocalISODate(input);
        expect(result).toBe(expected);
    });
});
```

### Complete Controller Test Example

```typescript
// tests/data/controller/surveyData.ts
export const createEntityData = [
    {
        description: 'creates survey with basic data',
        userId: 42,
        payload: { title: 'Test', description: 'Desc', combinations: [...] },
        expectedServiceCall: { userId: 42, title: 'Test', ... },
        mockReturnValue: 'survey-123',
    },
];

// tests/controller/survey.controller.test.ts
import { createEntityData } from '../data/controller/surveyData';
import { setupMock, verifyMockCall, verifyResult } from '../keywords/common/controllerKeywords';

test.each(createEntityData)(
    '$description',
    async ({ userId, payload, expectedServiceCall, mockReturnValue }) => {
        setupMock(surveyService.createSurveyTx as jest.Mock, mockReturnValue);
        const result = await createEntity(userId, payload);
        verifyResult(result, mockReturnValue);
        verifyMockCall(surveyService.createSurveyTx as jest.Mock, ...);
    }
);
```

## Frontend Testing

### Overview

Frontend tests run **without a backend** and use MSW (Mock Service Worker) to mock HTTP requests. They provide fast, reliable testing of client-side code.

### Test Types

**Unit Tests** (`tests/client/unit/`):
- Test pure JavaScript/TypeScript logic
- No DOM or HTTP dependencies
- Examples: formatting utils, validation logic, permission checks

**UI Tests** (`tests/client/ui/`):
- Test DOM behavior and user interactions
- Use Testing Library for accessibility-oriented queries
- Examples: form validation UI, interactive components

**Flow Tests** (`tests/client/flows/`):
- Test complete user workflows with mocked APIs
- Multi-step interactions
- Examples: registration flows, form submissions

### Running Frontend Tests

```bash
# All frontend tests
npm run test:client

# Specific test suites
npm run test:client:unit
npm run test:client:ui
npm run test:client:flows

# With coverage
npm run test:client:coverage
```

### MSW (Mock Service Worker)

MSW intercepts HTTP requests and provides mocked responses:

```typescript
// Using default handlers
import { post } from '../../../src/public/js/core/http';

test('registers for event', async () => {
    const result = await post('/api/event/123/register', { userId: 1 });
    expect(result.status).toBe('success');
});

// Overriding handlers for specific tests
import { server } from '../msw/server';
import { http, HttpResponse } from 'msw';

test('handles error', async () => {
    server.use(
        http.post('/api/event/123/register', () => {
            return HttpResponse.json({
                status: 'error',
                message: 'Event is full',
            }, { status: 409 });
        })
    );
    
    await expect(
        post('/api/event/123/register', { userId: 1 })
    ).rejects.toThrow('Event is full');
});
```

### Testing Library

Use accessibility-oriented queries:

```typescript
import { screen } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

test('validates password', async () => {
    document.body.innerHTML = `
        <label for="password">Password</label>
        <input id="password" type="password" />
    `;
    
    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'short');
    
    expect(passwordInput).toHaveClass('is-invalid');
});
```

### Frontend Testing Best Practices

1. **Test behavior, not implementation** - Focus on what users see and do
2. **Keep tests independent** - Each test should set up its own state
3. **Use descriptive names** - Describe what and why
4. **Test edge cases** - Empty inputs, validation errors, etc.
5. **Mock only external dependencies** - Don't mock internal functions

For detailed frontend testing documentation, see [tests/client/README.md](tests/client/README.md).

## Contributing

When contributing tests:

1. Follow the data-driven and keyword-driven patterns (backend)
2. Use MSW and Testing Library for frontend tests
3. Add test data to appropriate data files
4. Create or reuse keywords for common operations
5. Write clear, descriptive test case descriptions
6. Ensure tests are isolated and repeatable
7. Update this documentation if adding new patterns

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/)
- [MSW Documentation](https://mswjs.io/docs/)
- [Testing Library](https://testing-library.com/docs/)
- [Frontend Testing Guide](tests/client/README.md)
