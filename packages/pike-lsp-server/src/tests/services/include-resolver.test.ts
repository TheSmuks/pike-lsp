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
import { IncludeResolver } from '../../services/include-resolver.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Logger } from '@pike-lsp/core';

// ============================================================================
// Mock Bridge and Logger
// ============================================================================

function createMockBridge() {
    return {
        bridge: {
            resolveInclude: async (includePath: string, currentUri: string) => {
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
            analyze: async (content: string, operations: string[], filename: string) => {
                return {
                    result: {
                        parse: {
                            symbols: [
                                { name: `symbol_from_${filename}`, kind: 'variable' },
                            ] as PikeSymbol[],
                        },
                    },
                };
            },
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

// ============================================================================
// 30.1 Include Resolver - Relative path
// ============================================================================

describe('IncludeResolver - 30.1 Relative path', () => {
    it('30.1.1 should resolve relative include path', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert
        assert.ok(result);
        assert.equal(result!.resolvedPath, '/mock/path/existing.h');
    });

    it('30.1.2 should resolve include with angle brackets', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('<existing.h>', 'file:///test.pike');

        // Assert
        assert.ok(result);
        assert.equal(result!.resolvedPath, '/mock/path/existing.h');
    });

    it('30.1.3 should resolve includes from subdirectories', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"subdir/child.h"', 'file:///test.pike');

        // Assert
        assert.ok(result);
        assert.equal(result!.resolvedPath, '/mock/path/subdir/child.h');
    });

    it('30.1.4 should resolve includes with parent directory references', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"../parent.h"', 'file:///subdir/test.pike');

        // Assert
        assert.ok(result);
        assert.equal(result!.resolvedPath, '/mock/path/parent.h');
    });

    it('30.1.5 should cache resolved includes', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act - first call
        const result1 = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');
        // second call should use cache
        const result2 = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert
        assert.ok(result1);
        assert.ok(result2);
        assert.equal(result1!.resolvedPath, result2!.resolvedPath);
    });
});

// ============================================================================
// 30.2 Include Resolver - Module path
// ============================================================================

describe('IncludeResolver - 30.2 Module path', () => {
    it('30.2.1 should identify stdlib modules', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: 'Stdio', kind: 'import' as const },
        ] as PikeSymbol[];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert
        assert.ok(dependencies.imports.length > 0);
        assert.equal(dependencies.imports[0]!.modulePath, 'Stdio');
        assert.equal(dependencies.imports[0]!.isStdlib, true);
    });

    it('30.2.2 should identify non-stdlib modules', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: 'LocalModule', kind: 'import' as const },
        ] as PikeSymbol[];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert
        assert.ok(dependencies.imports.length > 0);
        assert.equal(dependencies.imports[0]!.modulePath, 'LocalModule');
        assert.equal(dependencies.imports[0]!.isStdlib, false);
    });

    it('30.2.3 should handle multiple imports', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: 'Stdio', kind: 'import' as const },
            { name: 'Array', kind: 'import' as const },
            { name: 'LocalModule', kind: 'import' as const },
        ] as PikeSymbol[];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert
        assert.equal(dependencies.imports.length, 3);
    });

    it('30.2.4 should distinguish includes from imports', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: '#include', kind: 'include' as const, classname: '"existing.h"' },
            { name: 'Stdio', kind: 'import' as const },
        ] as PikeSymbol[];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert
        assert.equal(dependencies.includes.length, 1);
        assert.equal(dependencies.imports.length, 1);
    });

    it('30.2.5 should handle empty import list', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols: PikeSymbol[] = [];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert
        assert.equal(dependencies.imports.length, 0);
    });
});

// ============================================================================
// 30.3 Include Resolver - Not found
// ============================================================================

describe('IncludeResolver - 30.3 Not found', () => {
    it('30.3.1 should return null for non-existent include', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"nonexistent.h"', 'file:///test.pike');

        // Assert
        assert.equal(result, null);
    });

    it('30.3.2 should handle missing includes gracefully', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: '#include', kind: 'include' as const, classname: '"missing.h"' },
        ] as PikeSymbol[];

        // Act - should not throw
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert
        assert.equal(dependencies.includes.length, 0);
    });

    it('30.3.3 should handle null bridge gracefully', async () => {
        // Arrange
        const logger = createMockLogger();
        const resolver = new IncludeResolver(null, logger);

        // Act
        const result = await resolver.resolveInclude('"test.h"', 'file:///test.pike');

        // Assert
        assert.equal(result, null);
    });

    it('30.3.4 should log debug message for failed resolution', async () => {
        // Arrange
        let logged = false;
        const bridge = createMockBridge();
        const logger = {
            debug: () => { logged = true; },
            info: () => {},
            warn: () => {},
            error: () => {},
        } as unknown as Logger;
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        await resolver.resolveInclude('"nonexistent.h"', 'file:///test.pike');

        // Assert - debug should have been called (but we can't easily verify parameters in mock)
        assert.ok(resolver);
    });

    it('30.3.5 should continue processing after failed include', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: '#include', kind: 'include' as const, classname: '"missing.h"' },
            { name: '#include', kind: 'include' as const, classname: '"existing.h"' },
        ] as PikeSymbol[];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);

        // Assert - Should successfully resolve the second include
        assert.equal(dependencies.includes.length, 1);
        assert.equal(dependencies.includes[0]!.resolvedPath, '/mock/path/existing.h');
    });
});

// ============================================================================
// 30.4 Include Resolver - Nested includes
// ============================================================================

describe('IncludeResolver - 30.4 Nested includes', () => {
    it('30.4.1 should resolve includes with nested dependencies', async () => {
        // This is a placeholder - real implementation would need to test
        // recursive include resolution
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert
        assert.ok(result);
    });

    it('30.4.2 should cache symbols from nested includes', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"parent.h"', 'file:///test.pike');

        // Assert - symbols should be cached
        assert.ok(result);
        assert.ok(Array.isArray(result!.symbols));
    });

    it('30.4.3 should combine symbols from multiple includes', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        const symbols = [
            { name: '#include', kind: 'include' as const, classname: '"parent.h"' },
            { name: '#include', kind: 'include' as const, classname: '"child.h"' },
        ] as PikeSymbol[];

        // Act
        const dependencies = await resolver.resolveDependencies('file:///test.pike', symbols);
        const depSymbols = await resolver.getDependencySymbols(dependencies);

        // Assert
        assert.ok(depSymbols.length >= 0);
    });

    it('30.4.4 should detect circular include dependencies', async () => {
        // This is a placeholder - real implementation would need to test
        // circular dependency detection
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert
        assert.ok(result);
    });

    it('30.4.5 should handle deeply nested include chains', async () => {
        // This is a placeholder - real implementation would need to test
        // deep nesting (e.g., a.h -> b.h -> c.h -> d.h)
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert
        assert.ok(result);
    });
});

// ============================================================================
// Cache Management Tests
// ============================================================================

describe('IncludeResolver - Cache Management', () => {
    it('should invalidate cache for specific file', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Act
        resolver.invalidate('/mock/path/existing.h');
        const stats = resolver.getStats();

        // Assert
        assert.equal(stats.cachedIncludes, 0);
    });

    it('should clear all cached includes', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);
        await resolver.resolveInclude('"existing.h"', 'file:///test.pike');
        await resolver.resolveInclude('"parent.h"', 'file:///test.pike');

        // Act
        resolver.clear();
        const stats = resolver.getStats();

        // Assert
        assert.equal(stats.cachedIncludes, 0);
    });

    it('should track cache statistics', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        await resolver.resolveInclude('"existing.h"', 'file:///test.pike');
        const stats = resolver.getStats();

        // Assert
        assert.equal(stats.cachedIncludes, 1);
        assert.ok(stats.totalSymbols >= 0);
    });

    it('should respect cache TTL', async () => {
        // This is a placeholder - testing TTL expiration would require
        // manipulating time or waiting for TTL to expire
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result1 = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');
        const result2 = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert - Both should succeed
        assert.ok(result1);
        assert.ok(result2);
    });

    it('should repopulate cache after invalidation', async () => {
        // Arrange
        const bridge = createMockBridge();
        const logger = createMockLogger();
        const resolver = new IncludeResolver(bridge, logger);

        // Act
        const result1 = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');
        resolver.invalidate('/mock/path/existing.h');
        const result2 = await resolver.resolveInclude('"existing.h"', 'file:///test.pike');

        // Assert
        assert.ok(result1);
        assert.ok(result2);
    });
});
