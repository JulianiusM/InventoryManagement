// tests/client/setupTests.ts
// Global test setup for frontend tests
import '@testing-library/jest-dom';
import { server } from './msw/server';
import { initializeAllEndpoints } from './helpers/testSetup';

/**
 * Setup MSW server for mocking HTTP requests
 * This runs before all tests and intercepts fetch/XHR calls
 */

// Start server before all tests
beforeAll(() => {
    server.listen({
        // Warn instead of error for unhandled requests to make debugging easier
        // Change to 'error' once all handlers are properly set up
        onUnhandledRequest: 'warn',
    });

    // Initialize ALL valid endpoints with queue handlers
    // This allows tests to use mockApiSuccess/mockApiError without manual setup
    initializeAllEndpoints();
});

// Reset handlers after each test to avoid test interdependencies
afterEach(() => {
    server.resetHandlers();
    // Reinitialize endpoint handlers after reset
    // resetHandlers() removes all runtime handlers, including our queue handlers
    initializeAllEndpoints();
});

// Clean up after all tests
afterAll(() => {
    server.close();
});

/**
 * Mock window.Surveyor global object
 * This is injected by the backend in production but needs to be mocked in tests
 */
beforeEach(() => {
    // Reset window.Surveyor to clean state
    // Preserve init function if it was set by a module
    if (!window.Surveyor) {
        (window as any).Surveyor = {};
    }
    const existingInit = window.Surveyor.init;
    // Reset properties but preserve init
    window.Surveyor.rawPermissions = undefined;
    window.Surveyor.permissions = undefined;
    window.Surveyor.init = existingInit; // Always set, even if undefined

    // Mock scrollIntoView (not available in jsdom)
    Element.prototype.scrollIntoView = jest.fn();
});

/**
 * Mock jQuery if needed (some frontend code uses it)
 * You can expand this as needed for your specific use cases
 */
declare global {
    interface Window {
        $?: any;
        jQuery?: any;
    }
}

/**
 * Suppress console errors in tests unless explicitly testing error handling
 * Uncomment the lines below if you want to silence console output in tests
 */
// const originalError = console.error;
// beforeAll(() => {
//     console.error = jest.fn();
// });
// afterAll(() => {
//     console.error = originalError;
// });
