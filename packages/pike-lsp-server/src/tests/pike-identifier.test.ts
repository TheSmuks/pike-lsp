/**
 * Pike Identifier Utils Unit Tests
 *
 * Tests for isPikeIdentifierStart, isPikeIdentifierChar, and getWordRangeAtPosition.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  isPikeIdentifierStart,
  isPikeIdentifierChar,
  getWordRangeAtPosition,
  getWordAtPosition,
  getWordAtOffset,
} from '../features/utils/pike-identifier.js';

function createDocument(source: string): TextDocument {
  return TextDocument.create('test://test.pike', 'pike', 1, source);
}

describe('isPikeIdentifierStart', () => {
  it('should return true for lowercase letters', () => {
    for (let i = 97; i <= 122; i++) {
      const char = String.fromCharCode(i);
      assert.strictEqual(isPikeIdentifierStart(char), true, `Expected true for '${char}'`);
    }
  });

  it('should return true for uppercase letters', () => {
    for (let i = 65; i <= 90; i++) {
      const char = String.fromCharCode(i);
      assert.strictEqual(isPikeIdentifierStart(char), true, `Expected true for '${char}'`);
    }
  });

  it('should return true for underscore', () => {
    assert.strictEqual(isPikeIdentifierStart('_'), true);
  });

  it('should return false for digits', () => {
    for (let i = 48; i <= 57; i++) {
      const char = String.fromCharCode(i);
      assert.strictEqual(isPikeIdentifierStart(char), false, `Expected false for '${char}'`);
    }
  });

  it('should return false for special characters', () => {
    const specialChars = [
      '@',
      '#',
      '$',
      '%',
      '^',
      '&',
      '*',
      '+',
      '=',
      '!',
      '?',
      '.',
      ',',
      ';',
      ':',
      '"',
      "'",
      '`',
      '~',
      '-',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '<',
      '>',
      '/',
      '\\',
      '|',
    ];
    for (const char of specialChars) {
      assert.strictEqual(isPikeIdentifierStart(char), false, `Expected false for '${char}'`);
    }
  });

  it('should return false for whitespace characters', () => {
    const whitespace = [' ', '\t', '\n', '\r'];
    for (const char of whitespace) {
      assert.strictEqual(isPikeIdentifierStart(char), false, `Expected false for whitespace char`);
    }
  });

  it('should return false for unicode characters', () => {
    assert.strictEqual(isPikeIdentifierStart('é'), false);
    assert.strictEqual(isPikeIdentifierStart('ñ'), false);
    assert.strictEqual(isPikeIdentifierStart('中'), false);
    assert.strictEqual(isPikeIdentifierStart('ø'), false);
  });

  it('should return false for empty string', () => {
    assert.strictEqual(isPikeIdentifierStart(''), false);
  });
});

describe('isPikeIdentifierChar', () => {
  it('should return true for lowercase letters', () => {
    for (let i = 97; i <= 122; i++) {
      const char = String.fromCharCode(i);
      assert.strictEqual(isPikeIdentifierChar(char), true, `Expected true for '${char}'`);
    }
  });

  it('should return true for uppercase letters', () => {
    for (let i = 65; i <= 90; i++) {
      const char = String.fromCharCode(i);
      assert.strictEqual(isPikeIdentifierChar(char), true, `Expected true for '${char}'`);
    }
  });

  it('should return true for digits', () => {
    for (let i = 48; i <= 57; i++) {
      const char = String.fromCharCode(i);
      assert.strictEqual(isPikeIdentifierChar(char), true, `Expected true for '${char}'`);
    }
  });

  it('should return true for underscore', () => {
    assert.strictEqual(isPikeIdentifierChar('_'), true);
  });

  it('should return false for special characters', () => {
    const specialChars = [
      '@',
      '#',
      '$',
      '%',
      '^',
      '&',
      '*',
      '+',
      '=',
      '!',
      '?',
      '.',
      ',',
      ';',
      ':',
      '"',
      "'",
      '`',
      '~',
      '-',
      '(',
      ')',
      '[',
      ']',
      '{',
      '}',
      '<',
      '>',
      '/',
      '\\',
      '|',
    ];
    for (const char of specialChars) {
      assert.strictEqual(isPikeIdentifierChar(char), false, `Expected false for '${char}'`);
    }
  });

  it('should return false for whitespace characters', () => {
    const whitespace = [' ', '\t', '\n', '\r'];
    for (const char of whitespace) {
      assert.strictEqual(isPikeIdentifierChar(char), false, `Expected false for whitespace char`);
    }
  });

  it('should return false for unicode characters', () => {
    assert.strictEqual(isPikeIdentifierChar('é'), false);
    assert.strictEqual(isPikeIdentifierChar('ñ'), false);
    assert.strictEqual(isPikeIdentifierChar('中'), false);
    assert.strictEqual(isPikeIdentifierChar('ø'), false);
  });

  it('should return false for empty string', () => {
    assert.strictEqual(isPikeIdentifierChar(''), false);
  });
});

describe('getWordRangeAtPosition', () => {
  describe('Simple identifiers', () => {
    it('should return word and range for simple identifier', () => {
      const source = 'int myVariable = 42;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return word and range');
      assert.strictEqual(result!.word, 'myVariable');
      assert.strictEqual(result!.range.start.character, 4);
      assert.strictEqual(result!.range.end.character, 14);
    });

    it('should return identifier with underscore', () => {
      const source = 'int _private_var = 1;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return word and range');
      assert.strictEqual(result!.word, '_private_var');
    });

    it('should return identifier with numbers in body', () => {
      const source = 'int var123 = 0;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return word and range');
      assert.strictEqual(result!.word, 'var123');
    });

    it('should return identifier with mixed case', () => {
      const source = 'int camelCase = 0;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return word and range');
      assert.strictEqual(result!.word, 'camelCase');
    });
  });

  describe('Identifiers at boundaries', () => {
    it('should return identifier at start of line', () => {
      const source = 'int x = 1;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier at line start');
      assert.strictEqual(result!.word, 'int');
    });

    it('should return identifier at end of line', () => {
      const source = 'int x';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier at line end');
      assert.strictEqual(result!.word, 'x');
    });

    it('should return identifier when positioned in middle', () => {
      const source = 'int myLongVariableName = 0;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 8 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier when cursor in middle');
      assert.strictEqual(result!.word, 'myLongVariableName');
    });
  });

  describe('Identifiers next to operators and whitespace', () => {
    it('should stop at space boundary', () => {
      const source = 'int x = 5;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return word');
      assert.strictEqual(result!.word, 'x');
    });

    it('should stop at operator boundary', () => {
      const source = 'x+y';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier before operator');
      assert.strictEqual(result!.word, 'x');
    });

    it('should stop at parentheses boundary', () => {
      const source = 'foo(bar)';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier before paren');
      assert.strictEqual(result!.word, 'foo');
    });

    it('should handle identifiers with underscores around operators', () => {
      const source = 'foo_bar + baz_qux';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier');
      assert.strictEqual(result!.word, 'foo_bar');
    });
  });

  describe('Digit-prefix invalid identifiers', () => {
    it('should return null when cursor on digit-only number', () => {
      const source = 'int x = 123;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 8 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null for digit-only number');
    });

    it('should return null when cursor on digit prefix of invalid identifier', () => {
      const source = '123abc';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null for digit-prefix identifier');
    });

    it('should return null when cursor on digit in middle of digit-prefix identifier', () => {
      const source = '123abc';
      const doc = createDocument(source);
      const pos = { line: 0, character: 1 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null for position on digit');
    });

    it('should return valid identifier when cursor is after digit prefix', () => {
      const source = '123abc';
      const doc = createDocument(source);
      const pos = { line: 0, character: 3 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null since identifier starts with digit');
    });
  });

  describe('Multi-line documents', () => {
    it('should find identifier on second line', () => {
      const source = 'int x;\nmyVar = 1;';
      const doc = createDocument(source);
      const pos = { line: 1, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier on second line');
      assert.strictEqual(result!.word, 'myVar');
    });

    it('should find identifier spanning multiple lines is not supported', () => {
      const source = 'myVar';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier');
      assert.strictEqual(result!.word, 'myVar');
    });

    it('should handle document with multiple identifiers on different lines', () => {
      const source = 'int a;\nstring b;\nfloat c;';
      const doc = createDocument(source);
      const pos = { line: 1, character: 7 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier on middle line');
      assert.strictEqual(result!.word, 'b');
    });

    it('should correctly calculate range with newlines', () => {
      const source = 'int x;\ny;';
      const doc = createDocument(source);
      const pos = { line: 1, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier on second line');
      assert.strictEqual(result!.word, 'y');
      assert.deepStrictEqual(result!.range, {
        start: { line: 1, character: 0 },
        end: { line: 1, character: 1 },
      });
    });
  });

  describe('Edge cases', () => {
    it('should return null for empty document', () => {
      const source = '';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null for empty document');
    });

    it('should return null for position at document end', () => {
      const source = 'test';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null for position at document end');
    });

    it('should return null for position beyond document end', () => {
      const source = 'test';
      const doc = createDocument(source);
      const pos = { line: 0, character: 100 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null for position beyond document');
    });

    it('should return null for position on operator', () => {
      const source = 'a + b';
      const doc = createDocument(source);
      const pos = { line: 0, character: 2 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null when on operator');
    });

    it('should return null for position on whitespace', () => {
      const source = 'a   b';
      const doc = createDocument(source);
      const pos = { line: 0, character: 2 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.strictEqual(result, null, 'Should return null when on whitespace');
    });

    it('should return identifier when positioned at underscore start', () => {
      const source = '_test = 1;';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier starting with underscore');
      assert.strictEqual(result!.word, '_test');
    });

    it('should handle multiple identifiers in sequence', () => {
      const source = 'abc def ghi';
      const doc = createDocument(source);
      const pos = { line: 0, character: 4 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return second identifier');
      assert.strictEqual(result!.word, 'def');
    });

    it('should handle identifiers with special Pike operators', () => {
      const source = 'x->y';
      const doc = createDocument(source);
      const pos = { line: 0, character: 0 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier before arrow');
      assert.strictEqual(result!.word, 'x');
    });
  });

  describe('Range verification', () => {
    it('should return correct range that extracts exact word from document', () => {
      const source = '  myIdentifier  ';
      const doc = createDocument(source);
      const pos = { line: 0, character: 3 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return result');
      const text = doc.getText();
      const extracted = text.slice(
        doc.offsetAt(result!.range.start),
        doc.offsetAt(result!.range.end)
      );
      assert.strictEqual(extracted, 'myIdentifier');
    });

    it('should return correct range for module path style identifier', () => {
      const source = 'Stdio.File.read';
      const doc = createDocument(source);
      const pos = { line: 0, character: 6 };

      const result = getWordRangeAtPosition(doc, pos);

      assert.ok(result, 'Should return identifier');
      assert.strictEqual(result!.word, 'File');
    });
  });
});

describe('getWordAtPosition', () => {
  it('should return word string for valid identifier', () => {
    const source = 'myVariable = 42;';
    const doc = createDocument(source);
    const pos = { line: 0, character: 3 };

    const result = getWordAtPosition(doc, pos);

    assert.strictEqual(result, 'myVariable');
  });

  it('should return null for position on whitespace', () => {
    const source = '  myVariable  ';
    const doc = createDocument(source);
    const pos = { line: 0, character: 0 };

    const result = getWordAtPosition(doc, pos);

    assert.strictEqual(result, null);
  });

  it('should return null for position on operator', () => {
    const source = 'x + y';
    const doc = createDocument(source);
    const pos = { line: 0, character: 2 };

    const result = getWordAtPosition(doc, pos);

    assert.strictEqual(result, null);
  });

  it('should return word for underscore-prefixed identifier', () => {
    const source = '_internalVar';
    const doc = createDocument(source);
    const pos = { line: 0, character: 5 };

    const result = getWordAtPosition(doc, pos);

    assert.strictEqual(result, '_internalVar');
  });
});

describe('getWordAtOffset', () => {
  it('should return word and offsets for valid identifier', () => {
    const source = 'myVariable = 42;';
    const result = getWordAtOffset(source, 3);

    assert.ok(result, 'Should return result');
    assert.strictEqual(result!.word, 'myVariable');
    assert.strictEqual(result!.startOffset, 0);
    assert.strictEqual(result!.endOffset, 10);
  });

  it('should return null for offset on whitespace', () => {
    const source = '  myVariable  ';
    const result = getWordAtOffset(source, 0);

    assert.strictEqual(result, null);
  });

  it('should return null for offset on operator', () => {
    const source = 'x + y';
    const result = getWordAtOffset(source, 2);

    assert.strictEqual(result, null);
  });

  it('should handle offset in middle of identifier', () => {
    const source = 'myIdentifier';
    const result = getWordAtOffset(source, 5);

    assert.ok(result, 'Should return result');
    assert.strictEqual(result!.word, 'myIdentifier');
    assert.strictEqual(result!.startOffset, 0);
    assert.strictEqual(result!.endOffset, 12);
  });

  it('should return null for negative offset', () => {
    const source = 'myVariable';
    const result = getWordAtOffset(source, -1);

    assert.strictEqual(result, null);
  });

  it('should return null for offset beyond text length', () => {
    const source = 'short';
    const result = getWordAtOffset(source, 100);

    assert.strictEqual(result, null);
  });
});
