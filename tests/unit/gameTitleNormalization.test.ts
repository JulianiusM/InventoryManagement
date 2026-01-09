/**
 * Game Title Normalization Tests
 * 
 * Tests for the game title normalization function that merges games with
 * similar names (e.g., "The Sims 4" and "The Sims™ 4" are the same game)
 */

import {normalizeGameTitle, extractEdition} from '../../src/modules/games/GameNameUtils';

describe('normalizeGameTitle', () => {
    describe('trademark and copyright symbols', () => {
        test.each([
            ['The Sims™ 4', 'the sims 4'],
            ['The Sims 4', 'the sims 4'],
            ['The Sims® 4', 'the sims 4'],
            ['Game© Name', 'game name'],
            ['Product™ Plus®', 'product plus'],
        ])('removes trademark symbols from "%s"', (input, expected) => {
            expect(normalizeGameTitle(input)).toBe(expected);
        });
    });

    describe('punctuation normalization', () => {
        test.each([
            ['Game: Title', 'game title'],
            ['Game - Title', 'game title'],
            ['Game — Title', 'game title'],
            ['Game–Title', 'game title'],
            ['Game.Title', 'gametitle'],
            ["Game's Name", 'games name'],
            ['Rock & Roll', 'rock and roll'],
        ])('normalizes punctuation in "%s"', (input, expected) => {
            expect(normalizeGameTitle(input)).toBe(expected);
        });
    });

    describe('whitespace handling', () => {
        test.each([
            ['  Game  Name  ', 'game name'],
            ['Game   Name', 'game name'],
            ['Game\t\nName', 'game name'],
        ])('normalizes whitespace in "%s"', (input, expected) => {
            expect(normalizeGameTitle(input)).toBe(expected);
        });
    });

    describe('matching games that should be merged', () => {
        test('The Sims 4 variations match', () => {
            const variations = [
                'The Sims 4',
                'The Sims™ 4',
                'The Sims® 4',
                'THE SIMS 4',
                'the sims 4',
            ];
            const normalized = variations.map(normalizeGameTitle);
            // All should be the same
            expect(new Set(normalized).size).toBe(1);
        });

        test('Game with apostrophe variations match', () => {
            const variations = [
                "Assassin's Creed",
                'Assassins Creed',
                "Assassin's Creed",
            ];
            const normalized = variations.map(normalizeGameTitle);
            expect(new Set(normalized).size).toBe(1);
        });
    });
});

describe('extractEdition', () => {
    describe('extracts common editions', () => {
        test.each([
            ['Game - Game of the Year Edition', 'Game', 'Game of the Year Edition'],
            ['Game GOTY', 'Game', 'Game of the Year Edition'],
            ['Game GOTY Edition', 'Game', 'Game of the Year Edition'],
            ['Game - Deluxe Edition', 'Game', 'Deluxe Edition'],
            ['Game - Ultimate Edition', 'Game', 'Ultimate Edition'],
            ['Game - Special Edition', 'Game', 'Special Edition'],
            ['Game - Premium Edition', 'Game', 'Premium Edition'],
            ['Game - Complete Edition', 'Game', 'Complete Edition'],
        ])('extracts edition from "%s"', (input, expectedBase, expectedEdition) => {
            const result = extractEdition(input);
            expect(result.baseName).toBe(expectedBase);
            expect(result.edition).toBe(expectedEdition);
        });
    });

    describe('handles games without editions', () => {
        test('returns Standard Edition for games without explicit edition', () => {
            const result = extractEdition('Hades');
            expect(result.baseName).toBe('Hades');
            expect(result.edition).toBe('Standard Edition');
        });
    });

    describe('matching different editions of same game', () => {
        test('The Sims 4 and The Sims 4 Premium Edition have same base name', () => {
            const standard = extractEdition('The Sims 4');
            const premium = extractEdition('The Sims 4 - Premium Edition');
            
            expect(normalizeGameTitle(standard.baseName)).toBe(normalizeGameTitle(premium.baseName));
            expect(standard.edition).toBe('Standard Edition');
            expect(premium.edition).toBe('Premium Edition');
        });
    });
});
