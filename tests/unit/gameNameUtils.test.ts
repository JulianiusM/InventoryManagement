/**
 * Unit tests for Game Name Utilities
 * Tests fuzzy search and edition detection
 */

import {
    extractEdition,
    normalizeForSearch,
    fuzzyMatch,
    similarityScore,
    fuzzySearchGames,
} from '../../src/modules/games/GameNameUtils';

describe('GameNameUtils', () => {
    describe('extractEdition', () => {
        test('extracts GOTY edition', () => {
            const result = extractEdition('The Witcher 3 - Game of the Year Edition');
            expect(result.baseName).toBe('The Witcher 3');
            expect(result.edition).toBe('Game of the Year Edition');
        });

        test('extracts GOTY abbreviation', () => {
            const result = extractEdition('Dark Souls GOTY Edition');
            expect(result.baseName).toBe('Dark Souls');
            expect(result.edition).toBe('Game of the Year Edition');
        });

        test('extracts Deluxe Edition', () => {
            const result = extractEdition('Horizon Zero Dawn - Deluxe Edition');
            expect(result.baseName).toBe('Horizon Zero Dawn');
            expect(result.edition).toBe('Deluxe Edition');
        });

        test('extracts Gold Edition', () => {
            const result = extractEdition('Civilization VI - Gold Edition');
            expect(result.baseName).toBe('Civilization VI');
            expect(result.edition).toBe('Gold Edition');
        });

        test('extracts Complete Edition', () => {
            const result = extractEdition('Fallout 4 - Complete Edition');
            expect(result.baseName).toBe('Fallout 4');
            expect(result.edition).toBe('Complete Edition');
        });

        test('extracts Definitive Edition', () => {
            const result = extractEdition('Shadow of the Tomb Raider - Definitive Edition');
            expect(result.baseName).toBe('Shadow of the Tomb Raider');
            expect(result.edition).toBe('Definitive Edition');
        });

        test('extracts Remastered', () => {
            const result = extractEdition('Resident Evil 4 - Remastered');
            expect(result.baseName).toBe('Resident Evil 4');
            expect(result.edition).toBe('Remastered');
        });

        test('returns Standard Edition for games without edition', () => {
            const result = extractEdition('Portal 2');
            expect(result.baseName).toBe('Portal 2');
            expect(result.edition).toBe('Standard Edition');
        });

        test('handles em dash separator', () => {
            const result = extractEdition('Game — Ultimate Edition');
            expect(result.baseName).toBe('Game');
            expect(result.edition).toBe('Ultimate Edition');
        });
    });

    describe('normalizeForSearch', () => {
        test('converts to lowercase', () => {
            expect(normalizeForSearch('PORTAL')).toBe('portal');
        });

        test('removes apostrophes', () => {
            expect(normalizeForSearch("Assassin's Creed")).toBe('assassins creed');
        });

        test('removes punctuation', () => {
            expect(normalizeForSearch('Plants vs. Zombies')).toBe('plants vs zombies');
        });

        test('converts dashes to spaces', () => {
            expect(normalizeForSearch('Half-Life 2')).toBe('half life 2');
        });

        test('converts ampersand to and', () => {
            expect(normalizeForSearch('Ratchet & Clank')).toBe('ratchet and clank');
        });

        test('collapses multiple spaces', () => {
            expect(normalizeForSearch('Game:  The   Sequel')).toBe('game the sequel');
        });
    });

    describe('fuzzyMatch', () => {
        test('matches exact string', () => {
            expect(fuzzyMatch('Portal 2', 'Portal 2')).toBe(true);
        });

        test('matches substring', () => {
            expect(fuzzyMatch('Portal', 'Portal 2')).toBe(true);
        });

        test('matches with punctuation differences', () => {
            expect(fuzzyMatch('Plants vs Zombies', 'Plants vs. Zombies')).toBe(true);
        });

        test('matches with apostrophe differences', () => {
            expect(fuzzyMatch('Assassins Creed', "Assassin's Creed")).toBe(true);
        });

        test('matches case insensitive', () => {
            expect(fuzzyMatch('PORTAL', 'portal 2')).toBe(true);
        });

        test('does not match unrelated strings', () => {
            expect(fuzzyMatch('Minecraft', 'Call of Duty')).toBe(false);
        });
    });

    describe('similarityScore', () => {
        test('returns 1 for exact match', () => {
            expect(similarityScore('Portal 2', 'Portal 2')).toBe(1);
        });

        test('returns 1 for normalized exact match', () => {
            expect(similarityScore('Plants vs Zombies', 'Plants vs. Zombies')).toBe(1);
        });

        test('returns high score for similar strings', () => {
            const score = similarityScore('Portal', 'Portal 2');
            expect(score).toBeGreaterThan(0.5);
        });

        test('returns low score for different strings', () => {
            const score = similarityScore('Minecraft', 'Call of Duty');
            expect(score).toBeLessThan(0.3);
        });
    });

    describe('fuzzySearchGames', () => {
        const testGames = [
            {name: 'Portal 2'},
            {name: "Plants vs. Zombies"},
            {name: "Assassin's Creed"},
            {name: 'Half-Life 2'},
            {name: 'Ratchet & Clank'},
            {name: 'The Witcher 3'},
        ];

        test('finds exact match', () => {
            const results = fuzzySearchGames(testGames, 'Portal 2');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe('Portal 2');
        });

        test('finds match with punctuation variation', () => {
            const results = fuzzySearchGames(testGames, 'Plants vs Zombies');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe("Plants vs. Zombies");
        });

        test('finds match with apostrophe variation', () => {
            const results = fuzzySearchGames(testGames, 'Assassins Creed');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe("Assassin's Creed");
        });

        test('finds match with dash variation', () => {
            const results = fuzzySearchGames(testGames, 'Half Life');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe('Half-Life 2');
        });

        test('finds match with ampersand variation', () => {
            const results = fuzzySearchGames(testGames, 'Ratchet and Clank');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe('Ratchet & Clank');
        });

        test('returns empty array for no match', () => {
            const results = fuzzySearchGames(testGames, 'ZZZXXX999');
            expect(results.length).toBe(0);
        });

        test('returns all games for empty search', () => {
            const results = fuzzySearchGames(testGames, '');
            expect(results.length).toBe(testGames.length);
        });
    });
});
