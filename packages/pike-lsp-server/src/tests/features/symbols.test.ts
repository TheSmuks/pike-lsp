/**
 * Symbols Feature Tests
 *
 * Issue #991: Unit tests for symbols.ts
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { SymbolKind } from 'vscode-languageserver/node.js';
import type { PikeSymbol, PikeMethod } from '@pike-lsp/pike-bridge';
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
    it('should format method signature with returnType and argTypes', () => {
      const symbol = {
        kind: 'method',
        returnType: { name: 'int' },
        argTypes: [{ name: 'string' }, { name: 'mixed' }],
      } as PikeMethod;
      assert.strictEqual(getSymbolDetail(symbol), 'int(string, mixed)');
    });

    it('should format method signature with empty argTypes', () => {
      const symbol = {
        kind: 'method',
        returnType: { name: 'void' },
        argTypes: [],
      } as PikeMethod;
      assert.strictEqual(getSymbolDetail(symbol), 'void()');
    });

    it('should use mixed for null argType entries', () => {
      const symbol = {
        kind: 'method',
        returnType: { name: 'int' },
        argTypes: [{ name: 'string' }, null],
      } as PikeMethod;
      assert.strictEqual(getSymbolDetail(symbol), 'int(string, mixed)');
    });

    it('should use mixed for argType without name', () => {
      const symbol = {
        kind: 'method',
        returnType: { name: 'int' },
        argTypes: [{ name: 'string' }, {}],
      } as PikeMethod;
      assert.strictEqual(getSymbolDetail(symbol), 'int(string, mixed)');
    });

    it('should use mixed for returnType without name', () => {
      const symbol = {
        kind: 'method',
        returnType: {},
        argTypes: [{ name: 'string' }],
      } as PikeMethod;
      assert.strictEqual(getSymbolDetail(symbol), 'mixed(string)');
    });

    it('should return formatted type for symbol with type field', () => {
      const symbol = {
        type: { name: 'string' },
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), 'string');
    });

    it('should return undefined when no type info available', () => {
      const symbol = {
        name: 'myVar',
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), undefined);
    });

    it('should add inherited info with from clause', () => {
      const symbol = {
        type: { name: 'int' },
        inherited: true,
        inheritedFrom: 'ParentClass',
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), 'int (from ParentClass)');
    });

    it('should add inherited info without from clause', () => {
      const symbol = {
        type: { name: 'int' },
        inherited: true,
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), 'int (inherited)');
    });

    it('should add conditional info with #if', () => {
      const symbol = {
        type: { name: 'int' },
        conditional: true,
        branch: 0,
        condition: 'CONFIG_DEBUG',
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), 'int  [#if CONFIG_DEBUG]');
    });

    it('should add conditional info with #elif', () => {
      const symbol = {
        type: { name: 'string' },
        conditional: true,
        branch: 1,
        condition: 'CONFIG_PROD',
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), 'string  [#elif CONFIG_PROD]');
    });

    it('should combine inherited and conditional info for method', () => {
      const symbol = {
        kind: 'method',
        returnType: { name: 'void' },
        argTypes: [],
        inherited: true,
        inheritedFrom: 'BaseClass',
        conditional: true,
        branch: 0,
        condition: 'FEATURE_ENABLED',
      } as PikeMethod;
      assert.strictEqual(getSymbolDetail(symbol), 'void() (from BaseClass)  [#if FEATURE_ENABLED]');
    });

    it('should handle conditional only without type info', () => {
      const symbol = {
        conditional: true,
        branch: 0,
        condition: 'DEBUG',
      } as PikeSymbol;
      assert.strictEqual(getSymbolDetail(symbol), '[#if DEBUG]');
    });
  });
});
