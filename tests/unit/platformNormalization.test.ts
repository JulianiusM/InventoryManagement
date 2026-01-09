/**
 * Platform Normalization Tests
 * 
 * Tests for the platform name normalization function that prevents
 * duplicate platforms from being created (e.g., PS5 and PlayStation 5 are the same)
 */

import {normalizePlatformName} from '../../src/modules/database/services/PlatformService';

describe('normalizePlatformName', () => {
    describe('PlayStation variations', () => {
        test.each([
            ['PS5', 'PlayStation 5'],
            ['ps5', 'PlayStation 5'],
            ['PlayStation 5', 'PlayStation 5'],
            ['playstation 5', 'PlayStation 5'],
            ['playstation5', 'PlayStation 5'],
            ['Sony PlayStation 5', 'PlayStation 5'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });

        test.each([
            ['PS4', 'PlayStation 4'],
            ['ps4', 'PlayStation 4'],
            ['PlayStation 4', 'PlayStation 4'],
            ['playstation 4', 'PlayStation 4'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });

        test.each([
            ['PS3', 'PlayStation 3'],
            ['PS2', 'PlayStation 2'],
            ['PS1', 'PlayStation'],
            ['PSX', 'PlayStation'],
            ['PSVita', 'PlayStation Vita'],
            ['PS Vita', 'PlayStation Vita'],
            ['PSP', 'PlayStation Portable'],
        ])('normalizes "%s" correctly', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });
    });

    describe('Xbox variations', () => {
        test.each([
            ['Xbox Series X', 'Xbox Series X|S'],
            ['Xbox Series S', 'Xbox Series X|S'],
            ['Xbox Series', 'Xbox Series X|S'],
            ['XSX', 'Xbox Series X|S'],
            ['XSS', 'Xbox Series X|S'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });

        test.each([
            ['Xbox One', 'Xbox One'],
            ['XBone', 'Xbox One'],
            ['XB1', 'Xbox One'],
            ['Xbox 360', 'Xbox 360'],
            ['X360', 'Xbox 360'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });
    });

    describe('Nintendo variations', () => {
        test.each([
            ['Switch', 'Nintendo Switch'],
            ['NS', 'Nintendo Switch'],
            ['Nintendo Switch', 'Nintendo Switch'],
            ['3DS', 'Nintendo 3DS'],
            ['New 3DS', 'Nintendo 3DS'],
            ['2DS', 'Nintendo 3DS'],
            ['NDS', 'Nintendo DS'],
            ['DS', 'Nintendo DS'],
            ['Wii U', 'Nintendo Wii U'],
            ['WiiU', 'Nintendo Wii U'],
            ['Wii', 'Nintendo Wii'],
            ['GameCube', 'Nintendo GameCube'],
            ['GC', 'Nintendo GameCube'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });
    });

    describe('PC and Mobile variations', () => {
        test.each([
            ['PC', 'PC'],
            ['Windows', 'PC'],
            ['Mac', 'PC'],
            ['macOS', 'PC'],
            ['Linux', 'PC'],
            ['Computer', 'PC'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });

        test.each([
            ['Mobile', 'Mobile'],
            ['iOS', 'Mobile'],
            ['Android', 'Mobile'],
            ['iPhone', 'Mobile'],
            ['iPad', 'Mobile'],
        ])('normalizes "%s" to "%s"', (input, expected) => {
            expect(normalizePlatformName(input)).toBe(expected);
        });
    });

    describe('edge cases', () => {
        test('preserves unknown platform names', () => {
            expect(normalizePlatformName('Atari 2600')).toBe('Atari 2600');
            expect(normalizePlatformName('Sega Genesis')).toBe('Sega Genesis');
            expect(normalizePlatformName('Custom Platform')).toBe('Custom Platform');
        });

        test('trims whitespace', () => {
            expect(normalizePlatformName('  PS5  ')).toBe('PlayStation 5');
            expect(normalizePlatformName('  Unknown Platform  ')).toBe('Unknown Platform');
        });

        test('handles empty or null-like input', () => {
            expect(normalizePlatformName('')).toBe('');
        });

        test('is case-insensitive', () => {
            expect(normalizePlatformName('PS5')).toBe('PlayStation 5');
            expect(normalizePlatformName('ps5')).toBe('PlayStation 5');
            expect(normalizePlatformName('Ps5')).toBe('PlayStation 5');
            expect(normalizePlatformName('pS5')).toBe('PlayStation 5');
        });

        test('distinguishes between PlayStation 4 and general PlayStation', () => {
            // "playstation" without a number should NOT map to PS4
            // It should remain as-is since it's ambiguous
            expect(normalizePlatformName('PlayStation')).toBe('PlayStation');
            expect(normalizePlatformName('PlayStation 4')).toBe('PlayStation 4');
        });
    });
});
