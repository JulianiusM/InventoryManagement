/**
 * Game title detail page - Select2 initialization and merge functionality
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize Select2 dropdowns
 */
function initSelect2(): void {
    if (typeof $ === 'undefined' || !$.fn.select2) {
        console.warn('Select2 not loaded');
        return;
    }

    // Initialize Select2 for merge dropdown
    $(document).ready(function() {
        $('#mergeTargetSelect').select2({
            theme: 'bootstrap-5',
            placeholder: 'Search games...',
            allowClear: true,
            dropdownParent: $('#mergeModal')
        });
        
        // Platform dropdown in Add Release modal
        $('#addReleaseModal select[name="platform"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Select platform...',
            dropdownParent: $('#addReleaseModal')
        });
        
        // Target and Platform dropdowns in Merge as Release modal
        $('#mergeAsReleaseModal select[name="targetId"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Search target game...',
            allowClear: true,
            dropdownParent: $('#mergeAsReleaseModal')
        });
        
        $('#mergeAsReleaseModal select[name="platform"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Select platform...',
            dropdownParent: $('#mergeAsReleaseModal')
        });
    });
}

/**
 * Initialize game title detail page
 */
export function init(): void {
    setCurrentNavLocation();
    initSelect2();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
