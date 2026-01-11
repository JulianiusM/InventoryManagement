/**
 * Shared helpers for games controllers
 */

// Re-export MIN_VALID_DESCRIPTION_LENGTH from MetadataFetcher for backward compatibility
// The canonical definition is now in MetadataFetcher (single source of truth)
export {MIN_VALID_DESCRIPTION_LENGTH} from '../../modules/games/sync/MetadataFetcher';

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
