/**
 * Unit tests for HTML Utilities
 * Tests HTML stripping and text truncation
 */

import {stripHtml, truncateText} from '../../src/modules/lib/htmlUtils';

describe('htmlUtils', () => {
    describe('stripHtml', () => {
        test('removes simple HTML tags', () => {
            expect(stripHtml('<p>Hello World</p>')).toBe('Hello World');
        });

        test('removes nested HTML tags', () => {
            expect(stripHtml('<div><p>Hello <strong>World</strong></p></div>')).toBe('Hello World');
        });

        test('converts br tags to newlines', () => {
            const result = stripHtml('Line 1<br>Line 2');
            expect(result).toContain('Line 1');
            expect(result).toContain('Line 2');
        });

        test('decodes HTML entities', () => {
            expect(stripHtml('&amp; &lt; &gt; &quot; &#39;')).toBe("& < > \" '");
        });

        test('decodes nbsp entities', () => {
            expect(stripHtml('Hello&nbsp;World')).toBe('Hello World');
        });

        test('handles empty string', () => {
            expect(stripHtml('')).toBe('');
        });

        test('handles string with no HTML', () => {
            expect(stripHtml('Just plain text')).toBe('Just plain text');
        });

        test('normalizes whitespace', () => {
            expect(stripHtml('Hello   World')).toBe('Hello World');
        });

        test('handles complex HTML content', () => {
            const html = '<h1>Title</h1><p>First paragraph with <strong>bold</strong> text.</p><br><p>Second paragraph.</p>';
            const result = stripHtml(html);
            expect(result).toContain('Title');
            expect(result).toContain('First paragraph');
            expect(result).toContain('bold');
            expect(result).not.toContain('<');
            expect(result).not.toContain('>');
        });
    });

    describe('truncateText', () => {
        test('returns original text if shorter than max length', () => {
            expect(truncateText('Hello', 10)).toBe('Hello');
        });

        test('truncates and adds ellipsis', () => {
            expect(truncateText('Hello World', 8)).toBe('Hello...');
        });

        test('handles exact length', () => {
            expect(truncateText('Hello', 5)).toBe('Hello');
        });

        test('handles empty string', () => {
            expect(truncateText('', 10)).toBe('');
        });
    });
});
