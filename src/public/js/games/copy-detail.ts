/**
 * Game copy detail page - Barcode mapping functionality
 */

import {setCurrentNavLocation} from '../core/navigation';
import {post} from '../core/http';
import {showInlineAlert} from '../shared/alerts';

/**
 * Get copy ID from URL
 */
function getCopyId(): string | null {
    const pathParts = window.location.pathname.split('/');
    // URL: /games/copies/:id
    const copiesIndex = pathParts.findIndex(p => p === 'copies');
    if (copiesIndex >= 0 && pathParts[copiesIndex + 1]) {
        return pathParts[copiesIndex + 1];
    }
    return null;
}

/**
 * Initialize barcode mapping form
 */
function initBarcodeForm(): void {
    const form = document.getElementById('barcodeForm') as HTMLFormElement | null;
    const input = document.getElementById('barcodeInput') as HTMLInputElement | null;
    const msgDiv = document.getElementById('barcodeMsg') as HTMLElement | null;

    if (!form || !input || !msgDiv) return;

    const copyId = getCopyId();
    if (!copyId) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = input.value.trim();
        if (!code) {
            showInlineAlert('info', 'Please enter a barcode', msgDiv);
            return;
        }

        try {
            const response = await post(`/api/games/copies/${encodeURIComponent(copyId)}/barcode`, {
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
 * Initialize game copy detail page
 */
export function init(): void {
    setCurrentNavLocation();
    initBarcodeForm();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
