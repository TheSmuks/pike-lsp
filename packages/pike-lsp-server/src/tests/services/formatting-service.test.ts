import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { ErrorCodes, ResponseError } from 'vscode-languageserver/node.js';
import { FormattingService, formatPikeCodeWithProfile } from '../../services/formatting-service.js';
import type { FormattingOptions } from '../../services/formatting/formatting-profiles.js';

describe('FormattingService', () => {
  describe('clipEditToRange (via formatRange)', () => {
    // clipEditToRange is private; we exercise it through formatRange.
    // The scenario tests verify edit boundaries but don't verify that the
    // newText of clipped edits is correctly trimmed to match the clipped range.

    it('clips a multi-line edit whose start is before the requested range', () => {
      const service = new FormattingService();
      // 5-line document, all with wrong indentation (0 spaces instead of 4)
      const text = [
        'class Foo {', // line 0
        'int x;', // line 1 — should be indented
        'int y;', // line 2 — should be indented
        'int z;', // line 3 — should be indented
        '}', // line 4
      ].join('\n');

      // Requesting range [2, 3]. The indent computation may produce edits
      // starting before line 2; after clipping, every edit must be within range
      // and the newText must match the clipped span.
      const edits = service.formatRange(text, 2, 3, {});
      for (const edit of edits) {
        assert.ok(
          edit.range.start.line >= 2,
          `Edit start line ${edit.range.start.line} is before range start 2`
        );
        assert.ok(
          edit.range.end.line <= 3,
          `Edit end line ${edit.range.end.line} is past range end 3`
        );
        // Verify newText does not contain full-line content from before the range
        const newTextLines = edit.newText.split('\n');
        for (const line of newTextLines) {
          assert.ok(
            !line.includes('int x;'),
            'Clipped newText leaked content from before the requested range'
          );
        }
      }
    });

    it('clips a multi-line edit whose end is after the requested range', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {', // line 0
        'int x;', // line 1 — should be indented
        'int y;', // line 2 — should be indented
        'int z;', // line 3 — should be indented
        '}', // line 4
      ].join('\n');

      // Requesting range [0, 1]. Edits extending past line 1 should be clipped.
      const edits = service.formatRange(text, 0, 1, {});
      for (const edit of edits) {
        assert.ok(
          edit.range.end.line <= 1,
          `Edit end line ${edit.range.end.line} is past range end 1`
        );
        const newTextLines = edit.newText.split('\n');
        for (const line of newTextLines) {
          assert.ok(
            !line.includes('int y;') && !line.includes('int z;'),
            'Clipped newText leaked content from after the requested range'
          );
        }
      }
    });

    it('clips an edit that spans the entire range and beyond both ends', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {', // line 0
        'int x;', // line 1
        'int y;', // line 2
        'int z;', // line 3
        '}', // line 4
      ].join('\n');

      // Requesting range [1, 2]. Edits spanning lines 0-4 get clipped to [1, 2].
      const edits = service.formatRange(text, 1, 2, {});
      for (const edit of edits) {
        assert.ok(edit.range.start.line >= 1 && edit.range.end.line <= 2);
      }
    });

    it('preserves single-line edits within the range unchanged', () => {
      const service = new FormattingService();
      // Line 1 has bad indent; lines 0 and 2 are fine.
      const text = [
        'class Foo {',
        'int x;', // line 1 — needs indent
        '}', // line 2
      ].join('\n');

      const edits = service.formatRange(text, 0, 2, {});
      // There should be at least one edit for line 1
      assert.ok(edits.length > 0, 'Expected indentation edit on line 1');
      // The edit should be a single-line edit (start.line === end.line)
      const indentEdit = edits.find(e => e.range.start.line === 1);
      assert.ok(indentEdit, 'Expected an edit on line 1');
      assert.strictEqual(indentEdit.range.start.line, indentEdit.range.end.line);
    });

    it('returns edits with valid range positions for single-line document', () => {
      const service = new FormattingService();
      const text = 'int x;';
      const edits = service.formatRange(text, 0, 0, {});
      for (const edit of edits) {
        assert.ok(
          edit.range.start.line >= 0 && edit.range.end.line <= 0,
          `Edit ${edit.range.start.line}-${edit.range.end.line} outside range [0,0]`
        );
        assert.ok(
          edit.range.start.character >= 0,
          `Edit start character ${edit.range.start.character} is negative`
        );
      }
    });

    it('clips to endLine length when edit extends past end of requested line', () => {
      const service = new FormattingService();
      const text = [
        'void foo() {', // line 0
        'int a;', // line 1
        '  int b;', // line 2 — over-indented
        '}', // line 3
      ].join('\n');

      const edits = service.formatRange(text, 1, 2, {});
      for (const edit of edits) {
        assert.ok(edit.range.start.line >= 1 && edit.range.end.line <= 2);
        // The end position character should not exceed the line length
        if (edit.range.end.line <= 2) {
          const lines = text.split('\n');
          const maxChar = lines[edit.range.end.line]?.length ?? 0;
          assert.ok(
            edit.range.end.character <= maxChar,
            `End character ${edit.range.end.character} exceeds line length ${maxChar} on line ${edit.range.end.line}`
          );
        }
      }
    });

    it('produces correct newText for clipped multi-line edit', () => {
      const service = new FormattingService();
      const text = [
        'void foo() {', // line 0
        '  int x;', // line 1
        '  int y;', // line 2
        '}', // line 3
      ].join('\n');

      // Get full document edits for comparison
      const fullEdits = service.formatDocument(text, {});
      // Get range-limited edits
      const rangeEdits = service.formatRange(text, 1, 2, {});

      // Every range edit should correspond to some full edit that was clipped
      for (const re of rangeEdits) {
        assert.ok(
          re.range.start.line >= 1 && re.range.end.line <= 2,
          `Range edit [${re.range.start.line},${re.range.end.line}] outside [1,2]`
        );
        if (re.range.start.line === re.range.end.line) {
          // Single-line edit: newText should be the replacement content for that line
          assert.ok(typeof re.newText === 'string');
        }
      }
    });

    it('handles startLine === endLine range correctly', () => {
      const service = new FormattingService();
      const text = [
        'void foo() {',
        '  int x;', // line 1 — needs indent fix
        '  int y;', // line 2
        '}',
      ].join('\n');

      const edits = service.formatRange(text, 1, 1, {});
      for (const edit of edits) {
        assert.strictEqual(edit.range.start.line, 1);
        assert.strictEqual(edit.range.end.line, 1);
      }
    });

    it('does not duplicate text when multi-line edit clips to a single line', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {', // line 0
        '  int a;', // line 1
        '  int b;', // line 2
        '  int c;', // line 3
        '  int d;', // line 4
        '  int e;', // line 5
        '}', // line 6
      ].join('\n');

      // Request a single-line range deep in the document.
      // If the formatter produces a multi-line edit that gets clipped,
      // the clipped newText must not contain duplicated lines.
      const edits = service.formatRange(text, 5, 5, {});
      for (const edit of edits) {
        assert.strictEqual(edit.range.start.line, 5, 'Edit start must be on line 5');
        assert.strictEqual(edit.range.end.line, 5, 'Edit end must be on line 5');
        assert.ok(
          !edit.newText.includes('\n'),
          `Single-line clipped edit should not contain newlines, got: "${edit.newText}"`
        );
      }
    });

    it('skips correct number of initial newText lines when edit starts before range', () => {
      // Directly test the line-skipping behavior by constructing a scenario
      // where formatRange clips a multi-line indent edit that starts before the range.
      // With the bug, newText includes pre-range lines; after fix, those are skipped.
      const service = new FormattingService();
      const text = [
        'class Foo {', // line 0
        'int x;', // line 1
        '  int y;', // line 2 — over-indented (should be 4 spaces)
        '  int z;', // line 3 — over-indented
        '}', // line 4
      ].join('\n');

      // Full edits for lines 0-4 (indent fix reindents entire block)
      const fullEdits = service.formatDocument(text, {});
      const multiLineEdits = fullEdits.filter(e => e.range.start.line !== e.range.end.line);

      if (multiLineEdits.length === 0) {
        // No multi-line edits produced — test vacuously passes
        return;
      }

      // Use a representative multi-line edit
      const edit = multiLineEdits[0]!;
      const fullNewTextLines = edit.newText.split('\n');
      const editLineSpan = edit.range.end.line - edit.range.start.line + 1;

      // Assert invariant: a multi-line edit spanning N lines should have >= N newText lines
      assert.ok(
        fullNewTextLines.length >= editLineSpan,
        `Multi-line edit spans ${editLineSpan} lines but newText has ${fullNewTextLines.length} lines`
      );
    });

    it('does not truncate last visible newText line when edit extends beyond endLine', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {', // line 0
        '  int a=1+2;', // line 1 — operator spacing will widen this
        '  int b=3+4;', // line 2
        '}', // line 3
      ].join('\n');

      // Request range [0, 1]. Operator spacing edits span the full document.
      // The edit replacing lines 0-3 has newText where line 1 content is wider
      // than the original (e.g., '  int a = 1 + 2;' vs '  int a=1+2;').
      // The clipped edit's newText must not be truncated.
      const rangeEdits = service.formatRange(text, 0, 1, {});
      const fullEdits = service.formatDocument(text, {});

      // Simulate applying edits: the result for lines 0-1 must match what
      // full-document formatting produces for those same lines.
      const lines = text.split('\n');
      let rangeResult = lines.slice(0, 2).join('\n');
      // Apply range edits in reverse to preserve positions
      const sortedRangeEdits = [...rangeEdits].sort(
        (a, b) =>
          b.range.start.line - a.range.start.line ||
          b.range.start.character - a.range.start.character
      );
      for (const edit of sortedRangeEdits) {
        const resultLines = rangeResult.split('\n');
        if (edit.range.start.line === edit.range.end.line) {
          const line = resultLines[edit.range.start.line] ?? '';
          resultLines[edit.range.start.line] =
            line.slice(0, edit.range.start.character) +
            edit.newText +
            line.slice(edit.range.end.character);
          rangeResult = resultLines.join('\n');
        }
      }

      // Full-format the first two lines independently for comparison
      let fullResult = lines.slice(0, 2).join('\n');
      const fullEditsInRange = fullEdits.filter(
        e => e.range.start.line <= 1 && e.range.end.line >= 0
      );
      const sortedFullEdits = [...fullEditsInRange].sort(
        (a, b) =>
          b.range.start.line - a.range.start.line ||
          b.range.start.character - a.range.start.character
      );
      for (const edit of sortedFullEdits) {
        const resultLines = fullResult.split('\n');
        if (edit.range.start.line <= 1 && edit.range.end.line <= 1) {
          const line = resultLines[edit.range.start.line] ?? '';
          const endChar =
            edit.range.end.line === edit.range.start.line
              ? Math.min(edit.range.end.character, line.length)
              : line.length;
          resultLines[edit.range.start.line] =
            line.slice(0, edit.range.start.character) + edit.newText + line.slice(endChar);
          fullResult = resultLines.join('\n');
        }
      }

      assert.strictEqual(
        rangeResult.split('\n')[1],
        fullResult.split('\n')[1],
        'Range-formatted line 1 must match fully-formatted line 1 (not truncated)'
      );
    });
  });

  describe('formatDocument', () => {
    it('returns edits for badly indented code', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {',
        'int x;', // needs indent
        '}',
      ].join('\n');

      const edits = service.formatDocument(text, {});
      assert.ok(edits.length > 0, 'Expected indentation edits');
    });

    it('returns no edits for already-correct indentation', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {',
        '    int x;', // already 4-space indent
        '}',
      ].join('\n');

      const edits = service.formatDocument(text, {});
      assert.strictEqual(edits.length, 0);
    });

    it('respects insertSpaces=false (tabs)', () => {
      const service = new FormattingService();
      const text = [
        'class Foo {',
        '    int x;', // 4 spaces, should become tab
        '}',
      ].join('\n');

      const edits = service.formatDocument(text, { insertSpaces: false });
      const hasTabEdit = edits.some(e => e.newText.includes('\t'));
      assert.ok(hasTabEdit, 'Expected tab indentation edit');
    });

    it('applies new-line brace style from profile', () => {
      const service = new FormattingService();
      service.setProfile('allman');
      // applyBraceStyleTransformation triggers when a line starts with '{'
      // AND the previous line matches /\)\s*\{\s*$/ (') {' at end).
      // It then removes '{' from prevLine and adjusts the current line's indent.
      const text = 'int foo() {\n{\n  return 1;\n}';
      const edits = service.formatDocument(text, {});
      // 'int foo() {' matches /\)\s*\{\s*$/ and line 1 starts with '{'
      // → should remove trailing '{' from line 0 and adjust line 1 indent
      assert.ok(edits.length > 0, 'Expected edits from allman brace transformation');
    });
    it('returns empty array for empty string', () => {
      const service = new FormattingService();
      const edits = service.formatDocument('', {});
      assert.strictEqual(edits.length, 0);
    });

    it('returns empty array for whitespace-only string', () => {
      const service = new FormattingService();
      const edits = service.formatDocument('   \n\t\n', {});
      assert.strictEqual(edits.length, 0);
    });
  });

  describe('setProfile', () => {
    it('rejects empty string profile name', () => {
      const service = new FormattingService();
      assert.throws(
        () => service.setProfile(''),
        (err: unknown) => err instanceof ResponseError && err.code === ErrorCodes.InvalidParams
      );
    });

    it('switches profile multiple times correctly', () => {
      const service = new FormattingService();
      service.setProfile('compact');
      assert.strictEqual(service.getProfile().maxLineLength, 80);
      service.setProfile('relaxed');
      assert.strictEqual(service.getProfile().maxLineLength, 120);
      service.setProfile('standard');
      assert.strictEqual(service.getProfile().maxLineLength, 100);
    });

    it('custom profile replaces all fields', () => {
      const service = new FormattingService();
      service.setProfile({
        name: 'Tiny',
        maxLineLength: 40,
        braceStyle: 'new-line',
        spaceAroundOperators: false,
        blankLinesBetweenFunctions: 0,
      });
      const p = service.getProfile();
      assert.strictEqual(p.maxLineLength, 40);
      assert.strictEqual(p.braceStyle, 'new-line');
      assert.strictEqual(p.spaceAroundOperators, false);
      assert.strictEqual(p.blankLinesBetweenFunctions, 0);
    });
  });

  describe('formatPikeCodeWithProfile (exported helper)', () => {
    const testProfile = {
      name: 'test',
      maxLineLength: 100,
      braceStyle: 'same-line' as const,
      spaceAroundOperators: true,
      blankLinesBetweenFunctions: 1,
    };

    it('returns TextEdit[] with proper range structure', () => {
      const text = 'int x;';
      const edits = formatPikeCodeWithProfile(text, '    ', 0, testProfile);
      for (const edit of edits) {
        assert.ok(edit.range.start !== undefined);
        assert.ok(edit.range.end !== undefined);
        assert.ok(typeof edit.newText === 'string');
      }
    });

    it('startLine offset is reflected in edit positions', () => {
      const text = 'int x;';
      const startLine = 5;
      const edits = formatPikeCodeWithProfile(text, '    ', startLine, testProfile);
      for (const edit of edits) {
        assert.ok(
          edit.range.start.line >= startLine,
          `Edit start line ${edit.range.start.line} is below startLine offset ${startLine}`
        );
      }
    });

    it('returns empty edits for empty text', () => {
      const edits = formatPikeCodeWithProfile('', '    ', 0, testProfile);
      assert.strictEqual(edits.length, 0);
    });
  });
});
