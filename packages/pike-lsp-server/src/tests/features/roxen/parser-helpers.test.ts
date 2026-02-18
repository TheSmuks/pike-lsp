/**
 * Parser Helpers Tests
 *
 * Tests for position mapping and string utilities in parser-helpers.ts
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import {
    positionAt,
    offsetAt,
    buildLineOffsets,
    offsetToPosition,
    positionToOffset,
    isPositionInRange,
    comparePositions,
    isValidRange,
    getFullRange,
    findSubstringPosition,
    extractRange,
    countLinesBetween,
    getLineLength,
    pikePositionToLSP,
    lspPositionToPike,
    pikeRangeToLSP,
} from '../../../features/roxen/parser-helpers.js';

describe('Parser Helpers', () => {
    describe('positionAt', () => {
        it('should return position at offset 0', () => {
            const pos = positionAt('hello', 0);
            assert.strictEqual(pos.line, 0);
            assert.strictEqual(pos.character, 0);
        });

        it('should count characters on first line', () => {
            const pos = positionAt('hello', 3);
            assert.strictEqual(pos.line, 0);
            assert.strictEqual(pos.character, 3);
        });

        it('should handle newlines', () => {
            const pos = positionAt('hello\nworld', 6);
            assert.strictEqual(pos.line, 1);
            assert.strictEqual(pos.character, 0);
        });

        it('should handle multiple newlines', () => {
            const text = 'line1\nline2\nline3';
            const pos = positionAt(text, 12);
            assert.strictEqual(pos.line, 2);
            assert.strictEqual(pos.character, 0);
        });

        it('should handle empty string', () => {
            const pos = positionAt('', 0);
            assert.strictEqual(pos.line, 0);
            assert.strictEqual(pos.character, 0);
        });

        it('should handle offset beyond text length', () => {
            const pos = positionAt('hi', 10);
            assert.strictEqual(pos.line, 0);
            assert.strictEqual(pos.character, 2);
        });
    });

    describe('offsetAt', () => {
        it('should return offset 0 for position 0:0', () => {
            const offset = offsetAt('hello', { line: 0, character: 0 });
            assert.strictEqual(offset, 0);
        });

        it('should calculate offset for middle of line', () => {
            const offset = offsetAt('hello', { line: 0, character: 3 });
            assert.strictEqual(offset, 3);
        });

        it('should handle newlines', () => {
            const offset = offsetAt('hello\nworld', { line: 1, character: 0 });
            assert.strictEqual(offset, 6);
        });

        it('should handle second line with character offset', () => {
            const offset = offsetAt('hello\nworld', { line: 1, character: 3 });
            assert.strictEqual(offset, 9);
        });

        it('should clamp to text length for invalid line', () => {
            const offset = offsetAt('hi', { line: 10, character: 0 });
            assert.strictEqual(offset, 2);
        });
    });

    describe('buildLineOffsets', () => {
        it('should return [0] for empty string', () => {
            const offsets = buildLineOffsets('');
            assert.deepStrictEqual(offsets, [0]);
        });

        it('should return [0] for single line', () => {
            const offsets = buildLineOffsets('hello');
            assert.deepStrictEqual(offsets, [0]);
        });

        it('should handle single newline', () => {
            const offsets = buildLineOffsets('hello\n');
            assert.deepStrictEqual(offsets, [0, 6]);
        });

        it('should handle multiple lines', () => {
            const offsets = buildLineOffsets('line1\nline2\nline3');
            assert.deepStrictEqual(offsets, [0, 6, 12]);
        });

        it('should handle consecutive newlines', () => {
            const offsets = buildLineOffsets('a\n\nb');
            assert.deepStrictEqual(offsets, [0, 2, 3]);
        });
    });

    describe('offsetToPosition', () => {
        it('should convert offset 0 to position 0:0', () => {
            const pos = offsetToPosition(0, [0, 5, 10]);
            assert.strictEqual(pos.line, 0);
            assert.strictEqual(pos.character, 0);
        });

        it('should handle offset in first line', () => {
            const pos = offsetToPosition(3, [0, 5, 10]);
            assert.strictEqual(pos.line, 0);
            assert.strictEqual(pos.character, 3);
        });

        it('should handle offset in second line', () => {
            const pos = offsetToPosition(7, [0, 5, 10]);
            assert.strictEqual(pos.line, 1);
            assert.strictEqual(pos.character, 2);
        });

        it('should handle offset beyond last line', () => {
            const pos = offsetToPosition(15, [0, 5, 10]);
            assert.strictEqual(pos.line, 2);
            assert.strictEqual(pos.character, 5);
        });
    });

    describe('positionToOffset', () => {
        it('should convert position 0:0 to offset 0', () => {
            const offset = positionToOffset({ line: 0, character: 0 }, [0, 5, 10]);
            assert.strictEqual(offset, 0);
        });

        it('should handle position in first line', () => {
            const offset = positionToOffset({ line: 0, character: 3 }, [0, 5, 10]);
            assert.strictEqual(offset, 3);
        });

        it('should handle position in second line', () => {
            const offset = positionToOffset({ line: 1, character: 2 }, [0, 5, 10]);
            assert.strictEqual(offset, 7);
        });

        it('should handle line beyond array length', () => {
            const offset = positionToOffset({ line: 10, character: 0 }, [0, 5, 10]);
            assert.strictEqual(offset, 10);
        });
    });

    describe('isPositionInRange', () => {
        it('should return true for position at start of range', () => {
            const pos = { line: 1, character: 0 };
            const range = { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } };
            assert.strictEqual(isPositionInRange(pos, range), true);
        });

        it('should return true for position at end of range', () => {
            const pos = { line: 2, character: 5 };
            const range = { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } };
            assert.strictEqual(isPositionInRange(pos, range), true);
        });

        it('should return true for position within range', () => {
            const pos = { line: 1, character: 5 };
            const range = { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } };
            assert.strictEqual(isPositionInRange(pos, range), true);
        });

        it('should return false for position before range', () => {
            const pos = { line: 0, character: 5 };
            const range = { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } };
            assert.strictEqual(isPositionInRange(pos, range), false);
        });

        it('should return false for position after range', () => {
            const pos = { line: 3, character: 0 };
            const range = { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } };
            assert.strictEqual(isPositionInRange(pos, range), false);
        });
    });

    describe('comparePositions', () => {
        it('should return 0 for equal positions', () => {
            assert.strictEqual(comparePositions({ line: 1, character: 5 }, { line: 1, character: 5 }), 0);
        });

        it('should return -1 when a is before b', () => {
            assert.strictEqual(comparePositions({ line: 0, character: 5 }, { line: 1, character: 0 }), -1);
        });

        it('should return 1 when a is after b', () => {
            assert.strictEqual(comparePositions({ line: 2, character: 0 }, { line: 1, character: 5 }), 1);
        });

        it('should compare by character when lines are equal', () => {
            assert.strictEqual(comparePositions({ line: 1, character: 10 }, { line: 1, character: 5 }), 1);
            assert.strictEqual(comparePositions({ line: 1, character: 2 }, { line: 1, character: 5 }), -1);
        });
    });

    describe('isValidRange', () => {
        it('should return true for valid range', () => {
            const range = { start: { line: 1, character: 0 }, end: { line: 2, character: 5 } };
            assert.strictEqual(isValidRange(range), true);
        });

        it('should return true for single-point range', () => {
            const range = { start: { line: 1, character: 5 }, end: { line: 1, character: 5 } };
            assert.strictEqual(isValidRange(range), true);
        });

        it('should return false for invalid range', () => {
            const range = { start: { line: 2, character: 5 }, end: { line: 1, character: 0 } };
            assert.strictEqual(isValidRange(range), false);
        });
    });

    describe('getFullRange', () => {
        it('should return full range for single line', () => {
            const range = getFullRange('hello');
            assert.strictEqual(range.start.line, 0);
            assert.strictEqual(range.start.character, 0);
            assert.strictEqual(range.end.line, 0);
            assert.strictEqual(range.end.character, 5);
        });

        it('should handle multiple lines', () => {
            const range = getFullRange('hello\nworld');
            assert.strictEqual(range.start.line, 0);
            assert.strictEqual(range.start.character, 0);
            assert.strictEqual(range.end.line, 1);
            assert.strictEqual(range.end.character, 5);
        });

        it('should handle empty string', () => {
            const range = getFullRange('');
            assert.strictEqual(range.start.line, 0);
            assert.strictEqual(range.start.character, 0);
            assert.strictEqual(range.end.line, 0);
            assert.strictEqual(range.end.character, 0);
        });
    });

    describe('findSubstringPosition', () => {
        it('should find substring at start', () => {
            const pos = findSubstringPosition('hello world', 'hello');
            assert.deepStrictEqual(pos, { line: 0, character: 0 });
        });

        it('should find substring in middle', () => {
            const pos = findSubstringPosition('hello world', 'world');
            assert.deepStrictEqual(pos, { line: 0, character: 6 });
        });

        it('should return null for not found', () => {
            const pos = findSubstringPosition('hello', 'xyz');
            assert.strictEqual(pos, null);
        });

        it('should handle substring with newlines', () => {
            const pos = findSubstringPosition('hello\nworld', 'world');
            assert.deepStrictEqual(pos, { line: 1, character: 0 });
        });

        it('should respect start offset', () => {
            const pos = findSubstringPosition('hello hello', 'hello', 1);
            assert.deepStrictEqual(pos, { line: 0, character: 6 });
        });
    });

    describe('extractRange', () => {
        it('should extract substring within range', () => {
            const text = 'hello world';
            const range = {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 }
            };
            assert.strictEqual(extractRange(text, range), 'hello');
        });

        it('should handle range spanning newlines', () => {
            const text = 'hello\nworld';
            const range = {
                start: { line: 0, character: 3 },
                end: { line: 1, character: 3 }
            };
            assert.strictEqual(extractRange(text, range), 'lo\nwor');
        });
    });

    describe('countLinesBetween', () => {
        it('should return 0 for same line', () => {
            assert.strictEqual(
                countLinesBetween({ line: 1, character: 0 }, { line: 1, character: 10 }),
                0
            );
        });

        it('should count lines between positions', () => {
            assert.strictEqual(
                countLinesBetween({ line: 1, character: 0 }, { line: 5, character: 10 }),
                4
            );
        });
    });

    describe('getLineLength', () => {
        it('should return length of first line', () => {
            assert.strictEqual(getLineLength('hello world', 0), 11);
        });

        it('should return length of second line', () => {
            assert.strictEqual(getLineLength('hello\nworld', 1), 5);
        });

        it('should return 0 for invalid line number', () => {
            assert.strictEqual(getLineLength('hello', 5), 0);
        });

        it('should return 0 for negative line number', () => {
            assert.strictEqual(getLineLength('hello', -1), 0);
        });
    });

    describe('Pike position conversion', () => {
        it('should convert Pike 1-indexed to LSP 0-indexed', () => {
            const lsp = pikePositionToLSP({ line: 1, column: 1 });
            assert.strictEqual(lsp.line, 0);
            assert.strictEqual(lsp.character, 0);
        });

        it('should handle Pike position 3:5', () => {
            const lsp = pikePositionToLSP({ line: 3, column: 5 });
            assert.strictEqual(lsp.line, 2);
            assert.strictEqual(lsp.character, 4);
        });

        it('should convert LSP 0-indexed to Pike 1-indexed', () => {
            const pike = lspPositionToPike({ line: 0, character: 0 });
            assert.strictEqual(pike.line, 1);
            assert.strictEqual(pike.column, 1);
        });

        it('should convert Pike range to LSP range', () => {
            const lsp = pikeRangeToLSP({
                start: { line: 1, column: 1 },
                end: { line: 2, column: 5 }
            });
            assert.strictEqual(lsp.start.line, 0);
            assert.strictEqual(lsp.start.character, 0);
            assert.strictEqual(lsp.end.line, 1);
            assert.strictEqual(lsp.end.character, 4);
        });
    });
});
