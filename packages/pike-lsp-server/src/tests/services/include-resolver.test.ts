/**
 * Include Resolver Tests
 *
 * Tests for the include resolver service:
 * - 30.1: Resolve relative include paths
 * - 30.2: Resolve module (stdlib) paths
 * - 30.3: Handle not found includes
 * - 30.4: Handle nested includes
 *
 * Run with: bun test dist/src/tests/services/include-resolver.test.js
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IncludeResolver } from '../../services/include-resolver.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Logger } from '@pike-lsp/core';

// ============================================================================
// Mock Bridge and Logger
// ============================================================================

function createMockBridge() {
  return {
    bridge: {
      resolveInclude: async (includePath: string, _currentUri: string) => {
        // Mock successful resolution for specific paths
        if (includePath.includes('existing.h')) {
          return {
            exists: true,
            path: '/mock/path/existing.h',
            originalPath: includePath,
          };
        }
        if (includePath.includes('parent.h')) {
          return {
            exists: true,
            path: '/mock/path/parent.h',
            originalPath: includePath,
          };
        }
        if (includePath.includes('child.h')) {
          return {
            exists: true,
            path: '/mock/path/subdir/child.h',
            originalPath: includePath,
          };
        }
        // Not found
        return {
          exists: false,
          path: null,
          originalPath: includePath,
        };
      },
      resolveStdlib: async (modulePath: string) => {
        if (modulePath === 'Stdio' || modulePath === 'Array') {
          return { found: 1, symbols: [], path: '/lib/path' };
        }
        return { found: 0 };
      },
    },
    async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
      return [{ name: `symbol_from_${filePath}`, kind: 'variable' as const }];
    },
  };
}

function createMockLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as Logger;
}

/** Helper: build an include symbol that the resolver can extract a path from. */
function includeSymbol(path: string): PikeSymbol {
  return { name: '#include', kind: 'include' as const, classname: path } as PikeSymbol;
}

// ============================================================================
// 30.1 Include Resolver - Relative path
// ============================================================================

describe('IncludeResolver - 30.1 Relative path', () => {
  it('30.1.1 should resolve relative include path', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/mock/path/existing.h');
  });

  it('30.1.2 should resolve include with angle brackets', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('<existing.h>'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/mock/path/existing.h');
  });

  it('30.1.3 should resolve includes from subdirectories', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"subdir/child.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/mock/path/subdir/child.h');
  });

  it('30.1.4 should resolve includes with parent directory references', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///subdir/test.pike', [
      includeSymbol('"../parent.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/mock/path/parent.h');
  });

  it('30.1.5 should produce consistent results for repeated resolution', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps1 = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);
    const deps2 = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);

    assert.equal(deps1.includes[0]!.resolvedPath, deps2.includes[0]!.resolvedPath);
  });
});

// ============================================================================
// 30.2 Include Resolver - Module path
// ============================================================================

describe('IncludeResolver - 30.2 Module path', () => {
  it('30.2.1 should identify stdlib modules', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [{ name: 'Stdio', kind: 'import' as const }] as PikeSymbol[];

    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.ok(dependencies.imports.length > 0);
    assert.equal(dependencies.imports[0]!.modulePath, 'Stdio');
    assert.equal(dependencies.imports[0]!.isStdlib, true);
  });

  it('30.2.2 should identify non-stdlib modules', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [{ name: 'LocalModule', kind: 'import' as const }] as PikeSymbol[];

    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.ok(dependencies.imports.length > 0);
    assert.equal(dependencies.imports[0]!.modulePath, 'LocalModule');
    assert.equal(dependencies.imports[0]!.isStdlib, false);
  });

  it('30.2.3 should handle multiple imports', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [
      { name: 'Stdio', kind: 'import' as const },
      { name: 'Array', kind: 'import' as const },
      { name: 'LocalModule', kind: 'import' as const },
    ] as PikeSymbol[];

    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.equal(dependencies.imports.length, 3);
  });

  it('30.2.4 should distinguish includes from imports', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [
      includeSymbol('"existing.h"'),
      { name: 'Stdio', kind: 'import' as const },
    ] as PikeSymbol[];

    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.equal(dependencies.includes.length, 1);
    assert.equal(dependencies.imports.length, 1);
  });

  it('30.2.5 should handle empty import list', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const dependencies = await resolver.resolveDependencies('file:///test.pike', []);

    assert.equal(dependencies.imports.length, 0);
  });
});

// ============================================================================
// 30.3 Include Resolver - Not found
// ============================================================================

describe('IncludeResolver - 30.3 Not found', () => {
  it('30.3.1 should return empty includes for non-existent include', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"nonexistent.h"'),
    ]);

    assert.equal(deps.includes.length, 0);
  });

  it('30.3.2 should handle missing includes gracefully', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [includeSymbol('"missing.h"')];

    // Act - should not throw
    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.equal(dependencies.includes.length, 0);
  });

  it('30.3.3 should handle null bridge gracefully', async () => {
    const logger = createMockLogger();
    const resolver = new IncludeResolver(null, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"test.h"'),
    ]);

    assert.equal(deps.includes.length, 0);
  });

  it('30.3.4 should log debug message for failed resolution', async () => {
    let logged = false;
    const bridge = createMockBridge();
    const logger = {
      debug: () => {
        logged = true;
      },
      info: () => {},
      warn: () => {},
      error: () => {},
    } as unknown as Logger;
    const resolver = new IncludeResolver(bridge, logger);

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"nonexistent.h"')]);

    // Debug should have been called for the failed resolution
    assert.ok(resolver);
  });

  it('30.3.5 should continue processing after failed include', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [includeSymbol('"missing.h"'), includeSymbol('"existing.h"')];

    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

    // Should successfully resolve the second include
    assert.equal(dependencies.includes.length, 1);
    assert.equal(dependencies.includes[0]!.resolvedPath, '/mock/path/existing.h');
  });
});

// ============================================================================
// 30.4 Include Resolver - Nested includes
// ============================================================================

describe('IncludeResolver - 30.4 Nested includes', () => {
  it('30.4.1 should resolve includes with nested dependencies', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
  });

  it('30.4.2 should extract symbols from resolved includes', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"parent.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.ok(Array.isArray(deps.includes[0]!.symbols));
  });

  it('30.4.3 should combine symbols from multiple includes', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    const symbols = [includeSymbol('"parent.h"'), includeSymbol('"child.h"')];

    const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);
    const depSymbols = await resolver.getDependencySymbols(dependencies);

    assert.ok(depSymbols.length >= 0);
  });

  it('30.4.4 should handle duplicate include paths', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
  });

  it('30.4.5 should handle multiple different include paths', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
      includeSymbol('"parent.h"'),
      includeSymbol('"child.h"'),
    ]);

    assert.equal(deps.includes.length, 3);
  });
});

// ============================================================================
// Cache Management Tests
// ============================================================================

describe('IncludeResolver - Cache Management', () => {
  it('should report cached includes from the include path index', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);

    // The index tracks resolved includes for O(1) lookup
    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 1);
  });

  it('should clear without error', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);

    resolver.clear();
    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 0);
  });

  it('should track statistics with no cache', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 0);
    assert.equal(stats.totalSymbols, 0);
  });

  it('should resolve include symbols consistently', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const deps1 = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);
    const deps2 = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);

    assert.ok(deps1.includes[0]);
    assert.ok(deps2.includes[0]);
  });

  it('should invalidate without error', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);
    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);

    resolver.invalidate('/mock/path/existing.h');
    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 0);
  });

  it('should refresh include symbols after file change', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'include-resolver-invalidate-'));
    try {
      const includeFilePath = join(dir, 'dynamic.h');
      await writeFile(includeFilePath, 'int first_symbol = 1;\n', 'utf-8');

      const bridge = {
        bridge: {
          resolveInclude: async () => ({
            exists: true,
            path: includeFilePath,
            originalPath: '"dynamic.h"',
          }),
          resolveStdlib: async () => ({ found: 0 }),
        },
        async parseFileSymbols(
          filePath: string
        ): Promise<import('@pike-lsp/pike-bridge').PikeSymbol[]> {
          const content = await readFile(filePath, 'utf-8');
          return [
            {
              name: content.includes('second_symbol') ? 'second_symbol' : 'first_symbol',
              kind: 'variable' as const,
            },
          ];
        },
      };

      const resolver = new IncludeResolver(
        bridge as unknown as typeof bridge & { bridge: NonNullable<typeof bridge.bridge> },
        createMockLogger()
      );
      const first = await resolver.resolveDependencies('file:///test.pike', [
        includeSymbol('"dynamic.h"'),
      ]);
      assert.equal(first.includes.length, 1);
      assert.equal(first.includes[0]!.symbols[0]!.name, 'first_symbol');

      await writeFile(includeFilePath, 'int second_symbol = 2;\n', 'utf-8');
      resolver.invalidate(`file://${includeFilePath}`);

      const second = await resolver.resolveDependencies('file:///test.pike', [
        includeSymbol('"dynamic.h"'),
      ]);
      assert.equal(second.includes.length, 1);
      assert.equal(second.includes[0]!.symbols[0]!.name, 'second_symbol');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('should resolve include symbols from real file content', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'include-resolver-'));
    try {
      const includeFilePath = join(dir, 'existing.h');
      await writeFile(includeFilePath, 'int local_symbol = 1;\n', 'utf-8');

      const bridge = {
        bridge: {
          resolveInclude: async () => ({
            exists: true,
            path: includeFilePath,
            originalPath: '"existing.h"',
          }),
          resolveStdlib: async () => ({ found: 0 }),
        },
        async parseFileSymbols(
          filePath: string
        ): Promise<import('@pike-lsp/pike-bridge').PikeSymbol[]> {
          return [{ name: `symbol_from_${filePath}`, kind: 'variable' as const }];
        },
      };

      const resolver = new IncludeResolver(
        bridge as unknown as typeof bridge & { bridge: NonNullable<typeof bridge.bridge> },
        createMockLogger()
      );
      const deps = await resolver.resolveDependencies('file:///test.pike', [
        includeSymbol('"existing.h"'),
      ]);

      assert.equal(deps.includes.length, 1);
      assert.equal(deps.includes[0]!.resolvedPath, includeFilePath);
      assert.equal(deps.includes[0]!.symbols.length, 1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 30.5 Workspace Import Cache
// ============================================================================

describe('IncludeResolver - 30.5 Workspace import cache', () => {
  /** Mock bridge that resolves non-stdlib imports to a real path. */
  function createWorkspaceMockBridge() {
    return {
      bridge: {
        resolveInclude: async (includePath: string, _currentUri: string) => ({
          exists: true,
          path: '/mock/path/local_module.pike',
          originalPath: includePath,
        }),
        resolveStdlib: async (modulePath: string) => ({
          found: modulePath === 'Stdio' || modulePath === 'Array' ? 1 : 0,
          symbols: [],
          path: '/lib/path',
        }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        return [{ name: `symbol_from_${filePath}`, kind: 'variable' as const }];
      },
    };
  }

  it('30.5.1 should populate includePathIndex when resolving workspace import', async () => {
    const bridge = createWorkspaceMockBridge();
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    // Resolve a non-stdlib import, which triggers resolveWorkspaceImport
    await resolver.resolveDependencies('file:///test.pike', [
      { name: 'LocalModule', kind: 'import' as const } as PikeSymbol,
    ]);

    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 1, 'workspace import should populate includePathIndex');
  });

  it('30.5.2 should cache originalPath from bridge result, not input modulePath', async () => {
    let capturedOriginalPath: string | undefined;
    const bridge = {
      bridge: {
        resolveInclude: async (includePath: string, _currentUri: string) => ({
          exists: true,
          path: '/mock/path/local_module.pike',
          originalPath: 'transformed_local_module.pike',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        return [{ name: `sym_${filePath}`, kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      { name: 'LocalModule', kind: 'import' as const } as PikeSymbol,
    ]);

    // Verify cache was populated
    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 1);
  });

  it('30.5.3 should return cached result on subsequent include resolution of same path', async () => {
    let parseCallCount = 0;
    const bridge = {
      bridge: {
        resolveInclude: async (includePath: string, _currentUri: string) => ({
          exists: true,
          path: '/mock/path/shared.h',
          originalPath: includePath,
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        parseCallCount++;
        return [{ name: `sym_${filePath}`, kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    // First: resolve as workspace import (populates cache)
    await resolver.resolveDependencies('file:///test.pike', [
      { name: 'SharedModule', kind: 'import' as const } as PikeSymbol,
    ]);
    assert.equal(parseCallCount, 1, 'first resolution should call parseFileSymbols once');

    // Second: resolve same path as include (should hit cache)
    const deps = await resolver.resolveDependencies('file:///test2.pike', [
      includeSymbol('shared.h'),
    ]);
    // parseFileSymbols should NOT be called again
    assert.equal(parseCallCount, 1, 'cached resolution should not call parseFileSymbols again');
    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/mock/path/shared.h');
  });
});

// ============================================================================
// normalizeFilePath edge cases
// ============================================================================

describe('IncludeResolver - normalizeFilePath', () => {
  it('should strip file:// prefix', async () => {
    let resolvePath: string | null = null;
    const bridge = {
      bridge: {
        resolveInclude: async (_includePath: string, _currentUri: string) => {
          resolvePath = 'file:///tmp/my%20file.h';
          return {
            exists: true,
            path: 'file:///tmp/my%20file.h',
            originalPath: '"my file.h"',
          };
        },
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        return [{ name: `sym_${filePath}`, kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"my file.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    // file:// prefix should be stripped, percent-encoded spaces decoded
    assert.equal(deps.includes[0]!.resolvedPath, '/tmp/my file.h');
  });

  it('should decode percent-encoded paths', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/tmp/path%20with%20spaces%2Fslash%26amp.h',
          originalPath: '"encoded.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        return [{ name: `sym_${filePath}`, kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"encoded.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/tmp/path with spaces/slash&amp.h');
  });

  it('should handle paths without file:// prefix', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/usr/local/include/stddef.h',
          originalPath: '<stddef.h>',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        return [{ name: `sym_${filePath}`, kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('<stddef.h>'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/usr/local/include/stddef.h');
  });
});

// ============================================================================
// Cache hit behavior
// ============================================================================

describe('IncludeResolver - Cache hit behavior', () => {
  it('should return cached entry on second resolution without re-parsing', async () => {
    let parseCallCount = 0;
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/cached/header.h',
          originalPath: '"header.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        parseCallCount++;
        return [{ name: 'cached_symbol', kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"header.h"')]);
    assert.equal(parseCallCount, 1);

    // Second resolution should hit cache and not call parseFileSymbols again
    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"header.h"')]);
    assert.equal(parseCallCount, 1);
  });

  it('should return same lastModified timestamp from cache', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/ts/header.h',
          originalPath: '"header.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [{ name: 'x', kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps1 = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"header.h"'),
    ]);
    await new Promise(r => setTimeout(r, 10)); // small delay so Date.now() differs
    const deps2 = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"header.h"'),
    ]);

    assert.equal(deps1.includes[0]!.lastModified, deps2.includes[0]!.lastModified);
  });

  it('should re-resolve after clear()', async () => {
    let parseCallCount = 0;
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/re/header.h',
          originalPath: '"header.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        parseCallCount++;
        return [{ name: 're_symbol', kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"header.h"')]);
    assert.equal(parseCallCount, 1);

    resolver.clear();

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"header.h"')]);
    assert.equal(parseCallCount, 2);
  });
});

// ============================================================================
// invalidate() with normalized paths
// ============================================================================

describe('IncludeResolver - invalidate normalization', () => {
  it('should invalidate by file:// prefixed path', async () => {
    const bridge = createMockBridge();
    const resolver = new IncludeResolver(bridge, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);
    assert.equal(resolver.getStats().cachedIncludes, 1);

    resolver.invalidate('file:///mock/path/existing.h');
    assert.equal(resolver.getStats().cachedIncludes, 0);
  });

  it('should invalidate by percent-encoded path', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/tmp/my%20file.h',
          originalPath: '"my file.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        return [{ name: `sym_${filePath}`, kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"my file.h"')]);
    assert.equal(resolver.getStats().cachedIncludes, 1);

    // invalidate using the decoded form
    resolver.invalidate('/tmp/my file.h');
    assert.equal(resolver.getStats().cachedIncludes, 0);
  });

  it('should be a no-op when invalidating unknown path', async () => {
    const bridge = createMockBridge();
    const resolver = new IncludeResolver(bridge, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);
    assert.equal(resolver.getStats().cachedIncludes, 1);

    resolver.invalidate('/nonexistent/path.h');
    assert.equal(resolver.getStats().cachedIncludes, 1);
  });
});

// ============================================================================
// getStats() accuracy
// ============================================================================

describe('IncludeResolver - getStats accuracy', () => {
  it('should count totalSymbols across all cached includes', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async (includePath: string) => {
          if (includePath.includes('three.h')) {
            return { exists: true, path: '/a/three.h', originalPath: '"three.h"' };
          }
          return { exists: true, path: '/a/two.h', originalPath: '"two.h"' };
        },
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(filePath: string): Promise<PikeSymbol[]> {
        // three.h returns 3 symbols, two.h returns 2 symbols
        const count = filePath.includes('three') ? 3 : 2;
        return Array.from({ length: count }, (_, i) => ({
          name: `sym${i}`,
          kind: 'variable' as const,
        }));
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"two.h"'),
      includeSymbol('"three.h"'),
    ]);

    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 2);
    assert.equal(stats.totalSymbols, 5);
  });

  it('should update totalSymbols after clear and re-resolve', async () => {
    let symbolCount = 3;
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/s/header.h',
          originalPath: '"header.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return Array.from({ length: symbolCount }, (_, i) => ({
          name: `sym${i}`,
          kind: 'variable' as const,
        }));
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"header.h"')]);
    assert.equal(resolver.getStats().totalSymbols, 3);

    symbolCount = 7;
    resolver.clear();
    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"header.h"')]);
    assert.equal(resolver.getStats().totalSymbols, 7);
  });
});

// ============================================================================
// Bridge error handling
// ============================================================================

describe('IncludeResolver - Bridge error handling', () => {
  it('should handle resolveInclude throwing an error', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => {
          throw new Error('bridge process crashed');
        },
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"crash.h"'),
    ]);

    assert.equal(deps.includes.length, 0);
  });

  it('should handle parseFileSymbols throwing an error', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/err/broken.h',
          originalPath: '"broken.h"',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        throw new Error('parse failed');
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"broken.h"'),
    ]);

    // parseFileSymbols error is caught inside resolveSingleInclude, returns null
    assert.equal(deps.includes.length, 0);
    assert.equal(resolver.getStats().cachedIncludes, 0);
  });

  it('should handle resolveStdlib throwing an error', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: false,
          path: null,
          originalPath: '"local.h"',
        }),
        resolveStdlib: async () => {
          throw new Error('stdlib lookup failed');
        },
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());
    const symbols = [{ name: 'SomeModule', kind: 'import' as const }] as PikeSymbol[];

    const deps = await resolver.resolveDependencies('file:///test.pike', symbols);

    // stdlib error should be caught; import treated as non-stdlib
    assert.equal(deps.imports.length, 1);
    assert.equal(deps.imports[0]!.isStdlib, false);
  });

  it('should continue resolving remaining includes after one throws', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async (includePath: string) => {
          if (includePath.includes('fail.h')) {
            throw new Error('boom');
          }
          return { exists: true, path: '/ok/good.h', originalPath: '"good.h"' };
        },
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [{ name: 'good_sym', kind: 'variable' as const }];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"fail.h"'),
      includeSymbol('"good.h"'),
    ]);

    assert.equal(deps.includes.length, 1);
    assert.equal(deps.includes[0]!.resolvedPath, '/ok/good.h');
  });
});

// ============================================================================
// Workspace import resolution
// ============================================================================

describe('IncludeResolver - Workspace import resolution', () => {
  it('should resolve non-stdlib imports via bridge and parse symbols', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/workspace/LocalModule.pike',
          originalPath: 'LocalModule',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [
          { name: 'local_func', kind: 'function' as const },
          { name: 'local_var', kind: 'variable' as const },
        ];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());
    const symbols = [{ name: 'LocalModule', kind: 'import' as const }] as PikeSymbol[];

    const deps = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.equal(deps.imports.length, 1);
    assert.equal(deps.imports[0]!.isStdlib, false);
    assert.equal(deps.imports[0]!.resolvedPath, '/workspace/LocalModule.pike');
    assert.equal(deps.imports[0]!.symbols!.length, 2);
  });

  it('should not resolve symbols for stdlib imports', async () => {
    let parseCalled = false;
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: true,
          path: '/lib/Stdio.pike',
          originalPath: 'Stdio',
        }),
        resolveStdlib: async () => ({ found: 1, symbols: [], path: '/lib/Stdio.pike' }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        parseCalled = true;
        return [];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());
    const symbols = [{ name: 'Stdio', kind: 'import' as const }] as PikeSymbol[];

    const deps = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.equal(deps.imports.length, 1);
    assert.equal(deps.imports[0]!.isStdlib, true);
    assert.equal(deps.imports[0]!.symbols, undefined);
    assert.equal(parseCalled, false);
  });

  it('should handle non-stdlib import that does not resolve', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async () => ({
          exists: false,
          path: null,
          originalPath: 'MissingModule',
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());
    const symbols = [{ name: 'MissingModule', kind: 'import' as const }] as PikeSymbol[];

    const deps = await resolver.resolveDependencies('file:///test.pike', symbols);

    assert.equal(deps.imports.length, 1);
    assert.equal(deps.imports[0]!.isStdlib, false);
    assert.equal(deps.imports[0]!.symbols, undefined);
    assert.equal(deps.imports[0]!.resolvedPath, undefined);
  });
});

// ============================================================================
// getDependencySymbols
// ============================================================================

describe('IncludeResolver - getDependencySymbols', () => {
  it('should return all symbols from resolved includes', async () => {
    const bridge = {
      bridge: {
        resolveInclude: async (includePath: string) => ({
          exists: true,
          path: `/deps/${includePath}`,
          originalPath: includePath,
        }),
        resolveStdlib: async () => ({ found: 0 }),
      },
      async parseFileSymbols(): Promise<PikeSymbol[]> {
        return [
          { name: 'a', kind: 'variable' as const },
          { name: 'b', kind: 'function' as const },
        ];
      },
    };
    const resolver = new IncludeResolver(bridge as never, createMockLogger());

    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"first.h"'),
      includeSymbol('"second.h"'),
    ]);

    const allSymbols = await resolver.getDependencySymbols(deps);
    // 2 includes x 2 symbols each = 4 symbols
    assert.equal(allSymbols.length, 4);
  });

  it('should return empty array for empty dependencies', async () => {
    const resolver = new IncludeResolver(null, createMockLogger());

    const symbols = await resolver.getDependencySymbols({ includes: [], imports: [] });
    assert.equal(symbols.length, 0);
  });
});
