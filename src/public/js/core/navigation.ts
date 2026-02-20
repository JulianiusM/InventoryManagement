/**
 * Core navigation utilities
 * Handles navigation state and highlighting
 */

/**
 * Set current navigation location in navbar as active
 * Highlights the current page in the navigation menu
 */
export function setCurrentNavLocation(): void {
    const path = window.location.pathname;

    // Map path prefixes to nav link selectors
    const navMappings: [string, string][] = [
        ['/items', 'a.nav-link[href="/items"]'],
        ['/locations', 'a.nav-link[href="/locations"]'],
        ['/games', 'a.nav-link[href="/games"]'],
        ['/loans', 'a.nav-link[href="/loans"]'],
        ['/scan', 'a.dropdown-item[href="/scan"]'],
        ['/wizard', 'a.dropdown-item[href="/wizard"]'],
        ['/help', 'a.dropdown-item[href="/help"]'],
        ['/users/dashboard', 'a.dropdown-item[href="/users/dashboard"]'],
        ['/users/manage-dashboard', 'a.dropdown-item[href="/users/manage-dashboard"]'],
        ['/users/login', 'a.nav-link[href="/users/login"]'],
        ['/users/register', 'a.nav-link[href="/users/register"]'],
        ['/survey', 'a.nav-link[href*="/survey"]'],
        ['/packing', 'a.nav-link[href*="/packing"]'],
        ['/activity', 'a.nav-link[href*="/activity"]'],
        ['/drivers', 'a.nav-link[href*="/drivers"]'],
    ];

    for (const [prefix, selector] of navMappings) {
        if (path === prefix || path.startsWith(prefix + '/')) {
            const link = document.querySelector(selector);
            if (link) link.classList.add('active');
            return;
        }
    }
}

/**
 * Initialize entity list filtering
 * Adds search functionality to entity lists
 * @param container Optional container element to search within (defaults to document)
 * @param options Optional configuration for selectors
 */
export function initEntityLists(
    container: HTMLElement | Document = document,
    options: {
        sectionSelector?: string;
        inputSelector?: string;
        listSelector?: string;
        countSelector?: string;
        itemSelector?: string;
    } = {}
): void {
    const {
        sectionSelector = '[data-filter="section"]',
        inputSelector = 'input[type="search"]',
        listSelector = '.js-list',
        countSelector = '.js-count',
        itemSelector = '.list-group-item'
    } = options;

    container.querySelectorAll(sectionSelector).forEach(sec => {
        const input = sec.querySelector(inputSelector) as HTMLInputElement;
        const list = sec.querySelector(listSelector);
        const count = sec.querySelector(countSelector);
        if (!input || !list || !count) return;

        const items = Array.from(list.querySelectorAll(itemSelector));
        const total = items.length;

        const update = () => {
            const q = (input.value || '').trim().toLowerCase();
            let visible = 0;
            items.forEach(li => {
                const txt = (li.getAttribute('data-search') || li.textContent || '').toLowerCase();
                const show = !q || txt.includes(q);
                li.classList.toggle('d-none', !show);
                if (show) visible++;
            });
            count.textContent = `${visible}/${total}`;
        };

        // mark section for script
        sec.setAttribute('data-filter', 'section');
        input.addEventListener('input', update);
        update();
    });
}
