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
            // Parentheses format
            ['Game (Deluxe Edition)', 'Game', 'Deluxe Edition'],
            ['Game (Premium Edition)', 'Game', 'Premium Edition'],
            ['Game (Special Edition)', 'Game', 'Special Edition'],
            // Brackets format
            ['Game [Ultimate Edition]', 'Game', 'Ultimate Edition'],
            ['Game [Collector\'s Edition]', 'Game', 'Collector\'s Edition'],
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

        test('The Sims 4 Premium Edition (without separator) has same base name', () => {
            const standard = extractEdition('The Sims 4');
            const premium = extractEdition('The Sims 4 Premium Edition');
            
            expect(normalizeGameTitle(standard.baseName)).toBe(normalizeGameTitle(premium.baseName));
            expect(standard.edition).toBe('Standard Edition');
            expect(premium.edition).toBe('Premium Edition');
        });

        test('The Sims™ 4 from Steam matches The Sims 4 from EA', () => {
            const steam = extractEdition('The Sims™ 4');
            const ea = extractEdition('The Sims 4');
            const premium = extractEdition('The Sims 4 Premium Edition');
            
            // All three should have the same normalized base name
            const steamNormalized = normalizeGameTitle(steam.baseName);
            const eaNormalized = normalizeGameTitle(ea.baseName);
            const premiumNormalized = normalizeGameTitle(premium.baseName);
            
            expect(steamNormalized).toBe(eaNormalized);
            expect(steamNormalized).toBe(premiumNormalized);
        });
    });

    describe('batch scenario: games synced at the same time', () => {
        /**
         * This test verifies the logic that ensures games with the same normalized
         * base name should merge to the same title when synced in the same batch.
         * 
         * Example scenario from Playnite (EA app):
         * - "The Sims 4" (standard edition)
         * - "The Sims 4 Premium Edition" (premium edition)
         * 
         * Both should create releases under the same "The Sims 4" title.
         */
        test('games from same batch should have identical base names for merging', () => {
            // Simulate a batch of games from Playnite/EA
            const batch = [
                'The Sims 4',
                'The Sims 4 Premium Edition',
                'The Sims™ 4', // From Steam via aggregator
            ];

            // Process each game as would happen in GameSyncService
            const processed = batch.map(gameName => {
                const {baseName, edition} = extractEdition(gameName);
                const normalized = normalizeGameTitle(baseName);
                return {gameName, baseName, edition, normalized};
            });

            // All normalized base names should be identical
            const normalizedNames = new Set(processed.map(p => p.normalized));
            expect(normalizedNames.size).toBe(1);
            expect([...normalizedNames][0]).toBe('the sims 4');

            // Editions should be correctly extracted
            expect(processed[0].edition).toBe('Standard Edition');
            expect(processed[1].edition).toBe('Premium Edition');
            expect(processed[2].edition).toBe('Standard Edition');
        });

        test('different games should not merge', () => {
            const batch = [
                'The Sims 4',
                'The Sims 5',
                'Sims City',
            ];

            const normalized = batch.map(name => {
                const {baseName} = extractEdition(name);
                return normalizeGameTitle(baseName);
            });

            // All should be different
            expect(new Set(normalized).size).toBe(3);
        });
    });

    describe('real-world failing examples', () => {
        /**
         * These are examples that were previously failing in production.
         * They include trailing whitespace and various edition formats.
         */
        test('handles trailing whitespace in game name', () => {
            const result = extractEdition('The Sims 4 Premium Edition ');
            expect(result.baseName).toBe('The Sims 4');
            expect(result.edition).toBe('Premium Edition');
        });

        test('handles Game of the Year Edition without separator', () => {
            const result = extractEdition('Middle-earth: Shadow of Mordor Game of the Year Edition');
            expect(result.baseName).toBe('Middle-earth: Shadow of Mordor');
            expect(result.edition).toBe('Game of the Year Edition');
        });

        test('handles History Edition with separator', () => {
            const result = extractEdition('The Settlers 7 - History Edition');
            expect(result.baseName).toBe('The Settlers 7');
            expect(result.edition).toBe('History Edition');
        });

        test('handles Definitive Edition after colon separator', () => {
            const result = extractEdition('Weird West: Definitive Edition');
            expect(result.baseName).toBe('Weird West');
            expect(result.edition).toBe('Definitive Edition');
        });

        test('handles various colon-separated editions', () => {
            const testCases = [
                ['Borderlands: Game of the Year Edition', 'Borderlands', 'Game of the Year Edition'],
                ['Fallout: New Vegas - Ultimate Edition', 'Fallout: New Vegas', 'Ultimate Edition'],
                ['Mass Effect: Legendary Edition', 'Mass Effect', 'Legendary Edition'],
            ];

            for (const [input, expectedBase, expectedEdition] of testCases) {
                const result = extractEdition(input);
                expect(result.baseName).toBe(expectedBase);
                expect(result.edition).toBe(expectedEdition);
            }
        });

        test('batch from Playnite with real game names', () => {
            const batch = [
                'The Sims 4',
                'The Sims 4 Premium Edition ',
                'Middle-earth: Shadow of Mordor Game of the Year Edition',
                'The Settlers 7 - History Edition',
                'Weird West: Definitive Edition',
            ];

            const processed = batch.map(gameName => {
                const {baseName, edition} = extractEdition(gameName);
                return {gameName, baseName, edition};
            });

            // Verify editions are correctly extracted
            expect(processed[0].baseName).toBe('The Sims 4');
            expect(processed[0].edition).toBe('Standard Edition');
            
            expect(processed[1].baseName).toBe('The Sims 4');
            expect(processed[1].edition).toBe('Premium Edition');
            
            expect(processed[2].baseName).toBe('Middle-earth: Shadow of Mordor');
            expect(processed[2].edition).toBe('Game of the Year Edition');
            
            expect(processed[3].baseName).toBe('The Settlers 7');
            expect(processed[3].edition).toBe('History Edition');
            
            expect(processed[4].baseName).toBe('Weird West');
            expect(processed[4].edition).toBe('Definitive Edition');

            // The Sims 4 variations should merge
            const sims4Normalized = normalizeGameTitle(processed[0].baseName);
            const sims4PremiumNormalized = normalizeGameTitle(processed[1].baseName);
            expect(sims4Normalized).toBe(sims4PremiumNormalized);
        });
    });
});
