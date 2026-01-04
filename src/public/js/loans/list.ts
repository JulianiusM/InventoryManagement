/**
 * Loans list page - Return loan functionality
 */

import {setCurrentNavLocation} from '../core/navigation';
import {post} from '../core/http';
import {showInlineAlert} from '../shared/alerts';

/**
 * Initialize return loan buttons
 */
function initReturnButtons(): void {
    const buttons = document.querySelectorAll('.loan-return') as NodeListOf<HTMLButtonElement>;

    buttons.forEach((btn) => {
        btn.addEventListener('click', async () => {
            const loanId = btn.dataset.loanId;
            if (!loanId) return;

            if (!confirm('Mark this loan as returned?')) return;

            try {
                const response = await post(`/api/loans/${loanId}/return`, {});

                if (response.status === 'success') {
                    showInlineAlert('success', 'Loan marked as returned');
                    // Reload page to show updated list
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    showInlineAlert('error', response.message || 'Failed to return loan');
                }
            } catch (err) {
                showInlineAlert('error', 'Error returning loan');
            }
        });
    });
}

/**
 * Initialize loans list page
 */
export function init(): void {
    setCurrentNavLocation();
    initReturnButtons();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
