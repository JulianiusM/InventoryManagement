/**
 * Game Processor Tests
 * 
 * Tests for the unified game processing module that handles
 * game title and release creation for both fetch and push connectors.
 */

import {extractEdition, normalizeGameTitle} from '../../src/modules/games/GameNameUtils';

describe('GameProcessor - Edition Extraction Integration', () => {
    /**
     * These tests verify that games synced at the same time will correctly
     * merge to the same title with different releases.
     * 
     * Critical scenario: Playnite imports "The Sims 4" and "The Sims 4 Premium Edition"
     * in the same batch - they should create ONE title with TWO releases.
     */
    describe('batch processing scenario', () => {
        test('extracts correct base name and edition for batch of games', () => {
            // Simulate a batch from Playnite with multiple editions
            const batch = [
                'The Sims 4',
                'The Sims 4 Premium Edition',
                'The Sims 4 - Deluxe Edition',
                'The Sims™ 4',
            ];

            const processed = batch.map(name => {
                const {baseName, edition} = extractEdition(name);
                const normalized = normalizeGameTitle(baseName);
                return {name, baseName, edition, normalized};
            });

            // All should have the same normalized base name
            const normalizedNames = new Set(processed.map(p => p.normalized));
            expect(normalizedNames.size).toBe(1);
            expect([...normalizedNames][0]).toBe('the sims 4');

            // Each should have correct edition
            expect(processed[0].edition).toBe('Standard Edition');
            expect(processed[1].edition).toBe('Premium Edition');
            expect(processed[2].edition).toBe('Deluxe Edition');
            expect(processed[3].edition).toBe('Standard Edition');

            // Base names should NOT include edition
            expect(processed[0].baseName).toBe('The Sims 4');
            expect(processed[1].baseName).toBe('The Sims 4');
            expect(processed[2].baseName).toBe('The Sims 4');
            expect(processed[3].baseName).toBe('The Sims™ 4');
        });

        test('edition with parentheses format', () => {
            const {baseName, edition} = extractEdition('The Sims 4 (Premium Edition)');
            expect(baseName).toBe('The Sims 4');
            expect(edition).toBe('Premium Edition');
        });

        test('edition with brackets format', () => {
            const {baseName, edition} = extractEdition('Cyberpunk 2077 [Ultimate Edition]');
            expect(baseName).toBe('Cyberpunk 2077');
            expect(edition).toBe('Ultimate Edition');
        });

        test('GOTY variants extract correctly', () => {
            const variants = [
                'Dark Souls GOTY',
                'Dark Souls GOTY Edition',
                'Dark Souls - Game of the Year Edition',
                'Dark Souls (Game of the Year Edition)',
            ];

            for (const name of variants) {
                const {baseName, edition} = extractEdition(name);
                expect(normalizeGameTitle(baseName)).toBe('dark souls');
                expect(edition).toBe('Game of the Year Edition');
            }
        });

        test('games without editions get Standard Edition', () => {
            const games = ['Hades', 'Hollow Knight', 'Celeste'];
            
            for (const name of games) {
                const {baseName, edition} = extractEdition(name);
                expect(baseName).toBe(name);
                expect(edition).toBe('Standard Edition');
            }
        });
    });

    describe('normalizeGameTitle for merging', () => {
        test('removes trademark symbols', () => {
            expect(normalizeGameTitle('The Sims™ 4')).toBe('the sims 4');
            expect(normalizeGameTitle('The Sims® 4')).toBe('the sims 4');
            expect(normalizeGameTitle('Game© Name')).toBe('game name');
        });

        test('normalizes punctuation', () => {
            expect(normalizeGameTitle('Game: Title')).toBe('game title');
            expect(normalizeGameTitle('Game - Title')).toBe('game title');
            expect(normalizeGameTitle('Rock & Roll')).toBe('rock and roll');
        });
    });
});
