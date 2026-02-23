import { describe, it, expect } from 'bun:test';
import { formatPikeType } from '../features/utils/pike-type-formatter.js';

describe('Pike Type Formatter', () => {
    it('formats union types', () => {
        const formatted = formatPikeType({
            name: 'or',
            types: [{ name: 'int' }, { name: 'string' }],
        });

        expect(formatted).toBe('int | string');
    });

    it('formats intersection types', () => {
        const formatted = formatPikeType({
            name: 'and',
            types: [{ name: 'A' }, { name: 'B' }],
        });

        expect(formatted).toBe('A & B');
    });

    it('formats ranged int types', () => {
        const formatted = formatPikeType({
            name: 'int',
            min: '0',
            max: '255',
        });

        expect(formatted).toBe('int(0..255)');
    });

    it('formats attributed types', () => {
        const formatted = formatPikeType({
            name: '__attribute__',
            attribute: 'deprecated',
            type: { name: 'int' },
        });

        expect(formatted).toBe('__attribute__(deprecated) int');
    });

    it('maps object(unknown) to unknown', () => {
        const formatted = formatPikeType({
            name: 'object',
            className: 'unknown',
        });

        expect(formatted).toBe('unknown');
    });
});
