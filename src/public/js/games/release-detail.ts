/**
 * Game release detail page - Copy type toggle and Select2 initialization
 */

import {setCurrentNavLocation} from '../core/navigation';

declare const $: any;

/**
 * Initialize copy type toggle
 */
function initCopyTypeToggle(): void {
    const copyTypeSelect = document.getElementById('copyTypeSelect') as HTMLSelectElement | null;
    if (copyTypeSelect) {
        copyTypeSelect.addEventListener('change', function() {
            const isDigital = this.value === 'digital_license';
            document.getElementById('physicalFields')?.classList.toggle('d-none', isDigital);
            document.getElementById('digitalFields')?.classList.toggle('d-none', !isDigital);
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

    $(document).ready(function() {
        $('select[name="targetId"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Search releases...',
            allowClear: true,
            dropdownParent: $('#mergeReleaseModal'),
            width: '100%',
        });
        $('select[name="locationId"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Select location...',
            allowClear: true,
            dropdownParent: $('#addCopyModal'),
            width: '100%',
        });
        $('select[name="externalAccountId"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Select account...',
            allowClear: true,
            dropdownParent: $('#addCopyModal'),
            width: '100%',
        });
        $('select[name="condition"]').select2({
            theme: 'bootstrap-5',
            placeholder: 'Select condition...',
            allowClear: true,
            dropdownParent: $('#addCopyModal'),
            width: '100%',
        });
        // Copy type dropdown
        $('#copyTypeSelect').select2({
            theme: 'bootstrap-5',
            placeholder: 'Select type...',
            dropdownParent: $('#addCopyModal'),
            width: '100%',
        });
    });
}

/**
 * Initialize game release detail page
 */
export function init(): void {
    setCurrentNavLocation();
    initCopyTypeToggle();
    initSelect2();
}

// Expose to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
