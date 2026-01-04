/**
 * Enhanced search functionality with debouncing and better UX
 */

class EnhancedSearch {
    constructor(options) {
        this.searchInput = document.querySelector(options.searchInput);
        this.searchableItems = options.searchableItems || [];
        this.searchableSelector = options.searchableSelector;
        this.noResultsElement = document.querySelector(options.noResultsElement);
        this.debounceTime = options.debounceTime || 300;
        this.onSearch = options.onSearch || this.defaultSearch.bind(this);
        this.debounceTimer = null;
        
        if (this.searchInput) {
            this.init();
        }
    }
    
    init() {
        // Load searchable items if selector provided
        if (this.searchableSelector) {
            this.searchableItems = Array.from(document.querySelectorAll(this.searchableSelector));
        }
        
        // Add search input event with debouncing
        this.searchInput.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.onSearch(e.target.value.toLowerCase().trim());
            }, this.debounceTime);
        });
        
        // Add clear button functionality
        const clearBtn = this.searchInput.parentElement?.querySelector('[data-search-clear]');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.searchInput.value = '';
                this.searchInput.dispatchEvent(new Event('input'));
                this.searchInput.focus();
            });
        }
        
        // Show search indicator while typing
        this.searchInput.addEventListener('input', () => {
            this.searchInput.classList.add('searching');
            clearTimeout(this.indicatorTimer);
            this.indicatorTimer = setTimeout(() => {
                this.searchInput.classList.remove('searching');
            }, this.debounceTime + 100);
        });
    }
    
    defaultSearch(query) {
        let visibleCount = 0;
        
        this.searchableItems.forEach(item => {
            const searchText = item.dataset.searchText || item.textContent.toLowerCase();
            const matches = !query || searchText.includes(query);
            
            if (matches) {
                item.classList.remove('d-none');
                item.style.display = '';
                visibleCount++;
            } else {
                item.classList.add('d-none');
                item.style.display = 'none';
            }
        });
        
        // Show/hide no results message
        if (this.noResultsElement) {
            if (visibleCount === 0 && query) {
                this.noResultsElement.classList.remove('d-none');
            } else {
                this.noResultsElement.classList.add('d-none');
            }
        }
        
        return visibleCount;
    }
    
    destroy() {
        clearTimeout(this.debounceTimer);
        clearTimeout(this.indicatorTimer);
    }
}

// Make available globally
window.EnhancedSearch = EnhancedSearch;
