/**
 * Location detail page - Delete confirmation
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const bootstrap: any;

/**
 * Initialize delete confirmation
 */
function initDeleteConfirmation(): void {
    const deleteBtn = document.getElementById('deleteLocationBtn');
    const deleteModalEl = document.getElementById('deleteModal');
    const deleteForm = document.getElementById('deleteForm') as HTMLFormElement | null;
    const deleteLocationName = document.getElementById('deleteLocationName');
    
    if (deleteBtn && deleteModalEl && deleteForm && deleteLocationName) {
        const deleteModal = new bootstrap.Modal(deleteModalEl);
        
        deleteBtn.addEventListener('click', function(this: HTMLElement) {
            const locationId = this.dataset.locationId;
            const locationName = this.dataset.locationName;
            deleteLocationName.textContent = locationName || '';
            deleteForm.action = '/locations/' + locationId + '/delete';
            deleteModal.show();
        });
    }
}

/**
 * Initialize location detail page
 */
export function init(): void {
    setCurrentNavLocation();
    initDeleteConfirmation();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
