// tests/client/msw/handlers.ts
// MSW request handlers for mocking API endpoints in frontend tests
// Uses actual backend types for type safety
import { http, HttpResponse } from 'msw';
import type { CreateEventDTO, DIETARY } from '../../../src/types/EventTypes';
import { isValidEndpoint } from '../helpers/validEndpoints';
import { responseQueue } from '../helpers/testSetup';

/**
 * Standard API response structure matching backend renderer
 */
interface ApiResponse<T = any> {
    status: 'success' | 'error';
    message?: string;
    data?: T;
}

/**
 * Type-safe response helpers matching backend API format
 */
const successResponse = <T = any>(message: string, data?: T): Response => 
    HttpResponse.json({ status: 'success', message, data } as ApiResponse<T>);

const errorResponse = (message: string, status = 400): Response => 
    HttpResponse.json({ status: 'error', message } as ApiResponse, { status });

/**
 * Helper to check response queue first, then fall back to default
 */
const checkQueue = (method: string, path: string, defaultResponse: () => Response): Response => {
    // Validate endpoint exists in backend
    if (!isValidEndpoint(path)) {
        console.warn(`[MSW] Unhandled endpoint: ${method} ${path} - not in validEndpoints.ts`);
    }
    
    // Check if there's a queued response
    const queued = responseQueue.dequeue(method, path);
    if (queued) {
        if (queued.status === 'error') {
            return errorResponse(queued.message || 'Error', queued.statusCode);
        }
        return successResponse(queued.message || 'Success', queued.data);
    }
    
    // Use default response
    return defaultResponse();
};

/**
 * Default MSW handlers for common API endpoints
 * These can be overridden in individual tests using server.use()
 */
export const handlers = [
    // ==================== Auth & Session ====================
    
    // Login endpoint (if using local auth)
    http.post('/auth/login', async ({ request }) => {
        const body = await request.json() as { username?: string; password?: string };
        const path = '/auth/login';
        
        return checkQueue('POST', path, () => {
            if (!body.username || !body.password) {
                return errorResponse('Username and password are required', 400);
            }
            
            // Mock successful login
            if (body.username === 'testuser' && body.password === 'password123') {
                return successResponse('Login successful', {
                    user: { id: 1, username: 'testuser', email: 'test@example.com' }
                });
            }
            
            return errorResponse('Invalid credentials', 401);
        });
    }),
    
    // Logout endpoint
    http.post('/auth/logout', () => {
        return checkQueue('POST', '/auth/logout', () => 
            successResponse('Logged out successfully')
        );
    }),
    
    // ==================== Event API ====================
    
    // Get event details
    http.get('/api/event/:id', ({ params }) => {
        const { id } = params;
        const path = `/api/event/${id}`;
        
        return checkQueue('GET', path, () => 
            successResponse('Event retrieved', {
                id,
                title: `Test Event ${id}`,
                description: 'Test event description',
                startDate: '2025-01-01',
                endDate: '2025-01-02',
            })
        );
    }),
    
    // Register for event
    http.post('/api/event/:id/register', async ({ request, params }) => {
        const { id } = params;
        const path = `/api/event/${id}/register`;
        const body = await request.json();
        
        return checkQueue('POST', path, () => 
            successResponse(`Successfully registered for event ${id}`, body)
        );
    }),
    
    // Cancel registration
    http.post('/api/event/:id/register/delete', ({ params }) => {
        const { id } = params;
        return successResponse(`Registration cancelled for event ${id}`);
    }),
    
    // Update event settings
    http.post('/api/event/:id/update', async ({ request, params }) => {
        const { id } = params;
        const body = await request.json();
        return successResponse(`Event ${id} updated`, body);
    }),
    
    // ==================== Activity API ====================
    
    // Get activity details
    http.get('/api/activity/:id', ({ params }) => {
        const { id } = params;
        return successResponse('Activity retrieved', {
            id,
            title: `Test Activity ${id}`,
            description: 'Test activity description',
        });
    }),
    
    // Take assignment
    http.post('/api/activity/:planId/assignments/:slotId/take', async ({ request, params }) => {
        const { planId, slotId } = params;
        const body = await request.json();
        return successResponse(`Assignment taken`, { planId, slotId, ...body });
    }),
    
    // Leave assignment
    http.delete('/api/activity/:planId/assignments/:slotId/leave', ({ params }) => {
        const { planId, slotId } = params;
        return successResponse(`Assignment left`, { planId, slotId });
    }),
    
    // Update slot
    http.post('/api/activity/:planId/slots/:slotId/update', async ({ request, params }) => {
        const { planId, slotId } = params;
        const body = await request.json();
        return successResponse(`Slot updated`, { planId, slotId, ...body });
    }),
    
    // Get recommendations
    http.get('/api/activity/:planId/recommendations', ({ params }) => {
        const { planId } = params;
        return successResponse('Recommendations retrieved', {
            planId,
            recommendations: [],
            warnings: [],
        });
    }),
    
    // Apply recommendations
    http.post('/api/activity/:planId/recommendations/apply', async ({ request, params }) => {
        const { planId } = params;
        const body = await request.json();
        return successResponse('Recommendations applied', { planId, ...body });
    }),

    // Create activity text field
    http.post('/api/activity/:planId/text-field', async ({params, request}) => {
        const {planId} = params;
        const path = `/api/activity/${planId}/text-field`;
        const body = await request.json();

        return checkQueue('POST', path, () => successResponse('Text field saved', {id: 'tf-generated', ...body}));
    }),

    // Update activity text field
    http.post('/api/activity/:planId/text-field/:textFieldId', async ({params, request}) => {
        const {planId, textFieldId} = params;
        const path = `/api/activity/${planId}/text-field/${textFieldId}`;
        const body = await request.json();

        return checkQueue('POST', path, () => successResponse('Text field updated', {id: textFieldId, ...body}));
    }),

    // Delete activity text field
    http.post('/api/activity/:planId/text-field/:textFieldId/delete', ({ params }) => {
        const {planId, textFieldId} = params;
        const path = `/api/activity/${planId}/text-field/${textFieldId}/delete`;

        return checkQueue('POST', path, () => successResponse('Text field deleted'));
    }),
    
    // ==================== User API ====================
    
    // Search users
    http.get('/api/users/search', ({ request }) => {
        const url = new URL(request.url);
        const query = url.searchParams.get('q') || '';
        
        return successResponse('Users found', {
            users: [
                { id: 1, username: 'user1', email: 'user1@example.com' },
                { id: 2, username: 'user2', email: 'user2@example.com' },
            ].filter(u => u.username.includes(query) || u.email.includes(query))
        });
    }),
    
    // ==================== Packing API ====================
    
    // Get packing list
    http.get('/api/packing/:id', ({ params }) => {
        const { id } = params;
        return successResponse('Packing list retrieved', {
            id,
            title: `Test Packing List ${id}`,
            items: [],
        });
    }),
    
    // ==================== Drivers API ====================
    
    // Get drivers list
    http.get('/api/drivers/:id', ({ params }) => {
        const { id } = params;
        return successResponse('Drivers list retrieved', {
            id,
            title: `Test Drivers List ${id}`,
            drivers: [],
        });
    }),
    
    // ==================== Generic Error Handler ====================
    
    // Catch-all for unhandled routes - will error in tests with onUnhandledRequest: 'error'
];
