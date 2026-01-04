# Test Helpers

Shared test utilities for frontend tests - single source of truth for common test patterns.

## Features

### 1. Combined Setup/Teardown (`setupTest`)

Provides consistent setup and teardown for all tests:

```typescript
import { setupTest } from './helpers/testSetup';

describe('My Component', () => {
    // Single setup call handles all common patterns
    setupTest({
        beforeEach: () => {
            // Custom setup (optional)
        }
    });
    
    test('does something', () => {
        // Test code - DOM is clean, mocks are reset, queue is clear
    });
});
```

**What it does:**
- ✅ Clears `document.body.innerHTML`
- ✅ Resets all Jest mocks
- ✅ Clears response queues
- ✅ Resets `window.Surveyor`
- ✅ Mocks `window.location`

### 2. Response Queue System (Automatic Initialization)

**ALL valid endpoints are automatically initialized** - tests can immediately use `mockApiSuccess()` or `mockApiError()` without any setup!

```typescript
import { mockApiSuccess, mockApiError, setupTest } from './helpers/testSetup';

describe('Event Registration', () => {
    setupTest();
    
    test('registers for event successfully', async () => {
        // Just queue the response - endpoint already initialized!
        mockApiSuccess('POST', '/api/event/123/register', { 
            registered: true 
        });
        
        // Make the request (through your component)
        await registerForEvent('123');
        
        // Response from queue is used automatically
        expect(success).toBe(true);
    });
    
    test('handles registration error', async () => {
        // Queue an error response - no setup required!
        mockApiError('POST', '/api/event/123/register', 'Event is full', 400);
        
        await registerForEvent('123');
        
        expect(errorMessage).toBe('Event is full');
    });
});
```

**How it works:**
- 🎯 All 100+ valid endpoints are initialized automatically at test startup
- 🎯 Queues are cleared before each test
- 🎯 Tests just call `mockApiSuccess()` or `mockApiError()` - that's it!

**Benefits:**
- ✅ No manual endpoint setup required
- ✅ No `server.use()` calls in tests
- ✅ Responses are automatically consumed in order
- ✅ Simpler test code
- ✅ Clear intent

### 3. Endpoint Validation

All mocked endpoints are validated against actual backend routes:

```typescript
// This will warn in console if endpoint doesn't exist in backend
mockApiSuccess('GET', '/api/nonexistent/endpoint', {});

// Valid endpoints from validEndpoints.ts are silent
mockApiSuccess('GET', '/api/event/123', { event: {...} });
```

**Path validation:**
- ✅ Checks against `validEndpoints.ts` (extracted from `src/routes/`)
- ✅ Warns on invalid endpoints
- ✅ Prevents mocking non-existent APIs

### 4. Common DOM Utilities

Pre-built DOM structures for common test scenarios:

```typescript
import { setupTest, dom } from './helpers/testSetup';

describe('Assignment Table', () => {
    setupTest();
    
    test('updates assignment count', () => {
        // Create a standard assignable table
        const table = dom.createAssignableTable([
            { itemId: '1', count: 5, max: 10 },
            { itemId: '2', count: 3, max: 8 },
        ]);
        document.body.appendChild(table);
        
        // Test your code...
    });
});
```

**Available utilities:**
- `dom.createForm()` - Basic form with fields
- `dom.createAssignableTable()` - Assignment table structure  
- `dom.createModal()` - Bootstrap modal structure

### 5. Common Mock Utilities

Pre-configured mocks for common scenarios:

```typescript
import { setupTest, mocks } from './helpers/testSetup';

describe('Modal Interactions', () => {
    setupTest();
    
    beforeEach(() => {
        mocks.setupBootstrap(); // Sets up Bootstrap.Modal, Toast, Tooltip
    });
    
    test('shows modal', () => {
        // Bootstrap is already mocked
        const modal = new bootstrap.Modal(element);
        modal.show();
        
        expect(modal.show).toHaveBeenCalled();
    });
});
```

## Migration Guide

### Before (Old Pattern)

```typescript
describe('Component Test', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        jest.clearAllMocks();
        (window as any).Surveyor = {};
        delete (window as any).location;
        (window as any).location = { reload: jest.fn() };
    });
    
    test('makes API call', async () => {
        server.use(
            http.post('/api/event/123/register', () => {
                return HttpResponse.json({ 
                    status: 'success', 
                    data: { registered: true } 
                });
            })
        );
        
        await register();
        expect(result).toBeTruthy();
    });
});
```

### After (New Pattern)

```typescript
import { setupTest, mockApiSuccess } from './helpers/testSetup';

describe('Component Test', () => {
    setupTest(); // All common setup in one line!
    
    test('makes API call', async () => {
        // Simple, clear response mocking
        mockApiSuccess('POST', '/api/event/123/register', { 
            registered: true 
        });
        
        await register();
        expect(result).toBeTruthy();
    });
});
```

## API Reference

### `setupTest(config?)`

Configure test setup/teardown behavior.

**Options:**
- `clearDOM?: boolean` - Clear document.body (default: `true`)
- `clearMocks?: boolean` - Clear Jest mocks (default: `true`)  
- `clearResponseQueue?: boolean` - Clear response queues (default: `true`)
- `beforeEach?: () => void` - Custom setup
- `afterEach?: () => void` - Custom teardown

### `mockApiSuccess(method, path, data?, message?)`

Queue a successful API response for ANY valid backend endpoint (no setup required).

**Parameters:**
- `method: string` - HTTP method (GET, POST, etc.)
- `path: string` - API endpoint path (must be in validEndpoints.ts)
- `data?: any` - Response data
- `message?: string` - Success message

**Example:**
```typescript
mockApiSuccess('GET', '/api/event/123', { id: 123, title: 'My Event' });
mockApiSuccess('POST', '/api/activity/456/assign', { success: true });
```

**Note:** For test-only endpoints (like `/api/test`), use `server.use()` directly instead.

### `mockApiError(method, path, message, statusCode?)`

Queue an error API response for ANY valid backend endpoint (no setup required).

**Parameters:**
- `method: string` - HTTP method
- `path: string` - API endpoint path (must be in validEndpoints.ts)
- `message: string` - Error message
- `statusCode?: number` - HTTP status code (default: 400)

**Example:**
```typescript
mockApiError('POST', '/api/event/123/register', 'Event is full', 400);
mockApiError('GET', '/api/users/search', 'Unauthorized', 401);
```

### `dom.createForm(fields)`

Create a form element.

**Parameters:**
- `fields: Array<{name, value?, type?}>` - Form fields

### `dom.createAssignableTable(rows)`

Create an assignment table.

**Parameters:**
- `rows: Array<{itemId, count?, max?}>` - Table rows

### `dom.createModal(id, content?)`

Create a Bootstrap modal.

**Parameters:**
- `id: string` - Modal element ID
- `content?: string` - Modal body HTML

### `mocks.setupBootstrap()`

Set up Bootstrap global mocks (Modal, Toast, Tooltip).

### `mocks.createBootstrapModal()`

Create a mock Bootstrap Modal instance.

## Valid Endpoints

Endpoints are validated against `validEndpoints.ts`, which is extracted from `src/routes/**`.

To update valid endpoints list:
```bash
npm run generate-endpoints  # TODO: implement this script
```

Or manually update `tests/client/helpers/validEndpoints.ts` when routes change.
