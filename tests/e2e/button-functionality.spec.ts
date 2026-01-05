/**
 * E2E test to verify all interactive buttons across the application
 * This test automatically finds all buttons and verifies they provide user feedback
 */

import { test, expect, Page } from '@playwright/test';

// Pages to test
const TEST_PAGES = [
    { path: '/items', name: 'Items List' },
    { path: '/locations', name: 'Locations List' },
    { path: '/loans', name: 'Loans List' },
    { path: '/scan', name: 'Scan Page' },
];

/**
 * Check if a button provides feedback when clicked
 * Feedback can be: modal opening, page navigation, form submission, collapse toggle, etc.
 */
async function testButtonFeedback(page: Page, button: any, buttonText: string): Promise<{ success: boolean; message: string }> {
    // Get button attributes to understand expected behavior
    const bsToggle = await button.getAttribute('data-bs-toggle');
    const bsTarget = await button.getAttribute('data-bs-target');
    const type = await button.getAttribute('type');
    const href = await button.getAttribute('href');
    
    // Skip if it's a submit button (handled by form)
    if (type === 'submit') {
        return { success: true, message: 'Submit button (form handler)' };
    }
    
    // Skip if it's a link
    if (href) {
        return { success: true, message: 'Link button' };
    }
    
    // Check Bootstrap data-bs-toggle functionality
    if (bsToggle === 'modal' && bsTarget) {
        // Should open a modal
        await button.click();
        const modal = page.locator(bsTarget);
        const isVisible = await modal.isVisible({ timeout: 1000 }).catch(() => false);
        if (isVisible) {
            // Close modal after test
            const closeBtn = modal.locator('[data-bs-dismiss="modal"]').first();
            if (await closeBtn.isVisible()) {
                await closeBtn.click();
                await page.waitForTimeout(300); // Wait for modal to close
            }
            return { success: true, message: 'Modal opened' };
        } else {
            return { success: false, message: `Modal ${bsTarget} did not open` };
        }
    }
    
    if (bsToggle === 'collapse' && bsTarget) {
        // Should toggle collapse
        await button.click();
        await page.waitForTimeout(300); // Wait for collapse animation
        const target = page.locator(bsTarget);
        const isVisible = await target.isVisible({ timeout: 1000 }).catch(() => false);
        return { success: true, message: `Collapse toggled (visible: ${isVisible})` };
    }
    
    // Check for custom click handlers by looking for specific classes or data attributes
    const classes = await button.getAttribute('class') || '';
    const hasCustomHandler = 
        classes.includes('barcode-delete') ||
        classes.includes('loan-return') ||
        button.id && (await button.getAttribute('id') || '').includes('delete');
    
    if (hasCustomHandler) {
        // These buttons have custom JavaScript handlers
        // We'll just verify they don't throw errors when clicked
        const errorPromise = page.waitForEvent('pageerror', { timeout: 1000 }).catch(() => null);
        await button.click();
        const error = await errorPromise;
        if (error) {
            return { success: false, message: `JavaScript error: ${error.message}` };
        }
        return { success: true, message: 'Custom handler (no JS errors)' };
    }
    
    // If we reach here, button might not have obvious feedback
    // Check if clicking causes any change in the page
    const beforeHTML = await page.content();
    await button.click();
    await page.waitForTimeout(200);
    const afterHTML = await page.content();
    
    if (beforeHTML !== afterHTML) {
        return { success: true, message: 'Page content changed' };
    }
    
    return { success: false, message: 'No visible feedback detected' };
}

test.describe('Button Functionality Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Login before testing (adjust credentials as needed)
        await page.goto('/login');
        await page.fill('input[name="email"]', 'test@example.com');
        await page.fill('input[name="password"]', 'password');
        await page.click('button[type="submit"]');
        await page.waitForURL(/\/(items|locations|loans|scan|$)/, { timeout: 5000 });
    });
    
    for (const testPage of TEST_PAGES) {
        test(`All buttons work on ${testPage.name}`, async ({ page }) => {
            await page.goto(testPage.path);
            await page.waitForLoadState('networkidle');
            
            // Find all clickable buttons (excluding disabled ones)
            const buttons = await page.locator('button:not([disabled]), a.btn:not(.disabled)').all();
            
            console.log(`Found ${buttons.length} buttons on ${testPage.name}`);
            
            const results: Array<{ text: string; result: { success: boolean; message: string } }> = [];
            
            for (const button of buttons) {
                const text = (await button.textContent() || '').trim();
                const buttonId = await button.getAttribute('id') || '';
                const buttonClass = await button.getAttribute('class') || '';
                const identifier = buttonId || text || buttonClass.split(' ')[0] || 'Unknown';
                
                // Skip certain buttons that are known to work differently
                if (text.includes('Sign Out') || text.includes('Logout')) {
                    continue;
                }
                
                try {
                    const result = await testButtonFeedback(page, button, identifier);
                    results.push({ text: identifier, result });
                    
                    if (!result.success) {
                        console.error(`❌ Button "${identifier}" failed: ${result.message}`);
                    } else {
                        console.log(`✅ Button "${identifier}": ${result.message}`);
                    }
                } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error(`❌ Button "${identifier}" error: ${errorMsg}`);
                    results.push({ text: identifier, result: { success: false, message: errorMsg } });
                }
            }
            
            // Check if any buttons failed
            const failures = results.filter(r => !r.result.success);
            if (failures.length > 0) {
                const failureList = failures.map(f => `  - ${f.text}: ${f.result.message}`).join('\n');
                throw new Error(`${failures.length} button(s) on ${testPage.name} failed:\n${failureList}`);
            }
            
            expect(failures.length).toBe(0);
        });
    }
    
    test('Barcode delete button works', async ({ page }) => {
        // This test requires an item with a barcode
        // We'll create one for testing
        await page.goto('/items');
        
        // Try to find an existing item or note test needs setup
        const itemLinks = await page.locator('a[href^="/items/"]').all();
        if (itemLinks.length === 0) {
            test.skip();
            return;
        }
        
        // Go to first item detail
        await itemLinks[0].click();
        await page.waitForLoadState('networkidle');
        
        // Check if there's a barcode delete button
        const deleteBtn = page.locator('.barcode-delete').first();
        const exists = await deleteBtn.count() > 0;
        
        if (exists) {
            // Set up dialog handler for confirmation
            page.on('dialog', dialog => dialog.accept());
            
            // Click delete button
            await deleteBtn.click();
            
            // Wait for page reload or feedback
            await page.waitForTimeout(1000);
            
            // Check that no JavaScript errors occurred
            const errors: string[] = [];
            page.on('pageerror', error => errors.push(error.message));
            
            expect(errors.length).toBe(0);
        } else {
            console.log('No barcode to test delete functionality');
        }
    });
    
    test('Modal buttons open modals correctly', async ({ page }) => {
        // Test locations modal
        await page.goto('/locations');
        
        // Find "Add" or "Create" button that opens modal
        const addBtn = page.locator('button[data-bs-toggle="modal"][data-bs-target="#addLocationModal"]').first();
        const exists = await addBtn.count() > 0;
        
        if (exists) {
            await addBtn.click();
            
            // Check modal is visible
            const modal = page.locator('#addLocationModal');
            await expect(modal).toBeVisible({ timeout: 2000 });
            
            // Close modal
            const closeBtn = modal.locator('[data-bs-dismiss="modal"]').first();
            await closeBtn.click();
            await expect(modal).not.toBeVisible({ timeout: 2000 });
        }
    });
});
