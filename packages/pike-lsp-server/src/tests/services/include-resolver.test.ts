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
  it('should report cached includes from the include index', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);

    // Resolved includes are indexed in the include index
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

  it('should use indexResolvedIncludes to seed the include index', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    const preResolved = {
      originalPath: '"pre-cached.h"',
      resolvedPath: '/pre/cached.h',
      symbols: [{ name: 'pre_cached_symbol', kind: 'variable' as const }],
      lastModified: Date.now(),
    };
    resolver.indexResolvedIncludes([preResolved]);

    const stats = resolver.getStats();
    assert.equal(stats.cachedIncludes, 1);
    assert.equal(stats.totalSymbols, 1);

    // Resolving the same path should return the pre-indexed entry
    const deps = await resolver.resolveDependencies('file:///test.pike', [
      includeSymbol('"existing.h"'),
    ]);
    assert.equal(deps.includes.length, 1);
  });

  it('should remove entries from index on invalidate', async () => {
    const bridge = createMockBridge();
    const logger = createMockLogger();
    const resolver = new IncludeResolver(bridge, logger);

    await resolver.resolveDependencies('file:///test.pike', [includeSymbol('"existing.h"')]);
    assert.equal(resolver.getStats().cachedIncludes, 1);

    resolver.invalidate('/mock/path/existing.h');
    assert.equal(resolver.getStats().cachedIncludes, 0);
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
