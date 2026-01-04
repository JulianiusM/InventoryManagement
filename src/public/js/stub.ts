/**
 * Stub module - Default initialization for pages without custom JS
 * Provides basic navigation and entity list functionality
 */

import {setCurrentNavLocation} from "./core/navigation";

/**
 * Initialize stub module
 */
export function init(): void {
    setCurrentNavLocation();
}

// Expose to global scope
if (!window.Surveyor) window.Surveyor = {};
window.Surveyor.init = init;
