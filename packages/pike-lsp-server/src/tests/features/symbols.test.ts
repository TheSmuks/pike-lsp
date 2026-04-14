/**
 * Symbols Feature Tests
 *
 * Issue #991: Unit tests for symbols.ts
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { PikeSymbol, PikeMethod } from '@pike-lsp/pike-bridge';
import { SymbolKind } from 'vscode-languageserver/node.js';
import { convertSymbolKind, getSymbolDetail } from '../../features/symbols.js';

describe('symbols', () => {
  describe('convertSymbolKind', () => {
    it('should convert class to SymbolKind.Class', () => {
      assert.strictEqual(convertSymbolKind('class'), SymbolKind.Class);
    });

    it('should convert method to SymbolKind.Method', () => {
      assert.strictEqual(convertSymbolKind('method'), SymbolKind.Method);
    });

    it('should convert variable to SymbolKind.Variable', () => {
      assert.strictEqual(convertSymbolKind('variable'), SymbolKind.Variable);
    });

    it('should convert constant to SymbolKind.Constant', () => {
      assert.strictEqual(convertSymbolKind('constant'), SymbolKind.Constant);
    });

    it('should convert typedef to SymbolKind.TypeParameter', () => {
      assert.strictEqual(convertSymbolKind('typedef'), SymbolKind.TypeParameter);
    });

    it('should convert enum to SymbolKind.Enum', () => {
      assert.strictEqual(convertSymbolKind('enum'), SymbolKind.Enum);
    });

    it('should convert enum_constant to SymbolKind.EnumMember', () => {
      assert.strictEqual(convertSymbolKind('enum_constant'), SymbolKind.EnumMember);
    });

    it('should convert inherit to SymbolKind.Class', () => {
      assert.strictEqual(convertSymbolKind('inherit'), SymbolKind.Class);
    });

    it('should convert import to SymbolKind.Module', () => {
      assert.strictEqual(convertSymbolKind('import'), SymbolKind.Module);
    });

    it('should convert module to SymbolKind.Module', () => {
      assert.strictEqual(convertSymbolKind('module'), SymbolKind.Module);
    });

    it('should return SymbolKind.Variable for unknown kinds', () => {
      assert.strictEqual(convertSymbolKind('unknown_kind'), SymbolKind.Variable);
      assert.strictEqual(convertSymbolKind(''), SymbolKind.Variable);
    });
  });

  describe('getSymbolDetail', () => {
    it('should format function signature with returnType and argTypes', () => {
      const symbol: PikeMethod = {
        name: 'foo',
        kind: 'method',
        modifiers: [],
        argNames: ['a', 'b'],
        returnType: { kind: 'name', name: 'int' },
        argTypes: [
          { kind: 'name', name: 'string' },
          { kind: 'name', name: 'mixed' },
        ],
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'int(string, mixed)');
    });

    it('should format function signature with empty argTypes', () => {
      const symbol: PikeMethod = {
        name: 'bar',
        kind: 'method',
        modifiers: [],
        argNames: [],
        returnType: { kind: 'name', name: 'void' },
        argTypes: [],
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'void()');
    });

    it('should use mixed for null argType entries', () => {
      const symbol: PikeMethod = {
        name: 'baz',
        kind: 'method',
        modifiers: [],
        argNames: ['a', 'b'],
        returnType: { kind: 'name', name: 'int' },
        argTypes: [{ kind: 'name', name: 'string' }, null],
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'int(string, mixed)');
    });

    it('should use kind for returnType without name', () => {
      const symbol: PikeMethod = {
        name: 'qux',
        kind: 'method',
        modifiers: [],
        argNames: ['a'],
        returnType: { kind: 'int' },
        argTypes: [{ kind: 'name', name: 'string' }],
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'int(string)');
    });

    it('should return type name for symbol with PikeNameType', () => {
      const symbol: PikeSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        type: { kind: 'name', name: 'string' },
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'string');
    });

    it('should return undefined when no type info available', () => {
      const symbol: PikeSymbol = {
        name: 'myVar',
        kind: 'variable',
        modifiers: [],
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, undefined);
    });

    it('should add inherited info with from clause', () => {
      const symbol: PikeSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        type: { kind: 'name', name: 'int' },
        inherited: true,
        inheritedFrom: 'ParentClass',
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'int (from ParentClass)');
    });

    it('should add inherited info without from clause', () => {
      const symbol: PikeSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        type: { kind: 'name', name: 'int' },
        inherited: true,
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'int (inherited)');
    });

    it('should add conditional info with #if', () => {
      const symbol: PikeSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        type: { kind: 'name', name: 'int' },
        conditional: true,
        branch: 0,
        condition: 'CONFIG_DEBUG',
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'int  [#if CONFIG_DEBUG]');
    });

    it('should add conditional info with #elif', () => {
      const symbol: PikeSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        type: { kind: 'name', name: 'string' },
        conditional: true,
        branch: 1,
        condition: 'CONFIG_PROD',
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'string  [#elif CONFIG_PROD]');
    });

    it('should combine inherited and conditional info on method', () => {
      const symbol: PikeMethod = {
        name: 'run',
        kind: 'method',
        modifiers: [],
        argNames: [],
        returnType: { kind: 'name', name: 'void' },
        argTypes: [],
        inherited: true,
        inheritedFrom: 'BaseClass',
        conditional: true,
        branch: 0,
        condition: 'FEATURE_ENABLED',
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, 'void() (from BaseClass)  [#if FEATURE_ENABLED]');
    });

    it('should handle conditional only without type info', () => {
      const symbol: PikeSymbol = {
        name: 'x',
        kind: 'variable',
        modifiers: [],
        conditional: true,
        branch: 0,
        condition: 'DEBUG',
      };
      const result = getSymbolDetail(symbol);
      assert.strictEqual(result, '[#if DEBUG]');
    });
  });
});
