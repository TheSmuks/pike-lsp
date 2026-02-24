/**
 * Stdlib Index Manager Tests
 *
 * Tests for the lazy-loading stdlib cache:
 * - LRU cache eviction
 * - Negative cache for missing modules
 * - Memory budget enforcement
 * - Access tracking and statistics
 * - Module loading and caching
 *
 * Run with: bun test dist/src/tests/stdlib-index.test.js
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { StdlibIndexManager } from '../stdlib-index.js';
import type { PikeBridge } from '@pike-lsp/pike-bridge';

// ============================================================================
// Mock PikeBridge
// ============================================================================

/**
 * Create a mock PikeBridge for testing without Pike subprocess
 */
function createMockBridge(moduleData: Record<string, {
    found: boolean;
    symbols?: Array<{ name: string; kind: string }>;
    inherits?: Array<{ name: string }>;
    path?: string;
}>): PikeBridge {
    return {
        resolveStdlib: async (modulePath: string) => {
            const data = moduleData[modulePath];
            if (!data || !data.found) {
                return { found: false };
            }
            const result: Record<string, unknown> = {
                found: true,
                symbols: data.symbols || [],
            };
            // Only include inherits if explicitly provided
            if (data.inherits !== undefined) {
                result['inherits'] = data.inherits;
            }
            if (data.path !== undefined) {
                result['path'] = data.path;
            }
            return result;
        },
    } as unknown as PikeBridge;
}

// ============================================================================
// Unit Tests - Basic Operations
// ============================================================================

describe('StdlibIndexManager - Basic Operations', () => {
    it('should return null for non-existent modules', async () => {
        // Arrange
        const bridge = createMockBridge({});
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('NonExistent');

        // Assert
        assert.equal(result, null);
    });

    it('should load and cache a module', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Stdio': {
                found: true,
                symbols: [
                    { name: 'write', kind: 'function' },
                    { name: 'werror', kind: 'function' },
                ],
                path: '/lib/Stdio.pmod',
            },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('Stdio');

        // Assert
        assert.ok(result, 'Module should be loaded');
        assert.equal(result!.modulePath, 'Stdio');
        assert.ok(result!.symbols, 'Symbols should be loaded');
        assert.equal(result!.symbols!.size, 2);
        assert.ok(result!.symbols!.has('write'));
        assert.ok(result!.symbols!.has('werror'));
    });

    it('should cache module and return from cache on second access', async () => {
        // Arrange
        let resolveCount = 0;
        const bridge = {
            resolveStdlib: async () => {
                resolveCount++;
                return {
                    found: true,
                    symbols: [{ name: 'test', kind: 'function' }],
                };
            },
        } as unknown as PikeBridge;
        const manager = new StdlibIndexManager(bridge);

        // Act
        await manager.getModule('Test');
        await manager.getModule('Test');
        await manager.getModule('Test');

        // Assert
        assert.equal(resolveCount, 1, 'Should only call bridge once');
        const stats = manager.getStats();
        assert.equal(stats.hits, 2, 'Should have 2 cache hits');
        assert.equal(stats.misses, 1, 'Should have 1 cache miss');
    });

    it('should report correct isCached status', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Stdio': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);

        // Assert - before loading
        assert.equal(manager.isCached('Stdio'), false);

        // Act - load module
        await manager.getModule('Stdio');

        // Assert - after loading
        assert.equal(manager.isCached('Stdio'), true);
        assert.equal(manager.isCached('NonExistent'), false);
    });

    it('should return symbols via getSymbols', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Array': {
                found: true,
                symbols: [
                    { name: 'flatten', kind: 'function' },
                    { name: 'sum', kind: 'function' },
                ],
            },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        const symbols = await manager.getSymbols('Array');

        // Assert
        assert.ok(symbols);
        assert.equal(symbols!.size, 2);
        assert.ok(symbols!.has('flatten'));
        assert.ok(symbols!.has('sum'));
    });

    it('should return null from getSymbols for non-existent module', async () => {
        // Arrange
        const bridge = createMockBridge({});
        const manager = new StdlibIndexManager(bridge);

        // Act
        const symbols = await manager.getSymbols('NonExistent');

        // Assert
        assert.equal(symbols, null);
    });
});

// ============================================================================
// Unit Tests - Negative Cache
// ============================================================================

describe('StdlibIndexManager - Negative Cache', () => {
    it('should add non-existent modules to negative cache', async () => {
        // Arrange
        let resolveCount = 0;
        const bridge = {
            resolveStdlib: async () => {
                resolveCount++;
                return { found: false };
            },
        } as unknown as PikeBridge;
        const manager = new StdlibIndexManager(bridge);

        // Act
        await manager.getModule('NonExistent');
        await manager.getModule('NonExistent');
        await manager.getModule('NonExistent');

        // Assert
        assert.equal(resolveCount, 1, 'Should only call bridge once for negative cache');
        const stats = manager.getStats();
        assert.equal(stats.negativeHits, 2, 'Should have 2 negative cache hits');
        assert.equal(stats.negativeCount, 1, 'Should have 1 module in negative cache');
    });

    it('should add modules to negative cache on bridge error', async () => {
        // Arrange
        const originalConsoleError = console.error;
        console.error = () => {}; // Silence expected error log

        try {
            let callCount = 0;
            const bridge = {
                resolveStdlib: async () => {
                    callCount++;
                    throw new Error('Bridge error');
                },
            } as unknown as PikeBridge;
            const manager = new StdlibIndexManager(bridge);

            // Act
            const result1 = await manager.getModule('Broken');
            const result2 = await manager.getModule('Broken');

            // Assert
            assert.equal(result1, null);
            assert.equal(result2, null);
            assert.equal(callCount, 1, 'Should only try bridge once');
        } finally {
            console.error = originalConsoleError;
        }
    });

    it('should clear negative cache on clear()', async () => {
        // Arrange
        const bridge = createMockBridge({});
        const manager = new StdlibIndexManager(bridge);
        await manager.getModule('NonExistent');

        // Act
        manager.clear();
        const stats = manager.getStats();

        // Assert
        assert.equal(stats.negativeCount, 0, 'Negative cache should be cleared');
    });
});

// ============================================================================
// Unit Tests - LRU Eviction
// ============================================================================

describe('StdlibIndexManager - LRU Eviction', () => {
    it('should evict oldest module when cache is full', async () => {
        // Arrange - Small cache size for testing
        const bridge = createMockBridge({
            'Module1': { found: true, symbols: [] },
            'Module2': { found: true, symbols: [] },
            'Module3': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge, { maxCacheSize: 2, maxMemoryMB: 100 });

        // Act
        await manager.getModule('Module1');
        await manager.getModule('Module2');
        await manager.getModule('Module3'); // Should evict Module1

        // Assert
        assert.equal(manager.isCached('Module1'), false, 'Module1 should be evicted');
        assert.equal(manager.isCached('Module2'), true, 'Module2 should remain');
        assert.equal(manager.isCached('Module3'), true, 'Module3 should be cached');
    });

    it('should evict least recently used module', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Module1': { found: true, symbols: [] },
            'Module2': { found: true, symbols: [] },
            'Module3': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge, { maxCacheSize: 2, maxMemoryMB: 100 });

        // Act
        await manager.getModule('Module1');
        await manager.getModule('Module2');
        await manager.getModule('Module1'); // Access Module1 again (now most recent)
        await manager.getModule('Module3'); // Should evict Module2 (least recently used)

        // Assert
        assert.equal(manager.isCached('Module1'), true, 'Module1 should remain (recently accessed)');
        assert.equal(manager.isCached('Module2'), false, 'Module2 should be evicted');
        assert.equal(manager.isCached('Module3'), true, 'Module3 should be cached');
    });

    it('should track eviction count in stats', async () => {
        // Arrange
        const bridge = createMockBridge({
            'M1': { found: true, symbols: [] },
            'M2': { found: true, symbols: [] },
            'M3': { found: true, symbols: [] },
            'M4': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge, { maxCacheSize: 2, maxMemoryMB: 100 });

        // Act
        await manager.getModule('M1');
        await manager.getModule('M2');
        await manager.getModule('M3'); // Evict M1
        await manager.getModule('M4'); // Evict M2

        // Assert
        const stats = manager.getStats();
        assert.equal(stats.evictions, 2, 'Should have 2 evictions');
    });

    it('should update access count when module is accessed', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Test': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        await manager.getModule('Test');
        await manager.getModule('Test');
        await manager.getModule('Test');
        const fourth = await manager.getModule('Test');

        // Assert
        assert.equal(fourth!.accessCount, 4, 'Access count should be 4');
    });
});

// ============================================================================
// Unit Tests - Memory Budget
// ============================================================================

describe('StdlibIndexManager - Memory Budget', () => {
    it('should evict modules when memory budget is exceeded', async () => {
        // Arrange - Create modules with many symbols to use memory
        const largeSymbols = Array.from({ length: 1000 }, (_, i) => ({
            name: `symbol${i}`,
            kind: 'function',
        }));
        const bridge = createMockBridge({
            'Large1': { found: true, symbols: largeSymbols },
            'Large2': { found: true, symbols: largeSymbols },
            'Large3': { found: true, symbols: largeSymbols },
        });
        // 1000 symbols * 400 bytes = 400KB per module
        // 0.5MB budget = room for 1 module
        const manager = new StdlibIndexManager(bridge, { maxCacheSize: 100, maxMemoryMB: 0.5 });

        // Act
        await manager.getModule('Large1');
        await manager.getModule('Large2');
        await manager.getModule('Large3');

        // Assert
        const stats = manager.getStats();
        assert.ok(stats.evictions > 0, 'Should have evicted some modules');
        assert.ok(stats.memoryMB <= 0.5, 'Memory should be under budget');
    });

    it('should track memory usage in stats', async () => {
        // Arrange
        const symbols = [{ name: 'test', kind: 'function' }];
        const bridge = createMockBridge({
            'Test': { found: true, symbols },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        await manager.getModule('Test');

        // Assert
        const stats = manager.getStats();
        assert.ok(stats.memoryBytes > 0, 'Memory should be tracked');
    });

    it('should clear memory usage on clear()', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Test': { found: true, symbols: [{ name: 'a', kind: 'function' }] },
        });
        const manager = new StdlibIndexManager(bridge);
        await manager.getModule('Test');

        // Act
        manager.clear();

        // Assert
        const stats = manager.getStats();
        assert.equal(stats.memoryBytes, 0, 'Memory should be cleared');
    });
});

// ============================================================================
// Unit Tests - Statistics
// ============================================================================

describe('StdlibIndexManager - Statistics', () => {
    it('should calculate hit rate correctly', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Test': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act - 1 miss, 3 hits
        await manager.getModule('Test'); // Miss
        await manager.getModule('Test'); // Hit
        await manager.getModule('Test'); // Hit
        await manager.getModule('Test'); // Hit

        // Assert
        const stats = manager.getStats();
        assert.equal(stats.hits, 3);
        assert.equal(stats.misses, 1);
        assert.equal(stats.hitRate, 75, 'Hit rate should be 75%');
    });

    it('should handle zero total requests for hit rate', async () => {
        // Arrange
        const bridge = createMockBridge({});
        const manager = new StdlibIndexManager(bridge);

        // Act - no requests

        // Assert
        const stats = manager.getStats();
        assert.equal(stats.hitRate, 0, 'Hit rate should be 0 with no requests');
    });

    it('should track module count', async () => {
        // Arrange
        const bridge = createMockBridge({
            'M1': { found: true, symbols: [] },
            'M2': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        await manager.getModule('M1');
        await manager.getModule('M2');

        // Assert
        const stats = manager.getStats();
        assert.equal(stats.moduleCount, 2);
    });

    it('should reset all stats on clear()', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Test': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);
        await manager.getModule('Test');
        await manager.getModule('Test');

        // Act
        manager.clear();

        // Assert
        const stats = manager.getStats();
        assert.equal(stats.hits, 0);
        assert.equal(stats.misses, 0);
        assert.equal(stats.evictions, 0);
        assert.equal(stats.negativeHits, 0);
        assert.equal(stats.moduleCount, 0);
    });
});

// ============================================================================
// Unit Tests - Edge Cases
// ============================================================================

describe('StdlibIndexManager - Edge Cases', () => {
    it('should handle empty symbols array', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Empty': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('Empty');

        // Assert
        assert.ok(result);
        assert.equal(result!.symbols!.size, 0);
    });

    it('should handle module without optional properties', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Minimal': { found: true },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('Minimal');

        // Assert
        assert.ok(result);
        assert.equal(result!.resolvedPath, undefined);
        assert.equal(result!.inherits, undefined);
    });

    it('should handle module with inheritance info', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Child': {
                found: true,
                symbols: [],
                inherits: [{ name: 'Parent' }],
                path: '/lib/Child.pike',
            },
        });
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('Child');

        // Assert
        assert.ok(result);
        assert.equal(result!.resolvedPath, '/lib/Child.pike');
        assert.ok(result!.inherits);
        assert.equal(result!.inherits!.length, 1);
    });

    it('should handle concurrent access to same module', async () => {
        // Arrange
        let resolveCount = 0;
        const bridge = {
            resolveStdlib: async () => {
                resolveCount++;
                // Simulate delay
                await new Promise(r => setTimeout(r, 10));
                return { found: true, symbols: [] };
            },
        } as unknown as PikeBridge;
        const manager = new StdlibIndexManager(bridge);

        // Act - Concurrent requests
        const promises = [
            manager.getModule('Concurrent'),
            manager.getModule('Concurrent'),
            manager.getModule('Concurrent'),
        ];
        const results = await Promise.all(promises);

        // Assert - All should succeed (but may have multiple bridge calls)
        assert.ok(results[0]);
        assert.ok(results[1]);
        assert.ok(results[2]);
    });

    it('should handle clear() while modules are cached', async () => {
        // Arrange
        const bridge = createMockBridge({
            'Test': { found: true, symbols: [] },
        });
        const manager = new StdlibIndexManager(bridge);
        await manager.getModule('Test');

        // Act
        manager.clear();

        // Assert
        assert.equal(manager.isCached('Test'), false);
        const stats = manager.getStats();
        assert.equal(stats.moduleCount, 0);
    });
});

// ============================================================================
// Integration Tests - With Real PikeBridge
// ============================================================================

describe('StdlibIndexManager - Integration with PikeBridge', { timeout: 30000 }, () => {
    let bridge: PikeBridge;

    beforeAll(async () => { const { PikeBridge: RealBridge } = await import('@pike-lsp/pike-bridge');
    bridge = new RealBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { if (bridge) {
        await bridge.stop();
    } });

    it('should load real Stdio module', async () => {
        // Arrange
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('Stdio');

        // Assert
        assert.ok(result, 'Stdio module should exist');
        assert.ok(result!.symbols, 'Stdio should have symbols');
        assert.ok(result!.symbols!.size > 0, 'Stdio should have at least one symbol');
    });

    it('should load real Array module', async () => {
        // Arrange
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('Array');

        // Assert
        assert.ok(result, 'Array module should exist');
        assert.ok(result!.symbols);
    });

    it('should cache real modules and track statistics', async () => {
        // Arrange
        const manager = new StdlibIndexManager(bridge);

        // Act - First access is a miss, subsequent are hits
        await manager.getModule('Stdio');
        await manager.getModule('Stdio');
        await manager.getModule('Stdio');
        await manager.getModule('Stdio');

        // Assert - Verify caching works via statistics
        const stats = manager.getStats();
        assert.equal(stats.hits, 3, 'Should have 3 cache hits');
        assert.equal(stats.misses, 1, 'Should have 1 cache miss (initial load)');
        assert.equal(stats.hitRate, 75, 'Hit rate should be 75%');
        assert.ok(manager.isCached('Stdio'), 'Module should be cached');
    });

    it('should handle non-existent module with real bridge', async () => {
        // Arrange
        const manager = new StdlibIndexManager(bridge);

        // Act
        const result = await manager.getModule('NonExistentModule12345');

        // Assert
        assert.equal(result, null);
        const stats = manager.getStats();
        assert.equal(stats.negativeCount, 1);
    });
});
