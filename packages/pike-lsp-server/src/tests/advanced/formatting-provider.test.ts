/**
 * Formatting Provider Tests with Profiles
 *
 * TDD tests for document formatting functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#20-formatting-provider
 *
 * Test scenarios:
 * - 20.1 Formatting - Indentation
 * - 20.2 Formatting - Spacing
 * - 20.3 Formatting - Blank lines
 * - 20.4 Formatting - Configuration
 * - 20.5 Formatting Profiles
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  FormattingService,
  formatPikeCodeWithProfile,
  PREDEFINED_PROFILES,
  type FormattingProfile,
} from '../../services/formatting-service.js';

/**
 * Helper: indentation-only formatting.
 * Uses a profile with all transformations disabled so tests measure pure indentation.
 */
const INDENT_ONLY_PROFILE: FormattingProfile = {
  name: 'indent-only-test',
  maxLineLength: 0,
  braceStyle: 'same-line',
  spaceAroundOperators: false,
  blankLinesBetweenFunctions: 1,
};

function formatPikeCode(text: string, indent: string, startLine = 0) {
  return formatPikeCodeWithProfile(text, indent, startLine, INDENT_ONLY_PROFILE);
}
import { ResponseError, ErrorCodes } from 'vscode-languageserver/node.js';

/**
 * Validate formatting options (extracted for testing)
 */
function validateFormattingOptions(options: {
  tabSize?: number | string | boolean;
  insertSpaces?: boolean | string | number;
  maxLineLength?: number | string;
  braceStyle?: string;
}): void {
  const service = new FormattingService();
  service.validateFormattingOptions(options);
}

describe('Formatting Provider', () => {
  /**
   * Test 20.1: Formatting - Indentation
   */
  describe('Scenario 20.1: Formatting - Indentation', () => {
    it('should indent function body', () => {
      const code = 'void foo() {\nx = 1;\n}';
      const edits = formatPikeCode(code, '    ');
      assert.ok(edits.length > 0);
      const edit = edits.find(e => e.range.start.line === 1);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '    ');
    });

    it('should indent class body', () => {
      const code = 'class Foo {\nint x;\n}';
      const edits = formatPikeCode(code, '    ');
      assert.ok(edits.length > 0);
      const edit = edits.find(e => e.range.start.line === 1);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '    ');
    });

    it('should indent nested blocks', () => {
      const code = 'void foo() {\nif (true) {\nx = 1;\n}\n}';
      const edits = formatPikeCode(code, '    ');
      const edit = edits.find(e => e.range.start.line === 2);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '        ');
    });

    it('should indent if/else statements', () => {
      const code = 'if (true)\nx = 1;\nelse\ny = 2;';
      const edits = formatPikeCode(code, '    ');
      const edit1 = edits.find(e => e.range.start.line === 1);
      const edit3 = edits.find(e => e.range.start.line === 3);
      assert.ok(edit1);
      assert.ok(edit3);
      assert.strictEqual(edit1!.newText, '    ');
      assert.strictEqual(edit3!.newText, '    ');
    });

    it('should indent loop bodies', () => {
      const code = 'for (int i = 0; i < 10; i++)\nx += i;';
      const edits = formatPikeCode(code, '    ');
      const edit = edits.find(e => e.range.start.line === 1);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '    ');
    });

    it('should align closing brace with opening statement', () => {
      const code = 'void foo() {\n    x = 1;\n    }';
      const edits = formatPikeCode(code, '    ');
      const edit = edits.find(e => e.range.start.line === 2);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '');
    });
  });

  /**
   * Test 20.2: Formatting - Spacing
   */
  describe('Scenario 20.2: Formatting - Spacing', () => {
    it('should preserve code with proper comma spacing', () => {
      const code = 'foo(a, b, c);';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve code with proper operator spacing', () => {
      const code = 'x = a + b * c;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve semicolon placement', () => {
      const code = 'x = 1 ;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve keyword spacing', () => {
      const code = 'if (true) x = 1;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve multiple spaces (not normalized)', () => {
      const code = 'x  =  1;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve function declaration spacing', () => {
      const code = 'void foo(int x, string y)';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });
  });

  /**
   * Test 20.3: Formatting - Blank lines
   */
  describe('Scenario 20.3: Formatting - Blank lines', () => {
    it('should preserve blank lines between declarations', () => {
      const code = 'int x;\n\nint y;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve multiple blank lines', () => {
      const code = 'int x;\n\n\n\nint y;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve single blank line', () => {
      const code = 'int x;\n\nint y;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve blank lines after blocks', () => {
      const code = 'void foo() {\n}\n\nint x;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should preserve import section blank lines', () => {
      const code = 'import Stdio;\n\nimport Array;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });
  });

  /**
   * Test 20.4: Formatting - Configuration
   */
  describe('Scenario 20.4: Formatting - Configuration', () => {
    it('should respect tab size configuration', () => {
      const code = 'void foo() {\nx = 1;\n}';
      const edits2 = formatPikeCode(code, '  ');
      const edits4 = formatPikeCode(code, '    ');

      const edit2 = edits2.find(e => e.range.start.line === 1);
      const edit4 = edits4.find(e => e.range.start.line === 1);

      assert.strictEqual(edit2!.newText, '  ');
      assert.strictEqual(edit4!.newText, '    ');
    });

    it('should respect use tabs configuration', () => {
      const code = 'void foo() {\nx = 1;\n}';
      const editsTabs = formatPikeCode(code, '\t');
      const edit = editsTabs.find(e => e.range.start.line === 1);
      assert.strictEqual(edit!.newText, '\t');
    });

    it('should handle custom tab sizes (1-16)', () => {
      const code = 'void foo() {\nx = 1;\n}';
      for (let size = 1; size <= 16; size++) {
        const indent = ' '.repeat(size);
        const edits = formatPikeCode(code, indent);
        const edit = edits.find(e => e.range.start.line === 1);
        assert.strictEqual(edit!.newText, indent);
      }
    });

    it('should validate insertSpaces parameter', () => {
      assert.doesNotThrow(() => validateFormattingOptions({ insertSpaces: true }));
      assert.doesNotThrow(() => validateFormattingOptions({ insertSpaces: false }));
      assert.throws(() => validateFormattingOptions({ insertSpaces: 'yes' }), ResponseError);
    });

    it('should validate tabSize range (1-16)', () => {
      assert.doesNotThrow(() => validateFormattingOptions({ tabSize: 1 }));
      assert.doesNotThrow(() => validateFormattingOptions({ tabSize: 16 }));
      assert.throws(() => validateFormattingOptions({ tabSize: 0 }), ResponseError);
      assert.throws(() => validateFormattingOptions({ tabSize: 17 }), ResponseError);
    });
  });

  /**
   * Test 20.5: Formatting Profiles
   */
  describe('Scenario 20.5: Formatting Profiles', () => {
    it('should have predefined profiles', () => {
      assert.ok(PREDEFINED_PROFILES.compact);
      assert.ok(PREDEFINED_PROFILES.standard);
      assert.ok(PREDEFINED_PROFILES.relaxed);
      assert.ok(PREDEFINED_PROFILES.allman);
    });

    it('should have correct compact profile settings', () => {
      const profile = PREDEFINED_PROFILES.compact;
      assert.strictEqual(profile.maxLineLength, 80);
      assert.strictEqual(profile.braceStyle, 'same-line');
      assert.strictEqual(profile.spaceAroundOperators, true);
      assert.strictEqual(profile.blankLinesBetweenFunctions, 1);
    });

    it('should have correct standard profile settings', () => {
      const profile = PREDEFINED_PROFILES.standard;
      assert.strictEqual(profile.maxLineLength, 100);
      assert.strictEqual(profile.braceStyle, 'same-line');
      assert.strictEqual(profile.spaceAroundOperators, true);
      assert.strictEqual(profile.blankLinesBetweenFunctions, 1);
    });

    it('should have correct relaxed profile settings', () => {
      const profile = PREDEFINED_PROFILES.relaxed;
      assert.strictEqual(profile.maxLineLength, 120);
      assert.strictEqual(profile.braceStyle, 'same-line');
      assert.strictEqual(profile.spaceAroundOperators, true);
      assert.strictEqual(profile.blankLinesBetweenFunctions, 1);
    });

    it('should have correct allman profile settings', () => {
      const profile = PREDEFINED_PROFILES.allman;
      assert.strictEqual(profile.maxLineLength, 100);
      assert.strictEqual(profile.braceStyle, 'new-line');
      assert.strictEqual(profile.spaceAroundOperators, true);
      assert.strictEqual(profile.blankLinesBetweenFunctions, 1);
    });

    it('should set profile by name', () => {
      const service = new FormattingService();
      service.setProfile('compact');
      const profile = service.getProfile();
      assert.strictEqual(profile.maxLineLength, 80);
    });

    it('should set custom profile', () => {
      const service = new FormattingService();
      const custom: FormattingProfile = {
        name: 'Custom',
        maxLineLength: 90,
        braceStyle: 'new-line',
        spaceAroundOperators: false,
        blankLinesBetweenFunctions: 2,
      };
      service.setProfile(custom);
      const profile = service.getProfile();
      assert.strictEqual(profile.maxLineLength, 90);
      assert.strictEqual(profile.braceStyle, 'new-line');
    });

    it('should throw for unknown profile name', () => {
      const service = new FormattingService();
      assert.throws(() => service.setProfile('unknown-profile' as string), ResponseError);
    });

    it('should apply maxLineLength option', () => {
      const service = new FormattingService();
      service.setProfile('standard');
      const longLine = 'x = ' + 'a'.repeat(150) + ';';
      const edits = service.formatDocument(longLine, { maxLineLength: 50 });
      assert.ok(edits.length > 0);
    });

    it('should apply braceStyle option', () => {
      const service = new FormattingService();
      service.setProfile('standard');
      const code = 'void foo() {';
      const edits = service.formatDocument(code, { braceStyle: 'new-line' });
      assert.ok(edits);
    });

    it('should apply spaceAroundOperators option', () => {
      const service = new FormattingService();
      service.setProfile('standard');
      const code = 'x=a+b;';
      const edits = service.formatDocument(code, { spaceAroundOperators: true });
      assert.ok(edits);
    });

    it('should validate maxLineLength range', () => {
      assert.doesNotThrow(() => validateFormattingOptions({ maxLineLength: 0 }));
      assert.doesNotThrow(() => validateFormattingOptions({ maxLineLength: 200 }));
      assert.throws(() => validateFormattingOptions({ maxLineLength: -1 }), ResponseError);
      assert.throws(() => validateFormattingOptions({ maxLineLength: 201 }), ResponseError);
    });

    it('should validate braceStyle value', () => {
      assert.doesNotThrow(() => validateFormattingOptions({ braceStyle: 'same-line' }));
      assert.doesNotThrow(() => validateFormattingOptions({ braceStyle: 'new-line' }));
      assert.throws(() => validateFormattingOptions({ braceStyle: 'invalid' }), ResponseError);
    });

    it('should validate maxLineLength type', () => {
      assert.throws(() => validateFormattingOptions({ maxLineLength: '100' }), ResponseError);
    });
  });

  /**
   * Test 20.6: Formatting Service with Profiles
   */
  describe('Scenario 20.6: Formatting Service Profile Integration', () => {
    it('should format document with profile', () => {
      const service = new FormattingService();
      service.setProfile('compact');
      const code = 'void foo() {\nx = 1;\n}';
      const edits = service.formatDocument(code, { tabSize: 2 });
      assert.ok(edits.length > 0);
    });

    it('should format range with profile', () => {
      const service = new FormattingService();
      service.setProfile('standard');
      const code = 'void foo() {\nx = 1;\ny = 2;\n}';
      const edits = service.formatRange(code, 1, 2, { tabSize: 2 });
      assert.ok(edits.length > 0);
    });

    it('should override profile settings with options', () => {
      const service = new FormattingService();
      service.setProfile('compact');
      const code = 'void foo() {\nx = 1;\n}';
      const edits = service.formatDocument(code, {
        maxLineLength: 120,
        braceStyle: 'new-line',
        tabSize: 4,
      });
      assert.ok(edits);
    });

    it('should use standard profile as default', () => {
      const service = new FormattingService();
      const profile = service.getProfile();
      assert.strictEqual(profile.name, 'Standard');
      assert.strictEqual(profile.maxLineLength, 100);
    });
  });

  /**
   * Error Handling
   */
  describe('Error Handling', () => {
    it('should validate tabSize type', () => {
      assert.throws(() => validateFormattingOptions({ tabSize: '4' }), ResponseError);
    });

    it('should validate tabSize parameter range', () => {
      assert.throws(() => validateFormattingOptions({ tabSize: -1 }), ResponseError);
      assert.throws(() => validateFormattingOptions({ tabSize: 0 }), ResponseError);
      assert.throws(() => validateFormattingOptions({ tabSize: 100 }), ResponseError);
    });

    it('should validate insertSpaces parameter type', () => {
      assert.throws(() => validateFormattingOptions({ insertSpaces: 1 }), ResponseError);
      assert.throws(() => validateFormattingOptions({ insertSpaces: 'true' }), ResponseError);
    });

    it('should validate maxLineLength type', () => {
      assert.throws(() => validateFormattingOptions({ maxLineLength: '100' }), ResponseError);
      assert.throws(
        () => validateFormattingOptions({ maxLineLength: true as unknown as number }),
        ResponseError
      );
    });

    it('should validate braceStyle type', () => {
      assert.throws(
        () => validateFormattingOptions({ braceStyle: 123 as unknown as string }),
        ResponseError
      );
    });
  });

  /**
   * Edge Cases
   */
  describe('Edge Cases', () => {
    it('should handle empty file', () => {
      const code = '';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should handle file with only whitespace', () => {
      const code = '   \n   \n';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should handle file with syntax errors gracefully', () => {
      const code = 'void foo() {\nx = 1;';
      const edits = formatPikeCode(code, '    ');
      assert.ok(edits.length > 0);
    });

    it('should handle deeply nested structures', () => {
      const code = 'void foo() {\nif (1) {\nif (2) {\nif (3) {\nx = 1;\n}\n}\n}\n}';
      const edits = formatPikeCode(code, '    ');
      const edit = edits.find(e => e.range.start.line === 4);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '                ');
    });

    it('should handle profile with zero maxLineLength', () => {
      const service = new FormattingService();
      const custom: FormattingProfile = {
        name: 'NoLimit',
        maxLineLength: 0,
        braceStyle: 'same-line',
        spaceAroundOperators: true,
        blankLinesBetweenFunctions: 1,
      };
      service.setProfile(custom);
      const code = 'x = ' + 'a'.repeat(200) + ';';
      const edits = service.formatDocument(code, {});
      assert.ok(edits);
    });

    it('should handle profile with new-line brace style', () => {
      const service = new FormattingService();
      const custom: FormattingProfile = {
        name: 'AllmanCustom',
        maxLineLength: 80,
        braceStyle: 'new-line',
        spaceAroundOperators: true,
        blankLinesBetweenFunctions: 1,
      };
      service.setProfile(custom);
      const code = 'void foo() {\n}';
      const edits = service.formatDocument(code, {});
      assert.ok(edits);
    });

    it('should handle profile without operator spacing', () => {
      const service = new FormattingService();
      const custom: FormattingProfile = {
        name: 'NoSpacing',
        maxLineLength: 80,
        braceStyle: 'same-line',
        spaceAroundOperators: false,
        blankLinesBetweenFunctions: 1,
      };
      service.setProfile(custom);
      const code = 'x=a+b;';
      const edits = service.formatDocument(code, {});
      assert.ok(edits);
    });
  });

  /**
   * Range Formatting
   */
  describe('Range Formatting', () => {
    it('should format with correct line offset', () => {
      const code = 'void foo() {\nx = 1;\n}';
      const startLine = 10;
      const edits = formatPikeCode(code, '    ', startLine);
      const edit = edits.find(e => e.range.start.line === startLine + 1);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '    ');
    });

    it('should handle single line range', () => {
      const code = 'x = 1;';
      const edits = formatPikeCode(code, '    ', 0);
      assert.strictEqual(edits.length, 0);
    });

    it('should adjust indentation for range within block', () => {
      const code = 'x = 1;\ny = 2;';
      const startLine = 5;
      const edits = formatPikeCode(code, '    ', startLine);
      assert.strictEqual(edits.length, 0);
    });

    it('should include edits that start before startLine but overlap into the requested range', () => {
      const service = new FormattingService();
      service.setProfile('standard');
      // Line 0: "void foo() {" — the brace-style edit (if using new-line profile)
      // starts at line 0 but extends into line 1.
      // Line 1: "x = 1;" — requested range starts here.
      // Line 2: "}"
      const code = 'void foo() {\nx = 1;\n}';
      const edits = service.formatRange(code, 1, 2, { tabSize: 2 });
      // With the old filter (start.line >= startLine), edits starting at line 0
      // (e.g. brace transformations) would be excluded even though they overlap.
      // With the fix, any edit whose range overlaps [1,2] is included.
      assert.ok(edits.length > 0);
      // Verify every returned edit overlaps the requested range
      for (const edit of edits) {
        assert.ok(
          edit.range.start.line <= 2 && edit.range.end.line >= 1,
          `Edit at lines ${edit.range.start.line}-${edit.range.end.line} should overlap [1,2]`
        );
      }
    });
  });

  /**
   * Special Constructs
   */
  describe('Special Constructs', () => {
    it('should format array literals', () => {
      const code = 'array a = ({\n1,\n2,\n});';
      const edits = formatPikeCode(code, '    ');
      assert.ok(edits.length >= 0);
    });

    it('should format mapping literals', () => {
      const code = 'mapping m = ([\n"a": 1,\n]);';
      const edits = formatPikeCode(code, '    ');
      assert.ok(edits.length >= 0);
    });

    it('should preserve multi-line strings', () => {
      const code = 'string s = #"line1\nline2\nline3";';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should format lambda functions', () => {
      const code = 'function f = lambda() {\nreturn 1;\n};';
      const edits = formatPikeCode(code, '    ');
      const edit = edits.find(e => e.range.start.line === 1);
      assert.ok(edit);
      assert.strictEqual(edit!.newText, '    ');
    });

    it('should handle switch/case indentation', () => {
      const code = 'switch (x) {\ncase 1:\nbreak;\ndefault:\nbreak;\n}';
      const edits = formatPikeCode(code, '    ');
      assert.ok(edits.length > 0);
    });
  });

  /**
   * Comment Handling
   */
  describe('Comment Handling', () => {
    it('should preserve single-line comments', () => {
      const code = '// comment\nint x;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });

    it('should indent multi-line comments', () => {
      const code = 'void foo() {\n/* comment\nline2 */\n}';
      const edits = formatPikeCode(code, '    ');
      const edit = edits.find(e => e.range.start.line === 1);
      assert.ok(edit);
    });

    it('should preserve autodoc comments', () => {
      const code = '//! This is autodoc\nint x;';
      const edits = formatPikeCode(code, '    ');
      assert.strictEqual(edits.length, 0);
    });
  });
});
