/**
 * Example test demonstrating the new test setup system
 * Shows how to use setupTest, response queues, and helper utilities
 */

import { setupTest, mockApiSuccess, mockApiError, dom, mocks } from './testSetup';
import { http } from '../../../src/public/js/core/http';

describe('Example: New Test Setup System', () => {
    // Single line replaces all common beforeEach/afterEach logic
    setupTest();
    
    describe('Response Queue System', () => {
        test('mocks successful API response', async () => {
            // Queue a response - no server.use() needed!
            mockApiSuccess('GET', '/api/event/123', {
                id: '123',
                title: 'Test Event',
            });
            
            // Make request
            const result = await http('GET', '/api/event/123');
            
            // Response from queue is used
            expect(result.status).toBe('success');
            expect(result.data.title).toBe('Test Event');
        });
        
        test('mocks error API response', async () => {
            // Queue an error
            mockApiError('POST', '/api/event/123/register', 'Event is full', 400);
            
            // Make request
            await expect(
                http('POST', '/api/event/123/register', {})
            ).rejects.toThrow('Event is full');
        });
        
        test('handles multiple queued responses', async () => {
            // Queue multiple responses for same endpoint
            mockApiSuccess('GET', '/api/event/123', { title: 'Event 1' });
            mockApiSuccess('GET', '/api/event/123', { title: 'Event 2' });
            
            // First call uses first queued response
            const result1 = await http('GET', '/api/event/123');
            expect(result1.data.title).toBe('Event 1');
            
            // Second call uses second queued response
            const result2 = await http('GET', '/api/event/123');
            expect(result2.data.title).toBe('Event 2');
        });
    });
    
    describe('DOM Utilities', () => {
        test('creates form with fields', () => {
            const form = dom.createForm([
                { name: 'username', value: 'testuser' },
                { name: 'email', value: 'test@example.com', type: 'email' },
            ]);
            
            expect(form.tagName).toBe('FORM');
            expect(form.querySelectorAll('input')).toHaveLength(2);
            
            const usernameInput = form.querySelector('[name="username"]') as HTMLInputElement;
            expect(usernameInput.value).toBe('testuser');
        });
        
        test('creates assignable table', () => {
            const table = dom.createAssignableTable([
                { itemId: '1', count: 5, max: 10 },
                { itemId: '2', count: 3, max: 8 },
            ]);
            
            expect(table.dataset.assignable).toBe('true');
            expect(table.querySelectorAll('tr')).toHaveLength(2);
            
            const firstRow = table.querySelector('[data-itemid="1"]');
            expect(firstRow?.querySelector('[data-count]')?.textContent).toBe('5');
            expect(firstRow?.querySelector('[data-max]')?.textContent).toBe('10');
        });
        
        test('creates Bootstrap modal', () => {
            const modal = dom.createModal('testModal', '<p>Test content</p>');
            
            expect(modal.id).toBe('testModal');
            expect(modal.classList.contains('modal')).toBe(true);
            expect(modal.querySelector('.modal-body')?.innerHTML).toContain('Test content');
        });
    });
    
    describe('Mock Utilities', () => {
        test('sets up Bootstrap mocks', () => {
            mocks.setupBootstrap();
            
            expect(window.bootstrap).toBeDefined();
            expect(window.bootstrap.Modal).toBeDefined();
            expect(window.bootstrap.Toast).toBeDefined();
            expect(window.bootstrap.Tooltip).toBeDefined();
        });
        
        test('creates Bootstrap modal mock', () => {
            const modal = mocks.createBootstrapModal();
            
            expect(modal.show).toBeDefined();
            expect(modal.hide).toBeDefined();
            expect(modal.dispose).toBeDefined();
            
            modal.show();
            expect(modal.show).toHaveBeenCalled();
        });
    });
    
    describe('Custom Setup/Teardown', () => {
        // Example with custom beforeEach
        setupTest({
            beforeEach: () => {
                // Add custom setup
                document.body.innerHTML = '<div id="app"></div>';
            },
            afterEach: () => {
                // Add custom cleanup
                console.log('Test completed');
            },
        });
        
        test('uses custom setup', () => {
            const app = document.getElementById('app');
            expect(app).toBeTruthy();
        });
    });
    
    describe('Configuration Options', () => {
        test('clearDOM is enabled by default in parent setupTest', () => {
            // First set some content
            document.body.innerHTML = '<div>Temporary</div>';
            expect(document.body.innerHTML).toContain('Temporary');
            
            // Next test will have clean DOM due to setupTest() at top level
        });
        
        test('DOM is cleared between tests by default', () => {
            // DOM is cleared because setupTest({clearDOM: true}) at top level
            expect(document.body.innerHTML).toBe('');
        });
    });
});
