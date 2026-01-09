/**
 * Locations list page - Search and Select2 initialization
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize search functionality
 */
function initSearch(): void {
    const searchInput = document.getElementById('locationSearch') as HTMLInputElement | null;
    const clearBtn = document.querySelector('[data-search-clear]');
    
    // Clear button handler
    if (clearBtn && searchInput) {
        clearBtn.addEventListener('click', function() {
            searchInput.value = '';
            searchInput.focus();
        });
    }
}

/**
 * Initialize Select2 dropdowns
 */
function initSelect2(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) {
        console.warn('Select2 not loaded');
        return;
    }

    // Initialize Select2 for parent location dropdown in modal
    $('.select2-parent-location').select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#addLocationModal'),
        placeholder: 'None (top-level)',
        allowClear: true,
        width: '100%'
    });
}

/**
 * Initialize locations list page
 */
export function init(): void {
    setCurrentNavLocation();
    initSearch();
    initSelect2();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
