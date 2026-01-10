/**
 * Game copies list page - Select2 filter initialization
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize Select2 for filters
 */
function initFilters(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) {
        console.warn('Select2 not loaded');
        return;
    }

    $(document).ready(function() {
        $('#locationFilter').select2({
            theme: 'bootstrap-5',
            placeholder: 'All locations',
            allowClear: true
        });
    });
}

/**
 * Initialize game copies list page
 */
export function init(): void {
    setCurrentNavLocation();
    initFilters();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
