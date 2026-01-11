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
    
    if (!returnForm) return;
    
    let currentLoanId: string | null = null;
    
    // Set up modal data when button is clicked
    returnModalBtns.forEach(function(btn) {
        btn.addEventListener('click', function(this: HTMLElement) {
            currentLoanId = this.dataset.loanId || null;
            const itemName = this.dataset.itemName;
            if (returnItemName) returnItemName.textContent = itemName || '';
        });
    });
    
    // Handle form submission via AJAX
    returnForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!currentLoanId) {
            showInlineAlert('error', 'No loan selected');
            return;
        }
        
        const formData = new FormData(returnForm);
        const conditionIn = formData.get('conditionIn') as string || '';
        
        try {
            const response = await post(`/api/loans/${currentLoanId}/return`, {
                conditionIn: conditionIn || null
            });
            
            if (response.status === 'success') {
                showInlineAlert('success', 'Loan marked as returned');
                // Close modal and reload page after short delay
                const modalEl = document.getElementById('returnModal');
                if (modalEl) {
                    const bootstrap = (window as any).bootstrap;
                    if (bootstrap && bootstrap.Modal) {
                        const modal = bootstrap.Modal.getInstance(modalEl);
                        if (modal) modal.hide();
                    }
                }
                setTimeout(() => window.location.reload(), 1000);
            } else {
                showInlineAlert('error', response.message || 'Failed to return loan');
            }
        } catch (err) {
            showInlineAlert('error', 'Error returning loan');
        }
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
