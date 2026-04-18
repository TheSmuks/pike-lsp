/**
 * Scenario tests for dependency resolution via bridge API (Issue #2166).
 *
 * TC5: When bridge resolveInclude throws, diagnostics still publish and
 * cache is built (possibly without dependencies).
 *
 * Tests the resolveDependenciesViaBridge function through its public API.
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { resolveDependenciesViaBridge } from '../features/diagnostics/dependency-resolver.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

// ---------------------------------------------------------------------------
// Noop logger
// ---------------------------------------------------------------------------

function testLogger(): Logger {
  return new Logger('test');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIncludeSymbol(classname: string): PikeSymbol {
  return {
    kind: 'include',
    name: 'include',
    classname,
    line: 1,
    column: 1,
    modifiers: [],
  } as unknown as PikeSymbol;
}

function makeImportSymbol(classname: string): PikeSymbol {
  return {
    kind: 'import',
    name: 'import',
    classname,
    line: 1,
    column: 1,
    modifiers: [],
  } as unknown as PikeSymbol;
}

interface MockBridgeOverrides {
  resolveIncludeResult?: { path: string; exists: boolean; originalPath: string };
  parseFileSymbolsResult?: PikeSymbol[];
  resolveStdlibResult?: { found: number };
  resolveIncludeError?: Error;
  parseFileSymbolsError?: Error;
}

function createMockBridgeManager(overrides: MockBridgeOverrides = {}): BridgeManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innerBridge: any = {
    async resolveInclude(_path: string, _currentUri: string) {
      if (overrides.resolveIncludeError) throw overrides.resolveIncludeError;
      return overrides.resolveIncludeResult ?? { path: _path, exists: true, originalPath: _path };
    },
    async resolveStdlib(_modulePath: string) {
      return overrides.resolveStdlibResult ?? { found: 0 };
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bridgeManager: any = {
    bridge: innerBridge,
    async parseFileSymbols(_filePath: string) {
      if (overrides.parseFileSymbolsError) throw overrides.parseFileSymbolsError;
      return overrides.parseFileSymbolsResult ?? [];
    },
  };

  return bridgeManager as BridgeManager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveDependenciesViaBridge', () => {
  let log: Logger;

  beforeEach(() => {
    log = testLogger();
  });

  describe('TC5: bridge failure — diagnostics still publish', () => {
    it('returns empty dependencies when resolveInclude throws', async () => {
      const bridge = createMockBridgeManager({
        resolveIncludeError: new Error('Include path not found'),
      });
      const symbols = [makeIncludeSymbol('missing.pike')];
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', symbols, log);

      assert.strictEqual(result.includes.length, 0, 'should have no includes on resolve failure');
      assert.strictEqual(result.imports.length, 0, 'should have no imports');
    });

    it('returns empty dependencies when bridge is null', async () => {
      const bridge = createMockBridgeManager();
      // Override bridge to null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (bridge as any).bridge = null;

      const symbols = [makeIncludeSymbol('utils.pike')];
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', symbols, log);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(result.imports.length, 0);
    });

    it('skips failed includes and resolves remaining ones', async () => {
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = createMockBridgeManager() as any;
      bridge.bridge.resolveInclude = async (path: string) => {
        callCount++;
        if (path === 'bad.pike') throw new Error('not found');
        return { path: `/abs/${path}`, exists: true, originalPath: path };
      };
      bridge.parseFileSymbols = async (filePath: string) => {
        return [
          { name: `sym_from_${filePath}`, kind: 'function', line: 1, column: 1, modifiers: [] },
        ];
      };

      const symbols = [makeIncludeSymbol('bad.pike'), makeIncludeSymbol('good.pike')];
      const result = await resolveDependenciesViaBridge(
        bridge as unknown as BridgeManager,
        'file:///test.pike',
        symbols,
        log
      );

      assert.strictEqual(result.includes.length, 1, 'should resolve only the good include');
      assert.strictEqual(result.includes[0]!.originalPath, 'good.pike');
      assert.strictEqual(result.includes[0]!.resolvedPath, '/abs/good.pike');
      assert.strictEqual(result.includes[0]!.symbols[0]!.name, 'sym_from_/abs/good.pike');
      assert.strictEqual(callCount, 2, 'should attempt both resolves');
    });

    it('returns partial dependencies when parseFileSymbols throws', async () => {
      let callCount = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = createMockBridgeManager() as any;
      bridge.bridge.resolveInclude = async (path: string) => {
        callCount++;
        return { path: `/abs/${path}`, exists: true, originalPath: path };
      };
      bridge.parseFileSymbols = async (filePath: string) => {
        if (filePath.includes('corrupt')) throw new Error('parse failed');
        return [{ name: 'ok', kind: 'function', line: 1, column: 1, modifiers: [] }];
      };

      const symbols = [makeIncludeSymbol('corrupt.pike'), makeIncludeSymbol('ok.pike')];
      const result = await resolveDependenciesViaBridge(
        bridge as unknown as BridgeManager,
        'file:///test.pike',
        symbols,
        log
      );

      assert.strictEqual(
        result.includes.length,
        1,
        'should include only the successfully parsed file'
      );
      assert.strictEqual(result.includes[0]!.originalPath, 'ok.pike');
    });
  });

  describe('normal resolution', () => {
    it('resolves includes with symbols', async () => {
      const sampleSymbols: PikeSymbol[] = [
        {
          kind: 'function',
          name: 'helper',
          line: 10,
          column: 1,
          modifiers: [],
        } as unknown as PikeSymbol,
        {
          kind: 'variable',
          name: 'x',
          line: 20,
          column: 1,
          modifiers: [],
        } as unknown as PikeSymbol,
      ];
      const bridge = createMockBridgeManager({
        resolveIncludeResult: { path: '/src/utils.pike', exists: true, originalPath: 'utils.pike' },
        parseFileSymbolsResult: sampleSymbols,
      });
      const symbols = [makeIncludeSymbol('utils.pike')];
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', symbols, log);

      assert.strictEqual(result.includes.length, 1);
      assert.strictEqual(result.includes[0]!.originalPath, 'utils.pike');
      assert.strictEqual(result.includes[0]!.resolvedPath, '/src/utils.pike');
      assert.strictEqual(result.includes[0]!.symbols.length, 2);
      assert.strictEqual(result.includes[0]!.symbols[0]!.name, 'helper');
    });

    it('resolves stdlib imports as isStdlib=true', async () => {
      const bridge = createMockBridgeManager({
        resolveStdlibResult: { found: 1 },
      });
      const symbols = [makeImportSymbol('Stdio')];
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', symbols, log);

      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0]!.modulePath, 'Stdio');
      assert.strictEqual(result.imports[0]!.isStdlib, true, 'Stdio should be detected as stdlib');
    });

    it('resolves workspace imports with symbols', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = createMockBridgeManager() as any;
      bridge.bridge.resolveInclude = async (path: string) => {
        return { path: `/abs/${path}`, exists: true, originalPath: path };
      };
      bridge.bridge.resolveStdlib = async () => ({ found: 0 });
      bridge.parseFileSymbols = async (_filePath: string) => {
        return [{ name: 'mod_sym', kind: 'function', line: 1, column: 1, modifiers: [] }];
      };

      const symbols = [makeImportSymbol('MyModule')];
      const result = await resolveDependenciesViaBridge(
        bridge as unknown as BridgeManager,
        'file:///test.pike',
        symbols,
        log
      );

      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0]!.modulePath, 'MyModule');
      assert.strictEqual(result.imports[0]!.isStdlib, false, 'MyModule should not be stdlib');
      assert.strictEqual(result.imports[0]!.resolvedPath, '/abs/MyModule');
      assert.strictEqual(result.imports[0]!.symbols?.length, 1);
      assert.strictEqual(result.imports[0]!.symbols?.[0]!.name, 'mod_sym');
    });

    it('returns empty for symbols without include/import kind', async () => {
      const bridge = createMockBridgeManager();
      const symbols: PikeSymbol[] = [
        {
          kind: 'function',
          name: 'foo',
          line: 1,
          column: 1,
          modifiers: [],
        } as unknown as PikeSymbol,
        {
          kind: 'variable',
          name: 'bar',
          line: 2,
          column: 1,
          modifiers: [],
        } as unknown as PikeSymbol,
      ];
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', symbols, log);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(result.imports.length, 0);
    });

    it('excludes include when path does not exist', async () => {
      const bridge = createMockBridgeManager({
        resolveIncludeResult: { path: '/absent.pike', exists: false, originalPath: 'absent.pike' },
      });
      const symbols = [makeIncludeSymbol('absent.pike')];
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', symbols, log);

      assert.strictEqual(result.includes.length, 0);
    });

    it('handles mixed includes and imports', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bridge = createMockBridgeManager() as any;
      bridge.bridge.resolveInclude = async (path: string) => {
        return { path: `/abs/${path}`, exists: true, originalPath: path };
      };
      bridge.bridge.resolveStdlib = async (mod: string) => {
        return { found: mod === 'Stdio' ? 1 : 0 };
      };
      bridge.parseFileSymbols = async () => {
        return [{ name: 'inc_sym', kind: 'function', line: 1, column: 1, modifiers: [] }];
      };

      const symbols = [
        makeIncludeSymbol('header.h'),
        makeImportSymbol('Stdio'),
        makeImportSymbol('LocalMod'),
      ];
      const result = await resolveDependenciesViaBridge(
        bridge as unknown as BridgeManager,
        'file:///test.pike',
        symbols,
        log
      );

      assert.strictEqual(result.includes.length, 1);
      assert.strictEqual(result.includes[0]!.originalPath, 'header.h');
      assert.strictEqual(result.imports.length, 2);
      assert.strictEqual(result.imports[0]!.modulePath, 'Stdio');
      assert.strictEqual(result.imports[0]!.isStdlib, true);
      assert.strictEqual(result.imports[1]!.modulePath, 'LocalMod');
      assert.strictEqual(result.imports[1]!.isStdlib, false);
      assert.strictEqual(result.imports[1]!.resolvedPath, '/abs/LocalMod');
    });

    it('returns empty dependencies for empty symbols array', async () => {
      const bridge = createMockBridgeManager();
      const result = await resolveDependenciesViaBridge(bridge, 'file:///test.pike', [], log);

      assert.strictEqual(result.includes.length, 0);
      assert.strictEqual(result.imports.length, 0);
    });
  });
});
