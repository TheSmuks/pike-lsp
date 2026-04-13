/**
 * Roxen Inherit Detection: parser-based edge cases
 * KB-1504: Verifies bridge.parse() symbol detection handles multi-line inherits
 * and commented-out inherits correctly — edge cases that regex-based scanning misses.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { parseRoxenConfig, validateRoxenConfig } from '../features/roxen/config.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/** Helper: module_type constant symbol. */
function moduleTypeSymbol(value: string): PikeSymbol {
  return {
    kind: 'constant',
    name: 'module_type',
    modifiers: [],
    type: {
      kind: 'name' as const,
      name: value,
    } as unknown as import('@pike-lsp/pike-bridge').PikeType,
  };
}

describe('Roxen inherit detection: multi-line and commented-out inherits', () => {
  it('should detect inherit "module" from symbols regardless of source text formatting', () => {
    // The source text has a multi-line inherit, but we rely on symbols, not text scanning.
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: '"module"', modifiers: [], classname: '"module"' },
    ];
    const result = parseRoxenConfig('inherit\n  "module";', { symbols });
    assert.strictEqual(
      result.isInheritModule,
      true,
      'Multi-line inherit should be detected via symbols'
    );
  });

  it('should detect inherit "roxen" from symbols regardless of source text formatting', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: '"roxen"', modifiers: [], classname: '"roxen"' },
    ];
    const result = parseRoxenConfig('inherit\n\n  "roxen";', { symbols });
    assert.strictEqual(
      result.isInheritModule,
      true,
      'Multi-line roxen inherit should be detected via symbols'
    );
  });

  it('should not false-positive on commented-out inherit when only symbols are provided', () => {
    // Source text has a commented-out inherit, but symbols don't include it.
    const symbols: PikeSymbol[] = [];
    const result = parseRoxenConfig('// inherit "module";\nint x = 1;', { symbols });
    assert.strictEqual(
      result.isInheritModule,
      false,
      'Commented-out inherit should not be detected'
    );
  });

  it('should not false-positive on commented-out inherit when no bridge data provided', () => {
    const result = parseRoxenConfig('// inherit "module";\n/* inherit "roxen"; */\nint x = 1;');
    assert.strictEqual(
      result.isInheritModule,
      false,
      'Commented-out inherits should not be detected without bridge data'
    );
  });

  it('should correctly combine multi-line inherit detection with module_type', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: '"module"', modifiers: [], classname: '"module"' },
      moduleTypeSymbol('MODULE_TAG'),
    ];
    const result = parseRoxenConfig('inherit\n  "module";\n\nconstant module_type = MODULE_TAG;', {
      symbols,
    });
    assert.strictEqual(result.isInheritModule, true);
    assert.strictEqual(result.moduleType, 'MODULE_TAG');
  });

  it('should warn about missing module_type when multi-line inherit is detected', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: '"module"', modifiers: [], classname: '"module"' },
    ];
    const diagnostics = validateRoxenConfig('inherit\n  "module";', { symbols });
    assert.ok(
      diagnostics.some(d => d.message.includes('module_type')),
      'Should warn about missing module_type for multi-line inherit'
    );
  });

  it('should detect inherit from inherits cache even with commented-out inherit in source', () => {
    const result = parseRoxenConfig('// inherit "module";\ninherit "module";', {
      inherits: [{ path: 'module' }],
    });
    assert.strictEqual(
      result.isInheritModule,
      true,
      'Inherits cache should take priority over source text'
    );
  });

  it('should handle inherit symbol with extra whitespace in classname', () => {
    // StripQuotes should handle various quoting
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'module', modifiers: [], classname: 'module' },
    ];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(result.isInheritModule, true, 'Unquoted inherit target should be detected');
  });

  it('should handle mixed-case inherit targets via symbols', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'Module', modifiers: [], classname: 'Module' },
    ];
    const result = parseRoxenConfig('anything', { symbols });
    assert.strictEqual(
      result.isInheritModule,
      true,
      'Mixed-case inherit should be detected (case-insensitive)'
    );
  });

  it('should prefer inherits cache over symbols for multi-line inherit', () => {
    const symbols: PikeSymbol[] = [
      { kind: 'inherit', name: 'SomeOtherClass', modifiers: [], classname: 'SomeOtherClass' },
    ];
    const result = parseRoxenConfig('inherit\n  "module";', {
      inherits: [{ path: 'module' }],
      symbols,
    });
    assert.strictEqual(
      result.isInheritModule,
      true,
      'Inherits cache should take priority over symbols'
    );
  });
});
