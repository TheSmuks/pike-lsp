import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { ErrorCodes, ResponseError } from 'vscode-languageserver/node.js';
import { FormattingService } from '../services/formatting-service.js';
import type {
  FormattingProfile,
  FormattingOptions,
} from '../services/formatting/formatting-profiles.js';

describe('FormattingService', () => {
  describe('formatRange', () => {
    const service = new FormattingService();
    const options: FormattingOptions = {};

    it('returns edits fully contained within the range', () => {
      // 5 lines, badly indented. Requesting range [1,3] should only return edits on lines 1-3.
      const text = [
        'void foo() {',
        '  int x;', // line 1 — needs indent
        '    int y;', // line 2 — needs indent
        '  }', // line 3 — wrong indent for closing brace
        '}', // line 4 — closing brace
      ].join('\n');

      const edits = service.formatRange(text, 1, 3, options);

      // Every returned edit must start >= line 1 and end <= line 3
      for (const edit of edits) {
        assert.ok(
          edit.range.start.line >= 1 && edit.range.end.line <= 3,
          `Edit out of range: line ${edit.range.start.line}-${edit.range.end.line}`
        );
      }
    });

    it('excludes edits that start before the range', () => {
      const text = [
        'class Foo {', // line 0 — no indent change needed
        '  int x;', // line 1 — needs indent (8 spaces → wrong)
        '}', // line 2
      ].join('\n');

      // Requesting range starting at line 1 should not include any edit on line 0
      const edits = service.formatRange(text, 1, 2, options);
      for (const edit of edits) {
        assert.ok(edit.range.start.line >= 1, 'Should not include edits before range');
      }
    });

    it('excludes edits that end after the range', () => {
      const text = [
        'void foo() {', // line 0
        '  int x;', // line 1
        '  int y;', // line 2
        '}', // line 3
      ].join('\n');

      // Requesting range [0,1] should not include edits on line 2 or beyond
      const edits = service.formatRange(text, 0, 1, options);
      for (const edit of edits) {
        assert.ok(edit.range.end.line <= 1, 'Should not include edits past range end');
      }
    });

    it('returns empty array when no edits fall within the range', () => {
      // Already correctly indented code within the range
      const text = [
        'void foo() {',
        '    int x;', // line 1 — already correct 4-space indent
        '}',
      ].join('\n');

      const edits = service.formatRange(text, 1, 1, options);
      assert.strictEqual(edits.length, 0, 'No edits needed for already-correct indentation');
    });

    it('returns empty array for empty document', () => {
      const edits = service.formatRange('', 0, 0, options);
      assert.strictEqual(edits.length, 0);
    });

    it('returns empty array when range is outside document lines', () => {
      const text = 'int x;';
      const edits = service.formatRange(text, 5, 10, options);
      assert.strictEqual(edits.length, 0);
    });

    it('filters edits from profile transformations to the range', () => {
      // Use a profile that enables brace style transformation (new-line).
      service.setProfile('allman');
      const text = [
        'void foo() {', // line 0
        '    int x;', // line 1
        '}', // line 2
      ].join('\n');

      const edits = service.formatRange(text, 0, 1, options);
      // Any brace-style edits on line 2 (the closing brace area) should be excluded
      for (const edit of edits) {
        assert.ok(
          edit.range.start.line >= 0 && edit.range.end.line <= 1,
          `Profile edit out of range: line ${edit.range.start.line}-${edit.range.end.line}`
        );
      }

      // Reset to standard for other tests
      service.setProfile('standard');
    });

    it('validates options before computing edits', () => {
      const text = 'int x;';
      assert.throws(
        () => service.formatRange(text, 0, 0, { tabSize: 0 }),
        (err: unknown) => err instanceof ResponseError && err.code === ErrorCodes.InvalidParams
      );
    });
  });

  describe('formatDocument', () => {
    it('validates options before computing edits', () => {
      const service = new FormattingService();
      assert.throws(
        () => service.formatDocument('int x;', { tabSize: 0 }),
        (err: unknown) => err instanceof ResponseError && err.code === ErrorCodes.InvalidParams
      );
    });
  });

  describe('setProfile', () => {
    it('accepts a valid predefined profile by name', () => {
      const service = new FormattingService();
      service.setProfile('compact');
      assert.strictEqual(service.getProfile().name, 'Compact');
    });

    it('accepts the "relaxed" profile', () => {
      const service = new FormattingService();
      service.setProfile('relaxed');
      assert.strictEqual(service.getProfile().name, 'Relaxed');
      assert.strictEqual(service.getProfile().maxLineLength, 120);
    });

    it('accepts the "allman" profile', () => {
      const service = new FormattingService();
      service.setProfile('allman');
      assert.strictEqual(service.getProfile().name, 'Allman Style');
      assert.strictEqual(service.getProfile().braceStyle, 'new-line');
    });

    it('accepts a custom FormattingProfile object', () => {
      const service = new FormattingService();
      const custom: FormattingProfile = {
        name: 'Custom',
        maxLineLength: 60,
        braceStyle: 'new-line',
        spaceAroundOperators: false,
        blankLinesBetweenFunctions: 2,
      };
      service.setProfile(custom);
      assert.strictEqual(service.getProfile().name, 'Custom');
      assert.strictEqual(service.getProfile().maxLineLength, 60);
      assert.strictEqual(service.getProfile().braceStyle, 'new-line');
      assert.strictEqual(service.getProfile().spaceAroundOperators, false);
      assert.strictEqual(service.getProfile().blankLinesBetweenFunctions, 2);
    });

    it('throws ResponseError for unknown profile name', () => {
      const service = new FormattingService();
      assert.throws(
        () => service.setProfile('nonexistent'),
        (err: unknown) =>
          err instanceof ResponseError &&
          err.code === ErrorCodes.InvalidParams &&
          err.message.includes('Unknown formatting profile: nonexistent')
      );
    });
  });

  describe('getProfile', () => {
    it('returns standard profile by default', () => {
      const service = new FormattingService();
      assert.strictEqual(service.getProfile().name, 'Standard');
      assert.strictEqual(service.getProfile().maxLineLength, 100);
      assert.strictEqual(service.getProfile().braceStyle, 'same-line');
      assert.strictEqual(service.getProfile().spaceAroundOperators, true);
    });
  });
});
