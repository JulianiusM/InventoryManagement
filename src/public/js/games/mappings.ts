/**
 * Game mappings page - Select2 for game title selection
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize Select2 for game title dropdown
 */
function initSelect2(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) {
        console.warn('Select2 not available');
        return;
    }
    
    // Game title dropdown in each mapping row
    $('select[name="gameTitleId"]').select2({
        theme: 'bootstrap-5',
        placeholder: 'Select existing...',
        allowClear: true,
        width: '200px',
    });
}

/**
 * Initialize mappings page
 */
export function init(): void {
    setCurrentNavLocation();
    initSelect2();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
