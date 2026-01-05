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
            showInlineAlert('info', 'Please enter a barcode', msgDiv);
            return;
        }

        try {
            const response = await post(`/api/items/${itemId}/barcode`, {
                code,
                symbology: 'UNKNOWN',
            });

            if (response.status === 'success') {
                showInlineAlert('success', response.message || 'Barcode mapped successfully', msgDiv);
                input.value = '';
                // Reload page to show updated barcode list
                setTimeout(() => window.location.reload(), 1000);
            } else {
                showInlineAlert('error', response.message || 'Failed to map barcode', msgDiv);
            }
        } catch (err) {
            showInlineAlert('error', 'Error mapping barcode', msgDiv);
        }
    });
}

/**
 * Initialize barcode delete handlers
 */
function initBarcodeDelete(): void {
    const deleteButtons = document.querySelectorAll('.barcode-delete');
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', async function() {
            const barcodeId = this.getAttribute('data-barcode-id');
            if (!barcodeId) return;
            
            if (!confirm('Are you sure you want to remove this barcode?')) {
                return;
            }
            
            try {
                // Get item ID from URL
                const pathParts = window.location.pathname.split('/');
                const itemId = pathParts[pathParts.length - 1];
                
                const response = await fetch(`/api/items/${itemId}/barcode/${barcodeId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    // Reload page to show updated barcode list
                    window.location.reload();
                } else {
                    alert('Failed to delete barcode');
                }
            } catch (err) {
                alert('Error deleting barcode');
                console.error(err);
            }
        });
    });
}

/**
 * Initialize item detail page
 */
export function init(): void {
    setCurrentNavLocation();
    initBarcodeForm();
    initBarcodeDelete();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
