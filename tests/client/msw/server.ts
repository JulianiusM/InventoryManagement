// tests/client/msw/server.ts
// MSW server for mocking HTTP requests in frontend tests
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * MSW server instance for intercepting HTTP requests in Node (Jest) tests
 * This runs in Node mode and intercepts fetch/XHR calls during frontend tests
 */
export const server = setupServer(...handlers);
