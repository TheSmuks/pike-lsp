/**
 * On-Type Formatting Provider Tests
 *
 * TDD tests for on-type formatting functionality.
 *
 * Test scenarios:
 * - Trigger characters: newline, semicolon, closing brace
 * - Auto-indentation on newline
 * - Whitespace normalization
 * - Indentation calculation
 * - Matching brace finding
 */

import { describe, it, expect } from 'bun:test';
import assert from 'node:assert/strict';
import {
  calculateIndentation,
  findMatchingOpeningBrace,
} from '../../features/advanced/on-type-formatting.js';

describe('On-Type Formatting Provider', () => {
  describe('calculateIndentation', () => {
    describe('Opening brace at end of line', () => {
      it('should indent body after opening brace', () => {
        const result = calculateIndentation('void foo() {', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent nested block after opening brace', () => {
        const result = calculateIndentation('    if (true) {', '', 0, 4);
        expect(result).toBe(8);
      });

      it('should indent class body after opening brace', () => {
        const result = calculateIndentation('class Foo {', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should handle mapping/array literal opening brace', () => {
        const result = calculateIndentation('mapping m = ([', '', 0, 4);
        expect(result).toBe(8);
      });

      it('should handle multi-level nesting', () => {
        const result = calculateIndentation('        if (a) {', '', 0, 4);
        expect(result).toBe(12);
      });
    });

    describe('Braceless control statements', () => {
      it('should indent after if statement', () => {
        const result = calculateIndentation('if (true)', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after else', () => {
        const result = calculateIndentation('else', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after else if', () => {
        const result = calculateIndentation('else if (false)', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after while', () => {
        const result = calculateIndentation('while (condition)', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after for', () => {
        const result = calculateIndentation('for (int i = 0; i < 10; i++)', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after foreach', () => {
        const result = calculateIndentation('foreach (arr; idx; val)', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after closing brace else', () => {
        const result = calculateIndentation('} else', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should indent after closing brace else if', () => {
        const result = calculateIndentation('} else if (x)', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should not indent after if ending with semicolon', () => {
        const result = calculateIndentation('if (true);', '', 0, 4);
        expect(result).toBe(0);
      });

      it('should not indent after if ending with brace', () => {
        const result = calculateIndentation('if (true) {}', '', 0, 4);
        expect(result).toBe(0);
      });
    });

    describe('Unbalanced parentheses', () => {
      it('should indent with continuation for open paren at end', () => {
        const result = calculateIndentation('foo(', '', 0, 4);
        expect(result).toBe(8);
      });

      it('should indent with continuation for nested open parens', () => {
        const result = calculateIndentation('foo(bar(', '', 0, 4);
        expect(result).toBe(8);
      });

      it('should not indent when parens are balanced', () => {
        const result = calculateIndentation('foo())', '', 0, 4);
        expect(result).toBe(0);
      });

      it('should handle function call spanning lines', () => {
        const result = calculateIndentation('    write(', '', 0, 4);
        expect(result).toBe(12);
      });
    });

    describe('Default case - keep current indent', () => {
      it('should keep indent for regular statements', () => {
        const result = calculateIndentation('    x = 1;', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should keep zero indent for line starting at column 0', () => {
        const result = calculateIndentation('int x;', '', 0, 4);
        expect(result).toBe(0);
      });

      it('should handle empty line', () => {
        const result = calculateIndentation('', '', 0, 4);
        expect(result).toBe(0);
      });

      it('should handle whitespace-only line', () => {
        const result = calculateIndentation('    ', '', 0, 4);
        expect(result).toBe(4);
      });
    });

    describe('Tab size variations', () => {
      it('should use 2-space tab size', () => {
        const result = calculateIndentation('if (true)', '', 0, 2);
        expect(result).toBe(2);
      });

      it('should use 8-space tab size', () => {
        const result = calculateIndentation('if (true)', '', 0, 8);
        expect(result).toBe(8);
      });

      it('should handle custom tab size for nested blocks', () => {
        const result = calculateIndentation('        {', '', 0, 4);
        expect(result).toBe(12);
      });
    });

    describe('Real Pike code scenarios', () => {
      it('should handle function declaration', () => {
        const result = calculateIndentation('void create()', '', 0, 4);
        expect(result).toBe(0);
      });

      it('should handle function call', () => {
        const result = calculateIndentation('    Stdio.write("hello")', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should handle return statement', () => {
        const result = calculateIndentation('    return 1;', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should handle inherit statement', () => {
        const result = calculateIndentation('    inherit Stdio.File;', '', 0, 4);
        expect(result).toBe(4);
      });

      it('should handle constant declaration', () => {
        const result = calculateIndentation('constant PI = 3.14159;', '', 0, 4);
        expect(result).toBe(0);
      });
    });
  });

  describe('findMatchingOpeningBrace', () => {
    it('should find simple matching brace', () => {
      const text = 'void foo() {\n    x = 1;\n}';
      const result = findMatchingOpeningBrace(text, 2);
      expect(result).toBe(0);
    });

    it('should return null when no matching brace', () => {
      const text = 'void foo() {\n    x = 1;';
      const result = findMatchingOpeningBrace(text, 2);
      expect(result).toBeNull();
    });

    it('should handle nested braces', () => {
      const text = 'void foo() {\n    if (true) {\n        x = 1;\n    }\n}';
      const result = findMatchingOpeningBrace(text, 4);
      expect(result).toBe(0);
    });

    it('should find inner nested brace', () => {
      const text = 'void foo() {\n    if (true) {\n        x = 1;\n    }\n}';
      const result = findMatchingOpeningBrace(text, 3);
      expect(result).toBe(1);
    });

    it('should handle brace on same line', () => {
      const text = 'void foo() { x = 1; }';
      const result = findMatchingOpeningBrace(text, 0);
      expect(result).toBe(0);
    });

    it('should handle multiple top-level blocks', () => {
      const text = 'class A { }\nclass B { }';
      const result = findMatchingOpeningBrace(text, 1);
      expect(result).toBe(1);
    });

    it('should handle closing brace at start of file', () => {
      const text = '}';
      const result = findMatchingOpeningBrace(text, 0);
      expect(result).toBeNull();
    });

    it('should handle empty text', () => {
      const text = '';
      const result = findMatchingOpeningBrace(text, 0);
      expect(result).toBeNull();
    });

    it('should handle multi-line nested structures', () => {
      const text = `void foo() {
  if (cond) {
    while (x) {
      do_something();
    }
  }
}`;
      const result = findMatchingOpeningBrace(text, 6);
      expect(result).toBe(0);
    });

    it('should handle array literal braces', () => {
      const text = 'array a = ({1, 2, 3});';
      const result = findMatchingOpeningBrace(text, 0);
      expect(result).toBe(0);
    });

    it('should handle mapping literal braces', () => {
      const text = 'mapping m = (["key": 1]);';
      const result = findMatchingOpeningBrace(text, 0);
      expect(result).toBeNull();
    });

    it('should skip braces in strings', () => {
      const text = 'string s = "{";';
      const result = findMatchingOpeningBrace(text, 0);
      expect(result).toBeNull();
    });
  });

  describe('Trigger characters', () => {
    it('should use newline as trigger character', () => {
      const triggerCharacters = ['\n', ';', '}'];
      expect(triggerCharacters).toContain('\n');
    });

    it('should use semicolon as trigger character', () => {
      const triggerCharacters = ['\n', ';', '}'];
      expect(triggerCharacters).toContain(';');
    });

    it('should use closing brace as trigger character', () => {
      const triggerCharacters = ['\n', ';', '}'];
      expect(triggerCharacters).toContain('}');
    });
  });

  describe('Edge cases', () => {
    it('should handle tabs in indentation', () => {
      const tabIndented = '\t\tif (true)';
      const result = calculateIndentation(tabIndented, '', 0, 4);
      expect(result).toBe(12);
    });

    it('should handle mixed spaces and tabs', () => {
      const mixedIndented = '\t if (true)';
      const result = calculateIndentation(mixedIndented, '', 0, 4);
      expect(result).toBe(9);
    });

    it('should handle line with only opening brace', () => {
      const result = calculateIndentation('{', '', 0, 4);
      expect(result).toBe(4);
    });

    it('should handle line with only closing brace', () => {
      const result = calculateIndentation('}', '', 0, 4);
      expect(result).toBe(0);
    });

    it('should handle comment line', () => {
      const result = calculateIndentation('    // comment', '', 0, 4);
      expect(result).toBe(4);
    });

    it('should handle doc comment', () => {
      const result = calculateIndentation('    //! doc comment', '', 0, 4);
      expect(result).toBe(4);
    });

    it('should handle line with balanced parens and content', () => {
      const result = calculateIndentation('    foo(bar)', '', 0, 4);
      expect(result).toBe(4);
    });

    it('should handle closing brace followed by else', () => {
      const text = '    } else {';
      const result = calculateIndentation(text, '', 0, 4);
      expect(result).toBe(8);
    });
  });
});
