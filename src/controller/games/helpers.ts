/**
 * Shared helpers for games controllers
 */

// Minimum description length to be considered valid (shorter = placeholder)
export const MIN_VALID_DESCRIPTION_LENGTH = 50;

/**
 * Helper to parse checkbox boolean from form submissions
 * HTML checkboxes submit 'true' string when checked, undefined when unchecked
 */
export function parseCheckboxBoolean(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
}

/**
 * Helper to parse optional checkbox boolean (can be null)
 * Returns true/false if value is present, null if undefined
 */
export function parseOptionalCheckboxBoolean(value: boolean | string | undefined): boolean | null {
    if (value === undefined) return null;
    return value === true || value === 'true';
}
