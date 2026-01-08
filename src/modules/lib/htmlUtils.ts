/**
 * HTML Utilities
 * Provides functions for handling HTML content
 */

/**
 * Decode HTML entities using a safe approach
 * Decodes entities in the correct order to prevent double-decoding issues
 * @param text Text with HTML entities
 * @returns Text with entities decoded
 */
function decodeHtmlEntities(text: string): string {
    // Decode numeric entities first
    let result = text.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    
    // Decode named entities - order matters, decode &amp; last to avoid double-decoding
    result = result.replace(/&nbsp;/gi, ' ');
    result = result.replace(/&lt;/gi, '<');
    result = result.replace(/&gt;/gi, '>');
    result = result.replace(/&quot;/gi, '"');
    result = result.replace(/&apos;/gi, "'");
    result = result.replace(/&#39;/gi, "'");
    // &amp; must be decoded last to prevent issues like &amp;lt; becoming <
    result = result.replace(/&amp;/gi, '&');
    
    return result;
}

/**
 * Remove all HTML tags using iterative approach
 * Continues removing until no tags remain (handles nested/malformed HTML)
 * @param html HTML string to strip
 * @returns Text without HTML tags
 */
function removeAllTags(html: string): string {
    let result = html;
    let previous = '';
    
    // Replace block-level tags with newlines
    result = result.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n');
    result = result.replace(/<(br|hr)\s*\/?>/gi, '\n');
    
    // Iteratively remove all HTML tags until none remain
    // This handles nested tags and malformed HTML safely
    while (result !== previous) {
        previous = result;
        result = result.replace(/<[^>]*>/g, '');
    }
    
    return result;
}

/**
 * Strip HTML tags from a string (safe implementation)
 * @param html HTML string to strip
 * @returns Plain text string
 */
export function stripHtml(html: string): string {
    if (!html) return '';
    
    // Step 1: Remove all HTML tags
    let result = removeAllTags(html);
    
    // Step 2: Decode HTML entities (after tags are removed)
    result = decodeHtmlEntities(result);
    
    // Step 3: Normalize whitespace
    result = result
        .replace(/\s+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\s+\n/g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
    
    return result;
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 * @param text Text to truncate
 * @param maxLength Maximum length
 * @returns Truncated text
 */
export function truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}
