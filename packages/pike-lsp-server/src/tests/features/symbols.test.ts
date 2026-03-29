/**
 * Symbols Feature Tests
 *
 * Issue #991: Unit tests for symbols.ts
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
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
      const symbol = {
        returnType: { name: 'int' },
        argTypes: [{ name: 'string' }, { name: 'mixed' }],
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'int(string, mixed)');
    });

    it('should format function signature with empty argTypes', () => {
      const symbol = {
        returnType: { name: 'void' },
        argTypes: [],
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'void()');
    });

    it('should use mixed for missing argType names', () => {
      const symbol = {
        returnType: { name: 'int' },
        argTypes: [{ name: 'string' }, {}],
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'int(string, mixed)');
    });

    it('should use mixed for missing returnType name', () => {
      const symbol = {
        returnType: {},
        argTypes: [{ name: 'string' }],
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'mixed(string)');
    });

    it('should return type.name for symbol with type field', () => {
      const symbol = {
        type: { name: 'string' },
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'string');
    });

    it('should return undefined when no type info available', () => {
      const symbol = {
        name: 'myVar',
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, undefined);
    });

    it('should add inherited info with from clause', () => {
      const symbol = {
        type: { name: 'int' },
        inherited: true,
        inheritedFrom: 'ParentClass',
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'int (from ParentClass)');
    });

    it('should add inherited info without from clause', () => {
      const symbol = {
        type: { name: 'int' },
        inherited: true,
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'int (inherited)');
    });

    it('should add conditional info with #if', () => {
      const symbol = {
        type: { name: 'int' },
        conditional: true,
        branch: 0,
        condition: 'CONFIG_DEBUG',
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'int  [#if CONFIG_DEBUG]');
    });

    it('should add conditional info with #elif', () => {
      const symbol = {
        type: { name: 'string' },
        conditional: true,
        branch: 1,
        condition: 'CONFIG_PROD',
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'string  [#elif CONFIG_PROD]');
    });

    it('should combine inherited and conditional info', () => {
      const symbol = {
        returnType: { name: 'void' },
        argTypes: [],
        inherited: true,
        inheritedFrom: 'BaseClass',
        conditional: true,
        branch: 0,
        condition: 'FEATURE_ENABLED',
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, 'void() (from BaseClass)  [#if FEATURE_ENABLED]');
    });

    it('should handle conditional only without type info', () => {
      const symbol = {
        conditional: true,
        branch: 0,
        condition: 'DEBUG',
      };
      const result = getSymbolDetail(symbol as any);
      assert.strictEqual(result, '[#if DEBUG]');
    });
  });
});
