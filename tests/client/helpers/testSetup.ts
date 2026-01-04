/**
 * Shared test setup and teardown utilities
 * Single source of truth for common test patterns
 */

import {server} from '../msw/server';
import {http, HttpResponse} from 'msw';
import {getAllEndpointsWithMethods} from './validEndpoints';

/**
 * Response queue entry for endpoint-specific mocking
 */
interface QueuedResponse {
    status: 'success' | 'error';
    data?: any;
    message?: string;
    statusCode?: number;
}

/**
 * Response queue manager for endpoint-specific mock responses
 * Allows tests to set individual responses without direct MSW setup
 */
class ResponseQueueManager {
    private queues: Map<string, QueuedResponse[]> = new Map();

    /**
     * Add a response to the queue for a specific endpoint
     * @param method HTTP method (GET, POST, etc.)
     * @param path API endpoint path
     * @param response Response data to return
     */
    enqueue(method: string, path: string, response: QueuedResponse): void {
        const key = `${method.toUpperCase()} ${path}`;
        if (!this.queues.has(key)) {
            this.queues.set(key, []);
        }
        this.queues.get(key)!.push(response);
    }

    /**
     * Get the next response from the queue for an endpoint
     * Returns undefined if queue is empty
     */
    dequeue(method: string, path: string): QueuedResponse | undefined {
        const key = `${method.toUpperCase()} ${path}`;
        const queue = this.queues.get(key);
        return queue?.shift();
    }

    /**
     * Check if a queue exists and has responses
     */
    hasResponse(method: string, path: string): boolean {
        const key = `${method.toUpperCase()} ${path}`;
        const queue = this.queues.get(key);
        return queue !== undefined && queue.length > 0;
    }

    /**
     * Clear all queues
     */
    clear(): void {
        this.queues.clear();
    }

    /**
     * Clear queue for specific endpoint
     */
    clearEndpoint(method: string, path: string): void {
        const key = `${method.toUpperCase()} ${path}`;
        this.queues.delete(key);
    }
}

// Global instance
export const responseQueue = new ResponseQueueManager();

/**
 * Standard test setup configuration
 */
export interface TestSetupConfig {
    /**
     * Whether to reset document.body.innerHTML before each test
     * @default true
     */
    clearDOM?: boolean;

    /**
     * Whether to clear all mocks before each test
     * @default true
     */
    clearMocks?: boolean;

    /**
     * Whether to reset response queues before each test
     * @default true
     */
    clearResponseQueue?: boolean;

    /**
     * Custom beforeEach logic
     */
    beforeEach?: () => void;

    /**
     * Custom afterEach logic
     */
    afterEach?: () => void;
}

/**
 * Standard test setup with common patterns
 * Call this in your describe block to get consistent setup/teardown
 *
 * @example
 * ```typescript
 * describe('My Component', () => {
 *     setupTest({
 *         beforeEach: () => {
 *             // Custom setup
 *         }
 *     });
 *
 *     test('does something', () => {
 *         // Test code
 *     });
 * });
 * ```
 */
export function setupTest(config: TestSetupConfig = {}): void {
    const {
        clearDOM = true,
        clearMocks = true,
        clearResponseQueue = true,
        beforeEach: customBeforeEach,
        afterEach: customAfterEach,
    } = config;

    beforeEach(() => {
        // Clear DOM
        if (clearDOM) {
            document.body.innerHTML = '';
        }

        // Clear mocks
        if (clearMocks) {
            jest.clearAllMocks();
        }

        // Clear response queues
        if (clearResponseQueue) {
            responseQueue.clear();
        }

        // Mock common window properties
        // Note: Only mock location if tests need it - some tests override this themselves
        // Tests that need location should mock it explicitly or use the pattern:
        // delete (window as any).location;
        // (window as any).location = { ... };

        // Custom setup
        if (customBeforeEach) {
            customBeforeEach();
        }
    });

    afterEach(() => {
        // Custom teardown
        if (customAfterEach) {
            customAfterEach();
        }
    });
}

/**
 * Mock a successful API response
 * Uses the response queue system
 *
 * @example
 * ```typescript
 * mockApiSuccess('GET', '/api/event/123', { 
 *     id: 123, 
 *     title: 'Test Event' 
 * });
 * ```
 */
export function mockApiSuccess(method: string, path: string, data?: any, message?: string): void {
    responseQueue.enqueue(method, path, {
        status: 'success',
        data,
        message: message || 'Success',
    });
}

/**
 * Mock a failed API response
 * Uses the response queue system
 *
 * @example
 * ```typescript
 * mockApiError('POST', '/api/event/123/register', 'Event is full', 400);
 * ```
 */
export function mockApiError(method: string, path: string, message: string, statusCode: number = 400): void {
    responseQueue.enqueue(method, path, {
        status: 'error',
        message,
        statusCode,
    });
}

/**
 * Set up MSW handler to use response queue for a specific endpoint
 * This should be called once per endpoint in your test suite
 * The handler will automatically use responses from the queue
 *
 * @example
 * ```typescript
 * setupQueuedEndpoint('GET', '/api/event/:id');
 * ```
 */
export function setupQueuedEndpoint(method: string, path: string): void {
    const httpMethod = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch';

    server.use(
        http[httpMethod](path, ({params, request}) => {
            // Build actual path with params replaced
            let actualPath = path;
            for (const [key, value] of Object.entries(params)) {
                actualPath = actualPath.replace(`:${key}`, String(value));
            }

            // Check if there's a queued response
            const queuedResponse = responseQueue.dequeue(method, actualPath);

            if (queuedResponse) {
                const {status, data, message, statusCode} = queuedResponse;

                if (status === 'error') {
                    return HttpResponse.json(
                        {status: 'error', message},
                        {status: statusCode || 400}
                    );
                }

                return HttpResponse.json({
                    status: 'success',
                    message,
                    data,
                });
            }

            // No queued response - return default success
            return HttpResponse.json({
                status: 'success',
                message: 'Default response',
                data: null,
            });
        })
    );
}

/**
 * Initialize ALL valid endpoints with queue handlers
 * This is called automatically during test setup
 * After this, any test can use mockApiSuccess/mockApiError without manual endpoint setup
 * 
 * Note: Can be called multiple times (e.g., after server.resetHandlers())
 * MSW will deduplicate handlers automatically
 */
export function initializeAllEndpoints(): void {
    const allEndpoints = getAllEndpointsWithMethods();

    for (const {method, path} of allEndpoints) {
        setupQueuedEndpoint(method, path);
    }

    // Silent initialization - handlers are ready for use
}

/**
 * Common DOM setup utilities
 */
export const dom = {
    /**
     * Create a basic form element with common structure
     */
    createForm(fields: Array<{ name: string; value?: string; type?: string }>): HTMLFormElement {
        const form = document.createElement('form');

        for (const field of fields) {
            const input = document.createElement('input');
            input.name = field.name;
            input.type = field.type || 'text';
            if (field.value) input.value = field.value;
            form.appendChild(input);
        }

        return form;
    },

    /**
     * Create a table with data-assignable attribute for assignment tests
     */
    createAssignableTable(rows: Array<{ itemId: string; count?: number; max?: number }>): HTMLTableElement {
        const table = document.createElement('table');
        table.dataset.assignable = 'true';

        const tbody = document.createElement('tbody');
        for (const row of rows) {
            const tr = document.createElement('tr');
            tr.dataset.itemid = row.itemId;
            tr.innerHTML = `
                <td>
                    <span data-count>${row.count || 0}</span> / 
                    <span data-max>${row.max || 10}</span>
                </td>
                <td>
                    <button data-action="assign" class="btn btn-outline-success">Take</button>
                </td>
            `;
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);

        return table;
    },

    /**
     * Create Bootstrap modal structure
     */
    createModal(id: string, content?: string): HTMLDivElement {
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Modal Title</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        ${content || 'Modal content'}
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary">Confirm</button>
                    </div>
                </div>
            </div>
        `;
        return modal;
    },
};

/**
 * Common mock utilities
 */
export const mocks = {
    /**
     * Create a mock Bootstrap Modal instance
     */
    createBootstrapModal(): any {
        return {
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
        };
    },

    /**
     * Set up Bootstrap global mock
     */
    setupBootstrap(): void {
        const mockModal = mocks.createBootstrapModal();
        (window as any).bootstrap = {
            Modal: jest.fn(() => mockModal),
            Toast: jest.fn(() => ({
                show: jest.fn(),
                hide: jest.fn(),
            })),
            Tooltip: jest.fn(() => ({
                show: jest.fn(),
                hide: jest.fn(),
                dispose: jest.fn(),
            })),
        };
    },
};
