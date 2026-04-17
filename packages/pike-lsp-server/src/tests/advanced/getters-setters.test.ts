/**
 * Getter/Setter Generation Tests
 *
 * Tests for getter and setter code action generation feature.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { TextEdit } from 'vscode-languageserver/node.js';
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { CodeActionKind } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getGenerateGetterSetterActions } from '../../features/advanced/getters-setters.js';

describe('Getter/Setter Generation', () => {
  describe('Getter Generation', () => {
    it('should generate getter from private variable with underscore prefix', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_value',
          kind: 'variable',
          modifiers: ['private'],
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      assert.equal(result.length, 3, 'Should return 3 actions');

      const getterAction = result.find(a => a.title.includes("Getter 'get_value'"));
      assert.ok(getterAction, 'Should have getter action');
      assert.equal(getterAction.kind, CodeActionKind.RefactorRewrite);
      assert.ok(getterAction.edit, 'Getter action should have edit');

      const changes = getterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('get_value()'), 'Getter should have correct function name');
      assert.ok(edit.newText.includes('int'), 'Getter should return int type');
    });

    it('should generate getter for string type variable', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'string _name;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 14 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_name',
          kind: 'variable',
          type: 'string',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const getterAction = result.find(a => a.title.includes('Getter'));
      assert.ok(getterAction, 'Should have getter action');

      const changes = getterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('string'), 'Getter should return string type');
      assert.ok(edit.newText.includes('get_name()'), 'Getter should have correct name');
    });

    it('should generate getter for array type variable', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'array(int) _items;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 20 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_items',
          kind: 'variable',
          type: 'array(int)',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const getterAction = result.find(a => a.title.includes('Getter'));
      assert.ok(getterAction, 'Should have getter action');

      const changes = getterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('array(int)'), 'Getter should return array type');
    });

    it('should generate getter for variable without underscore', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int count;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 9 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: 'count',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const getterAction = result.find(a => a.title.includes('Getter'));
      assert.ok(getterAction, 'Should have getter action');

      const changes = getterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('get_count()'), 'Getter should have get_ prefix');
    });

    it('should generate getter for variable with trailing underscore', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int value_;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: 'value_',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const getterAction = result.find(a => a.title.includes('Getter'));
      assert.ok(getterAction, 'Should have getter action');

      const changes = getterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('get_value()'), 'Getter should strip trailing underscore');
    });
  });

  describe('Setter Generation', () => {
    it('should generate setter from private variable with underscore prefix', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_value',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const setterAction = result.find(a => a.title.includes("Setter 'set_value'"));
      assert.ok(setterAction, 'Should have setter action');
      assert.ok(setterAction.edit, 'Setter action should have edit');

      const changes = setterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('set_value('), 'Setter should have correct function name');
      assert.ok(edit.newText.includes('int value'), 'Setter should have value parameter');
      assert.ok(edit.newText.includes('_value = value'), 'Setter should assign value');
    });

    it('should generate setter for string type variable', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'string _name;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 14 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_name',
          kind: 'variable',
          type: 'string',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const setterAction = result.find(a => a.title.includes('Setter'));
      assert.ok(setterAction, 'Should have setter action');

      const changes = setterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('string value'), 'Setter should have string parameter');
    });

    it('should generate setter for mapping type variable', () => {
      const document = TextDocument.create(
        'file:///test.pike',
        'pike',
        1,
        'mapping(string:int) _data;\n'
      );
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 26 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_data',
          kind: 'variable',
          type: 'mapping(string:int)',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const setterAction = result.find(a => a.title.includes('Setter'));
      assert.ok(setterAction, 'Should have setter action');

      const changes = setterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(
        edit.newText.includes('mapping(string:int) value'),
        'Setter should have correct mapping parameter'
      );
    });
  });

  describe('Getter and Setter Generation', () => {
    it('should generate both getter and setter in one action', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_value',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const bothAction = result.find(a => a.title.includes('Getter and Setter'));
      assert.ok(bothAction, 'Should have combined getter/setter action');

      const changes = bothAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.includes('get_value()'), 'Should include getter');
      assert.ok(edit.newText.includes('set_value('), 'Should include setter');
    });
  });

  describe('Input Validation', () => {
    it('should return empty array when symbol is not a variable', () => {
      const document = TextDocument.create(
        'file:///test.pike',
        'pike',
        1,
        'int main() { return 0; }\n'
      );
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 20 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: 'main',
          kind: 'function',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      assert.equal(result.length, 0, 'Should return empty array for non-variable');
    });

    it('should return empty array when no symbol matches line', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_other',
          kind: 'variable',
          type: 'int',
          position: { line: 5 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      assert.equal(result.length, 0, 'Should return empty when no symbol matches');
    });

    it('should return empty array when symbols array is empty', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };

      const result = getGenerateGetterSetterActions(document, uri, range, []);

      assert.equal(result.length, 0, 'Should return empty for empty symbols');
    });
  });

  describe('Context Filtering', () => {
    it('should filter by onlyKinds when provided', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_value',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols, [
        CodeActionKind.QuickFix,
      ]);

      assert.equal(result.length, 0, 'Should return empty when filtered by QuickFix');
    });

    it('should return actions when filter includes Refactor', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 11 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_value',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols, [
        CodeActionKind.Refactor,
      ]);

      assert.ok(result.length > 0, 'Should return actions when filter includes Refactor');
    });
  });

  describe('Indentation Handling', () => {
    it('should preserve indentation from original line', () => {
      const document = TextDocument.create('file:///test.pike', 'pike', 1, '    int _value;\n');
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 15 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: '_value',
          kind: 'variable',
          type: 'int',
          position: { line: 1 },
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      const getterAction = result.find(a => a.title.includes('Getter'));
      assert.ok(getterAction, 'Should have getter action');

      const changes = getterAction.edit!.changes as Record<string, TextEdit[]>;
      const edit = changes[uri]![0];
      assert.ok(edit.newText.startsWith('\n    '), 'Should preserve 4-space indentation');
    });
  });

  describe('Nested Symbol Search', () => {
    it('should find symbol in nested children when parent not at line', () => {
      const document = TextDocument.create(
        'file:///test.pike',
        'pike',
        1,
        'class SomeClass {\n    int _value;\n}\n'
      );
      const uri = 'file:///test.pike';
      const range = {
        start: { line: 1, character: 4 },
        end: { line: 1, character: 15 },
      };
      const symbols: PikeSymbol[] = [
        {
          name: 'SomeClass',
          kind: 'class',
          modifiers: ['public'],
          position: { line: 1 },
          children: [
            {
              name: '_value',
              kind: 'variable',
              modifiers: ['private'],
              type: 'int',
              position: { line: 2 },
            },
          ],
        },
      ];

      const result = getGenerateGetterSetterActions(document, uri, range, symbols);

      assert.ok(result.length > 0, 'Should find symbol in nested children');
    });
  });
});
