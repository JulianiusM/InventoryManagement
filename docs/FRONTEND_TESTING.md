# Frontend Testing Guide

This directory contains comprehensive frontend tests for the Surveyor application. These tests run **without a backend** and use MSW (Mock Service Worker) to intercept and mock HTTP requests.

## Overview

Frontend tests are organized into three layers:

1. **Unit Tests** (`tests/client/unit/`) - Pure logic testing
2. **UI Tests** (`tests/client/ui/`) - DOM behavior testing  
3. **Flow Tests** (`tests/client/flows/`) - Multi-step interaction testing

All tests use Jest with jsdom environment and MSW for API mocking.

## Running Tests

```bash
# Run all frontend tests
npm run test:client

# Run specific test suites
npm run test:client:unit       # Pure logic tests only
npm run test:client:ui         # DOM behavior tests only
npm run test:client:flows      # Integration flow tests only

# Run with coverage
npm run test:client:coverage

# Watch mode for development
npm run test:client:watch
```

## Test Organization

### Data-Driven and Keyword-Driven Testing

Frontend tests follow the same patterns as backend tests:

**Test Data** (`tests/client/data/`):
- Test cases defined as data arrays
- Separated from test logic for maintainability
- Examples: `formattingData.ts`, `passwordValidationData.ts`, `eventRegistrationData.ts`

**Test Keywords** (`tests/client/keywords/`):
- Reusable test actions and assertions
- Abstract implementation details
- Examples: `formattingKeywords.ts`, `passwordValidationKeywords.ts`, `httpKeywords.ts`

**Example Pattern:**
```typescript
// Test data (tests/client/data/formattingData.ts)
export const padNumberData = [
    {
        description: 'pads single digit with zero by default',
        input: { num: 5 },
        expected: '05',
    },
    // ... more cases
];

// Test keywords (tests/client/keywords/formattingKeywords.ts)
export function testPadNumber(input: { num: number }, expected: string): void {
    const result = padNumber(input.num);
    expect(result).toBe(expected);
}

// Test file (tests/client/unit/formatting.test.ts)
import { padNumberData } from '../data/formattingData';
import { testPadNumber } from '../keywords/formattingKeywords';

describe('padNumber - Data Driven', () => {
    test.each(padNumberData)(
        '$description',
        ({ input, expected }) => {
            testPadNumber(input, expected);
        }
    );
});
```

### Unit Tests (`tests/client/unit/`)

Test pure JavaScript/TypeScript logic without DOM or HTTP interactions.

**Examples:**
- `formatting.test.ts` - Date/time formatting utilities (40 data-driven tests)
- `password-validation.test.ts` - Password strength validation logic
- `permissions.test.ts` - Permission checking utilities
- `http.test.ts` - HTTP client utilities (with mocked fetch)

**Characteristics:**
- No DOM manipulation
- No HTTP requests (except in http.test.ts which mocks them)
- Fast execution
- Test edge cases and boundary conditions
- Use data-driven approach with `test.each()`

### UI Tests (`tests/client/ui/`)

Test DOM behavior and user interactions using Testing Library.

**Examples:**
- `password-ui.test.ts` - Password validation UI feedback

**Characteristics:**
- Render DOM elements
- Simulate user interactions (typing, clicking, form submission)
- Assert DOM state changes
- Use Testing Library queries (`getByRole`, `getByLabelText`, etc.)

### Flow Tests (`tests/client/flows/`)

Test complete user flows with mocked backend responses.

**Examples:**
- `event-registration.test.ts` - Complete registration workflow

**Characteristics:**
- Multi-step workflows
- HTTP requests (mocked by MSW)
- Test happy paths and error scenarios
- Verify end-to-end behavior without real backend

## MSW (Mock Service Worker)

### Overview

MSW intercepts HTTP requests at the network level and provides mocked responses. This allows frontend tests to run independently of the backend.

### Configuration

- **Server:** `tests/client/msw/server.ts` - MSW server instance
- **Handlers:** `tests/client/msw/handlers.ts` - Default API endpoint handlers
- **Setup:** `tests/client/setupTests.ts` - Global test setup with MSW initialization

### Type-Safe MSW Handlers

MSW handlers use actual backend types for request/response:

```typescript
// tests/client/msw/handlers.ts
import type { CreateEventDTO } from '../../../src/types/EventTypes';

interface ApiResponse<T = any> {
    status: 'success' | 'error';
    message?: string;
    data?: T;
}

// Handlers match backend API routes and types
http.post('/api/event/:id/register', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
        status: 'success',
        message: 'Successfully registered',
        data: body
    } as ApiResponse);
});
```

### Using MSW in Tests

#### Using Default Handlers

Default handlers are automatically available for common endpoints:

```typescript
import { post } from '../../../src/public/js/core/http';

test('registers for event', async () => {
    // Uses default handler from handlers.ts
    const result = await post('/api/event/123/register', { userId: 1 });
    expect(result.status).toBe('success');
});
```

#### Overriding Handlers for Specific Tests

```typescript
import { server } from '../msw/server';
import { http, HttpResponse } from 'msw';

test('handles registration error', async () => {
    // Override default handler for this test
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

#### Testing Different Scenarios

```typescript
test('validates request data', async () => {
    server.use(
        http.post('/api/event/123/register', async ({ request }) => {
            const body = await request.json();
            
            if (!body.email) {
                return HttpResponse.json({
                    status: 'error',
                    message: 'Email is required',
                }, { status: 400 });
            }
            
            return HttpResponse.json({ status: 'success' });
        })
    );
    
    await expect(
        post('/api/event/123/register', { userId: 1 })
    ).rejects.toThrow('Email is required');
});
```

## Testing Library

We use Testing Library for DOM testing with accessibility-oriented queries.

### Preferred Queries

1. `getByRole` - Find by ARIA role (button, textbox, etc.)
2. `getByLabelText` - Find form inputs by their labels
3. `getByText` - Find by visible text content
4. `getByPlaceholderText` - Find by placeholder
5. Avoid CSS selectors when possible

### Example

```typescript
import { screen, waitFor } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';

test('validates password input', async () => {
    document.body.innerHTML = `
        <label for="password">Password</label>
        <input id="password" type="password" />
        <div id="feedback"></div>
    `;
    
    const passwordInput = screen.getByLabelText('Password');
    const user = userEvent.setup();
    
    await user.type(passwordInput, 'short');
    
    expect(passwordInput).toHaveClass('is-invalid');
});
```

## Best Practices

### 1. Test Behavior, Not Implementation

❌ **Bad:**
```typescript
test('calls validatePassword function', () => {
    const spy = jest.spyOn(module, 'validatePassword');
    // ...
    expect(spy).toHaveBeenCalled();
});
```

✅ **Good:**
```typescript
test('shows error message for invalid password', () => {
    // Test the visible outcome
    expect(screen.getByText(/password must be/i)).toBeInTheDocument();
});
```

### 2. Keep Tests Independent

Each test should set up its own state and not depend on other tests:

```typescript
beforeEach(() => {
    document.body.innerHTML = ''; // Clean slate
    // Set up fresh DOM for each test
});
```

### 3. Test Edge Cases

Don't just test the happy path:

```typescript
test.each([
    { input: '', expected: false, description: 'empty password' },
    { input: 'short', expected: false, description: 'too short' },
    { input: '12345678', expected: false, description: 'no letters' },
    { input: 'password', expected: false, description: 'no digits' },
    { input: 'Password123', expected: true, description: 'valid password' },
])('validates $description', ({ input, expected }) => {
    expect(isPasswordValid(input)).toBe(expected);
});
```

### 4. Use Descriptive Test Names

```typescript
// ✅ Good - describes what and why
test('prevents form submission when password is invalid');
test('shows error message when email format is incorrect');

// ❌ Bad - vague
test('validation works');
test('test password');
```

### 5. Mock Only External Dependencies

- ✅ Mock HTTP requests (MSW)
- ✅ Mock browser APIs not in jsdom
- ❌ Don't mock internal functions you're testing
- ❌ Don't mock entire modules unnecessarily

## Coverage

Frontend tests maintain separate coverage from backend tests.

**Coverage Goals:**
- Branches: 50%+
- Functions: 50%+
- Lines: 50%+
- Statements: 50%+

**View Coverage:**
```bash
npm run test:client:coverage
# Open coverage/client/lcov-report/index.html
```

## Debugging Tests

### Run Single Test File

```bash
npm run test:client tests/client/unit/formatting.test.ts
```

### Run Single Test

```bash
npm run test:client -- -t "formats date correctly"
```

### Debug Mode

```bash
node --inspect-brk node_modules/.bin/jest --config jest.client.config.ts --runInBand
```

## Common Issues

### Issue: "Response is not defined"

**Cause:** Missing polyfills for fetch/Response/etc.

**Solution:** Already handled in `setupTests.ts` with undici and stream/web polyfills.

### Issue: "MSW: Cannot intercept request"

**Cause:** Missing or incorrect MSW handler.

**Solution:** Add handler to `handlers.ts` or override in test with `server.use()`.

### Issue: "Element not found"

**Cause:** DOM query doesn't match rendered HTML.

**Solution:** 
- Check your HTML structure in the test
- Use `screen.debug()` to see current DOM
- Verify you're using the right query method

## Adding New Tests

### 1. Create Test Data File (if using data-driven approach)

```typescript
// tests/client/data/myModuleData.ts
export const myFunctionData = [
    {
        description: 'handles basic case',
        input: { value: 'input' },
        expected: 'output',
    },
    // ... more test cases
];
```

### 2. Create Test Keywords (if needed)

```typescript
// tests/client/keywords/myModuleKeywords.ts
import { myFunction } from '../../../src/public/js/my-module';

export function testMyFunction(input: { value: string }, expected: string): void {
    const result = myFunction(input.value);
    expect(result).toBe(expected);
}
```

### 3. Create Test File

```typescript
// tests/client/unit/my-module.test.ts
import { myFunctionData } from '../data/myModuleData';
import { testMyFunction } from '../keywords/myModuleKeywords';

describe('myFunction - Data Driven', () => {
    test.each(myFunctionData)(
        '$description',
        ({ input, expected }) => {
            testMyFunction(input, expected);
        }
    );
});
```

### 4. Add Type-Safe MSW Handler (if testing API calls)

```typescript
// tests/client/msw/handlers.ts
import type { MyRequestDTO, MyResponseDTO } from '../../../src/types/MyTypes';

export const handlers = [
    // ... existing handlers
    http.post<never, MyRequestDTO>('/api/my-endpoint', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
            status: 'success',
            data: body
        } as ApiResponse<MyResponseDTO>);
    }),
];
```

### 5. Run Tests

```bash
npm run test:client
```

## Related Documentation

- [Main Testing Guide](../../TESTING.md) - Backend and E2E testing patterns
- [MSW Documentation](https://mswjs.io/docs/) - Mock Service Worker
- [Testing Library](https://testing-library.com/docs/) - DOM testing utilities
- [Jest Configuration](../../jest.client.config.ts) - Frontend Jest config

## Contributing

When adding frontend features:

1. Add unit tests for pure logic
2. Add UI tests for DOM interactions
3. Add flow tests for complete workflows
4. Update MSW handlers if adding new API endpoints
5. Ensure all tests pass: `npm run test:client`
6. Check coverage: `npm run test:client:coverage`
