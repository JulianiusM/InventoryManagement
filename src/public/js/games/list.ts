/**
 * Game titles list page - Bulk selection and filtering functionality
 */

import {setCurrentNavLocation} from '../core/navigation';

/**
 * Update bulk selection UI
 */
function updateBulkSelection(): void {
    const checkboxes = document.querySelectorAll('.bulk-select:checked');
    const count = checkboxes.length;
    const bar = document.getElementById('bulkActionsBar');
    const countSpan = document.getElementById('selectedCount');
    
    if (count > 0) {
        bar?.classList.remove('d-none');
        if (countSpan) countSpan.textContent = String(count);
    } else {
        bar?.classList.add('d-none');
    }
}

/**
 * Toggle all checkboxes
 */
function toggleAllCheckboxes(checked: boolean): void {
    document.querySelectorAll('.bulk-select').forEach(cb => {
        (cb as HTMLInputElement).checked = checked;
    });
    updateBulkSelection();
}

/**
 * Initialize bulk selection
 */
function initBulkSelection(): void {
    // Add event listener to all bulk-select checkboxes
    document.querySelectorAll('.bulk-select').forEach(cb => {
        cb.addEventListener('change', updateBulkSelection);
    });
    
    // Add event listener to select-all checkbox
    const selectAllCheckbox = document.getElementById('selectAllCheckbox') as HTMLInputElement | null;
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', function() {
            toggleAllCheckboxes(this.checked);
        });
    }
}

/**
 * Initialize game titles list page
 */
export function init(): void {
    setCurrentNavLocation();
    initBulkSelection();
}

// Expose functions to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
(window as any).updateBulkSelection = updateBulkSelection;
(window as any).toggleAllCheckboxes = toggleAllCheckboxes;
