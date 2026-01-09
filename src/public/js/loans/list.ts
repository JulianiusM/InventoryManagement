/**
 * Loans list page - Return loan functionality
 */

import {setCurrentNavLocation} from '../core/navigation';
import {post} from '../core/http';
import {showInlineAlert} from '../shared/alerts';

declare const $: any;

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
 * Initialize Select2 dropdowns
 */
function initSelect2(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) {
        console.warn('Select2 not loaded');
        return;
    }

    $('.select2-item').select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#newLoanModal'),
        placeholder: 'Select an item',
        width: '100%'
    });
}

/**
 * Initialize return modal handling
 */
function initReturnModal(): void {
    const returnModalBtns = document.querySelectorAll('.loan-return-modal');
    const returnForm = document.getElementById('returnLoanForm') as HTMLFormElement | null;
    const returnItemName = document.getElementById('returnItemName');
    
    returnModalBtns.forEach(function(btn) {
        btn.addEventListener('click', function(this: HTMLElement) {
            const loanId = this.dataset.loanId;
            const itemName = this.dataset.itemName;
            if (returnForm) returnForm.action = '/api/loans/' + loanId + '/return';
            if (returnItemName) returnItemName.textContent = itemName || '';
        });
    });
}

/**
 * Initialize loans list page
 */
export function init(): void {
    setCurrentNavLocation();
    initReturnButtons();
    initSelect2();
    initReturnModal();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
