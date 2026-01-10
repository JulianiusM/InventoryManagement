/**
 * Game platforms page - Select2 and interactions
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize Select2 for platform merge modal
 */
function initSelect2(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) {
        console.warn('Select2 not available');
        return;
    }
    
    // Target platform dropdown in merge modals
    $('select[name="targetId"]').each(function() {
        const modal = $(this).closest('.modal');
        $(this).select2({
            theme: 'bootstrap-5',
            placeholder: 'Select target platform...',
            dropdownParent: modal,
            width: '100%',
        });
    });
}

/**
 * Initialize platforms page
 */
export function init(): void {
    setCurrentNavLocation();
    initSelect2();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
