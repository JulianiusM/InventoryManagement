/**
 * Items list page - Search and Select2 initialization
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize search functionality
 */
function initSearch(): void {
    const searchInput = document.getElementById('itemSearch') as HTMLInputElement | null;
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

    // Initialize Select2 for location dropdown in modal
    $('.select2-location').select2({
        theme: 'bootstrap-5',
        dropdownParent: $('#addItemModal'),
        placeholder: 'Select a location',
        allowClear: true,
        width: '100%'
    });
    
    // Initialize Select2 for filter location dropdown
    $('.select2-filter-location').select2({
        theme: 'bootstrap-5',
        placeholder: 'All locations',
        allowClear: true,
        width: '100%'
    });
}

/**
 * Initialize items list page
 */
export function init(): void {
    setCurrentNavLocation();
    initSearch();
    initSelect2();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
