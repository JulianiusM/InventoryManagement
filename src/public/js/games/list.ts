/**
 * Game titles list page - Bulk selection, filtering, and view mode functionality
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
 * Set view mode (grid or list)
 */
function setViewMode(mode: 'grid' | 'list'): void {
    const container = document.getElementById('gamesContainer');
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    
    if (!container) return;
    
    // Store preference
    localStorage.setItem('gamesViewMode', mode);
    
    // Update container class
    container.dataset.viewMode = mode;
    
    // Update button states
    if (mode === 'grid') {
        gridBtn?.classList.add('active');
        listBtn?.classList.remove('active');
        // Grid view: show cards in smaller columns
        container.querySelectorAll('.game-card').forEach(card => {
            card.classList.remove('col-12');
            card.classList.add('col-md-6', 'col-lg-4');
        });
        // Show cover images
        container.querySelectorAll('.card-img-top-wrapper').forEach(wrapper => {
            (wrapper as HTMLElement).style.display = '';
        });
    } else {
        listBtn?.classList.add('active');
        gridBtn?.classList.remove('active');
        // List view: full width cards
        container.querySelectorAll('.game-card').forEach(card => {
            card.classList.remove('col-md-6', 'col-lg-4');
            card.classList.add('col-12');
        });
        // Hide cover images in list view for compact display
        container.querySelectorAll('.card-img-top-wrapper').forEach(wrapper => {
            (wrapper as HTMLElement).style.display = 'none';
        });
    }
}

/**
 * Initialize view mode from localStorage
 */
function initViewMode(): void {
    const savedMode = localStorage.getItem('gamesViewMode') as 'grid' | 'list' | null;
    setViewMode(savedMode || 'grid');
}

/**
 * Show loading spinner on form submission
 */
function initLoadingSpinners(): void {
    // Add loading spinner to filter form
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', () => {
            const submitBtn = filterForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Filtering...';
                (submitBtn as HTMLButtonElement).disabled = true;
            }
        });
    }
    
    // Add loading spinner to resync metadata form
    const resyncForms = document.querySelectorAll('form[action*="resync-metadata"]');
    resyncForms.forEach(form => {
        form.addEventListener('submit', () => {
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Syncing...';
                (submitBtn as HTMLButtonElement).disabled = true;
            }
        });
    });
}

/**
 * Initialize game titles list page
 */
export function init(): void {
    setCurrentNavLocation();
    initBulkSelection();
    initViewMode();
    initLoadingSpinners();
}

// Expose functions to global scope
if (!window.InventoryApp) window.InventoryApp = {};
window.InventoryApp.init = init;
(window as any).updateBulkSelection = updateBulkSelection;
(window as any).toggleAllCheckboxes = toggleAllCheckboxes;
(window as any).setViewMode = setViewMode;
