/**
 * Item detail page - Barcode mapping functionality
 */

import {setCurrentNavLocation} from '../core/navigation';
import {post} from '../core/http';
import {showInlineAlert} from '../shared/alerts';

/**
 * Initialize barcode mapping form
 */
function initBarcodeForm(): void {
    const form = document.getElementById('barcodeForm') as HTMLFormElement | null;
    const input = document.getElementById('barcodeInput') as HTMLInputElement | null;
    const msgDiv = document.getElementById('barcodeMsg') as HTMLElement | null;

    if (!form || !input || !msgDiv) return;

    // Get item ID from URL
    const pathParts = window.location.pathname.split('/');
    const itemId = pathParts[pathParts.length - 1];

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = input.value.trim();
        if (!code) {
            showMessage(msgDiv, 'Please enter a barcode', 'warning');
            return;
        }

        try {
            const response = await post(`/api/items/${itemId}/barcode`, {
                code,
                symbology: 'UNKNOWN',
            });

            if (response.status === 'success') {
                showMessage(msgDiv, response.message || 'Barcode mapped successfully', 'success');
                input.value = '';
                // Reload page to show updated barcode list
                setTimeout(() => window.location.reload(), 1000);
            } else {
                showMessage(msgDiv, response.message || 'Failed to map barcode', 'danger');
            }
        } catch (err) {
            showMessage(msgDiv, 'Error mapping barcode', 'danger');
        }
    });
}

/**
 * Show message in element
 */
function showMessage(el: HTMLElement, message: string, type: 'success' | 'danger' | 'warning'): void {
    el.innerHTML = `<div class="alert alert-${type} mb-0">${message}</div>`;
}

/**
 * Initialize item detail page
 */
export function init(): void {
    setCurrentNavLocation();
    initBarcodeForm();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
