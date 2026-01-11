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
import settings from '../settings';

export function truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
}

// Threshold for finding sentence boundary (80% of max length)
const SENTENCE_BOUNDARY_THRESHOLD = 0.8;

/**
 * Normalize and clean a game description
 * This function should be used in the shared sync pipeline to ensure
 * all descriptions are properly cleaned regardless of source (connector or metadata provider)
 * 
 * Tasks:
 * - Strip HTML tags and decode entities
 * - Remove excessive whitespace and newlines
 * - Truncate to max length
 * - Handle empty/invalid descriptions
 * 
 * @param description Raw description from any source
 * @param maxLength Maximum length (defaults to configured value)
 * @returns Cleaned description or undefined if empty/invalid
 */
export function normalizeDescription(description: string | undefined | null, maxLength = settings.value.maxDescriptionLength): string | undefined {
    if (!description) return undefined;
    
    // Step 1: Strip HTML and decode entities
    let cleaned = stripHtml(description);
    
    // Step 2: Remove any remaining problematic characters
    // Remove zero-width characters and other invisible characters
    cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, '');
    
    // Step 3: Normalize quotes and apostrophes
    cleaned = cleaned
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'");
    
    // Step 4: Clean up excessive punctuation
    cleaned = cleaned.replace(/\.{4,}/g, '...');
    cleaned = cleaned.replace(/!{2,}/g, '!');
    cleaned = cleaned.replace(/\?{2,}/g, '?');
    
    // Step 5: Normalize whitespace (collapse multiple spaces, trim newlines)
    cleaned = cleaned
        .replace(/[ \t]+/g, ' ')         // Collapse horizontal whitespace
        .replace(/\n\s*\n\s*\n+/g, '\n\n') // Max 2 consecutive newlines
        .trim();
    
    // Step 6: Truncate if too long (at sentence boundary if possible)
    if (cleaned.length > maxLength) {
        // Try to truncate at a sentence boundary
        const truncated = cleaned.slice(0, maxLength - 3);
        const lastSentence = truncated.lastIndexOf('. ');
        if (lastSentence > maxLength * SENTENCE_BOUNDARY_THRESHOLD) {
            // Found a good sentence boundary in the last 20%
            cleaned = truncated.slice(0, lastSentence + 1);
        } else {
            // No good sentence boundary, just add ellipsis
            cleaned = truncated + '...';
        }
    }
    
    // Step 7: Return undefined if result is empty or too short to be useful
    if (cleaned.length < 10) return undefined;
    
    return cleaned;
}
