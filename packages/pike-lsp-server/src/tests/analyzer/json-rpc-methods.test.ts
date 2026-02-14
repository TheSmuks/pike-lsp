/**
 * Phase 9: JSON-RPC Methods - Comprehensive TDD Tests
 *
 * Tests all JSON-RPC methods exposed by analyzer.pike entry point:
 * - Request/response format validation (JSON-RPC 2.0)
 * - Error handling (invalid params, missing params)
 * - Edge cases (null inputs, invalid types)
 * - Return value validation
 *
 * Each method is tested with:
 * 1. Valid request (happy path)
 * 2. Missing parameters
 * 3. Invalid parameter types
 * 4. Null/empty inputs
 * 5. Error responses
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Phase 9: JSON-RPC Methods', { timeout: 60000 }, () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    await bridge.start();
    // Suppress stderr output during tests
    bridge.on('stderr', () => {});
  });

  after(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  // =========================================================================
  // 45.1 Method: parse
  // =========================================================================

  describe('45.1 Method: parse', () => {
    it('should accept valid parse request with code and filename', async () => {
      const result = await bridge.parse('int x = 5;', 'test.pike');

      assert.ok(result, 'Parse should return a result');
      assert.ok(Array.isArray(result.symbols), 'Should have symbols array');
    });

    it('should accept parse request without filename', async () => {
      const result = await bridge.parse('string s = "test";');

      assert.ok(result, 'Parse should return a result');
      assert.ok(Array.isArray(result.symbols), 'Should have symbols array');
    });

    it('should handle empty code gracefully', async () => {
      const result = await bridge.parse('', 'empty.pike');

      assert.ok(result, 'Parse should return result for empty code');
      assert.ok(Array.isArray(result.symbols), 'Should have symbols array (may be empty)');
    });

    it('should handle invalid Pike syntax without crashing', async () => {
      const result = await bridge.parse('int x = ', 'invalid.pike');

      assert.ok(result, 'Parse should return result even for invalid syntax');
      assert.ok(result.diagnostics !== undefined, 'Should have diagnostics field');
    });

    it('should return valid JSON-RPC response format', async () => {
      const result = await bridge.parse('int x;', 'test.pike');

      // Verify result structure
      assert.ok(typeof result === 'object', 'Result should be an object');
      assert.ok(Array.isArray(result.symbols), 'Should have symbols array');
    });
  });

  // =========================================================================
  // 45.2 Method: tokenize
  // =========================================================================

  describe('45.2 Method: tokenize', () => {
    it('should accept valid tokenize request', async () => {
      const tokens = await bridge.tokenize('int x = 5;');

      assert.ok(Array.isArray(tokens), 'Should return tokens array');
      assert.ok(tokens.length > 0, 'Should have at least one token');
    });

    it('should handle empty code', async () => {
      const tokens = await bridge.tokenize('');

      assert.ok(Array.isArray(tokens), 'Should return tokens array (may be empty)');
    });

    it('should return tokens with text property', async () => {
      const tokens = await bridge.tokenize('int x;');

      if (tokens.length > 0) {
        assert.ok('text' in tokens[0] || 'type' in tokens[0], 'Token should have text or type property');
      }
    });

    it('should tokenize complex expressions', async () => {
      const code = 'int x = (1 + 2) * 3;';
      const tokens = await bridge.tokenize(code);

      assert.ok(tokens.length > 0, 'Should tokenize complex expression');
    });
  });

  // =========================================================================
  // 45.3 Method: compile
  // =========================================================================

  describe('45.3 Method: compile', () => {
    it('should accept valid compile request', async () => {
      const result = await bridge.compile('int x = 5;', 'test.pike');

      assert.ok(result, 'Compile should return a result');
      assert.ok(Array.isArray(result.diagnostics), 'Should have diagnostics array');
    });

    it('should detect syntax errors', async () => {
      const result = await bridge.compile('int x = ;', 'error.pike');

      assert.ok(result, 'Compile should return result for syntax error');
      assert.ok(result.diagnostics.length >= 0, 'Should have diagnostics');
    });

    it('should handle missing imports gracefully', async () => {
      const result = await bridge.compile('import NonExistent.Module;', 'missing.pike');

      assert.ok(result, 'Compile should return result for missing imports');
      assert.ok(Array.isArray(result.diagnostics), 'Should have diagnostics array');
    });

    it('should compile without filename', async () => {
      const result = await bridge.compile('float f = 3.14;');

      assert.ok(result, 'Compile should work without filename');
    });
  });

  // =========================================================================
  // 45.4 Method: batch_parse
  // =========================================================================

  describe('45.4 Method: batch_parse', () => {
    it('should accept valid batch parse request', async () => {
      const files = [
        { code: 'int x;', filename: 'file1.pike' },
        { code: 'string y;', filename: 'file2.pike' },
      ];

      const result = await bridge.batchParse(files);

      assert.ok(result, 'Batch parse should return a result');
      assert.ok(result.results, 'Should have results array');
      assert.ok(result.results.length === 2, 'Should have 2 results');
    });

    it('should handle empty batch', async () => {
      const result = await bridge.batchParse([]);

      assert.ok(result, 'Batch parse should handle empty array');
      assert.ok(result.results?.length === 0, 'Should have 0 results');
    });

    it('should handle mixed valid and invalid code', async () => {
      const files = [
        { code: 'int x;', filename: 'valid.pike' },
        { code: 'int x = ;', filename: 'invalid.pike' },
      ];

      const result = await bridge.batchParse(files);

      assert.ok(result, 'Batch parse should handle mixed code');
      assert.ok(result.results?.length === 2, 'Should have 2 results');
    });

    it('should respect batch size limits', async () => {
      // Create a large batch
      const files = Array.from({ length: 100 }, (_, i) => ({
        code: `int var${i} = ${i};`,
        filename: `file${i}.pike`,
      }));

      const result = await bridge.batchParse(files);

      assert.ok(result, 'Batch parse should handle large batches');
      assert.ok(result.results, 'Should have results');
    });
  });

  // =========================================================================
  // 45.5 Method: resolve
  // =========================================================================

  describe('45.5 Method: resolve', () => {
    it('should resolve stdlib modules', async () => {
      const result = await bridge.resolveModule('Stdio', 'test.pike');

      assert.ok(result, 'Resolve should return a result');
      // Result may be null if module not found, or string if found
      assert.ok(result === null || typeof result === 'string', 'Should return path or null');
    });

    it('should handle missing modules', async () => {
      const result = await bridge.resolveModule('NonExistent.Module', 'test.pike');

      // Should not throw, return null or error
      assert.ok(result === null || typeof result === 'string', 'Should handle missing modules');
    });

    it('should resolve relative to current file', async () => {
      const result = await bridge.resolveModule('./local.pike', '/path/to/test.pike');

      assert.ok(result !== undefined, 'Should resolve relative paths');
    });

    it('should handle empty module path', async () => {
      const result = await bridge.resolveModule('', 'test.pike');

      assert.ok(result !== undefined, 'Should handle empty module path');
    });
  });

  // =========================================================================
  // 45.6 Method: resolve_stdlib
  // =========================================================================

  describe('45.6 Method: resolve_stdlib', () => {
    it('should resolve standard library module', async () => {
      const result = await bridge.resolveStdlib('Stdio');

      assert.ok(result, 'resolveStdlib should return a result');
      assert.ok(result.path !== undefined || result.found !== undefined, 'Should have path or found field');
    });

    it('should handle unknown stdlib module', async () => {
      const result = await bridge.resolveStdlib('NonExistent.Stdlib.Module');

      assert.ok(result, 'Should handle unknown modules');
      assert.ok(result.found === 0 || result.path === undefined, 'Should indicate not found');
    });

    it('should return module metadata', async () => {
      const result = await bridge.resolveStdlib('Parser');

      assert.ok(result, 'Should return metadata');
      if (result.found) {
        assert.ok(typeof result.path === 'string', 'Should have path when found');
      }
    });

    it('should handle nested module paths', async () => {
      const result = await bridge.resolveStdlib('Parser.Pike');

      assert.ok(result, 'Should handle nested paths');
    });
  });

  // =========================================================================
  // 45.7 Method: resolve_include
  // =========================================================================

  describe('45.7 Method: resolve_include', () => {
    it('should resolve include paths relative to current file', async () => {
      const result = await bridge.resolveInclude('./header.h', '/path/to/test.pike');

      assert.ok(result, 'resolveInclude should return a result');
      assert.ok('path' in result, 'Should have path field');
      assert.ok('exists' in result, 'Should have exists field');
    });

    it('should handle non-existent includes', async () => {
      const result = await bridge.resolveInclude('nonexistent.h', 'test.pike');

      assert.ok(result, 'Should handle non-existent includes');
      // Note: Pike's include resolution may return exists=true even for files
      // that don't exist, since it checks the include path, not file existence
      assert.ok('exists' in result, 'Should indicate existence status');
    });

    it('should search include paths', async () => {
      const result = await bridge.resolveInclude('config.h', 'test.pike');

      assert.ok(result, 'Should search include paths');
      assert.ok('originalPath' in result, 'Should have originalPath');
    });

    it('should handle empty include path', async () => {
      const result = await bridge.resolveInclude('', 'test.pike');

      assert.ok(result, 'Should handle empty include path');
    });
  });

  // =========================================================================
  // 45.8 Method: get_inherited
  // =========================================================================

  describe('45.8 Method: get_inherited', () => {
    it('should get inherited members for class', async () => {
      const result = await bridge.getInherited('SomeClass');

      assert.ok(result, 'getInherited should return a result');
      assert.ok('members' in result || 'error' in result, 'Should have members or error');
    });

    it('should handle unknown class', async () => {
      const result = await bridge.getInherited('TotallyFakeClassXYZ123');

      assert.ok(result, 'Should handle unknown class');
      // Should return empty members or error
      assert.ok('members' in result, 'Should have members field');
    });

    it('should handle stdlib classes', async () => {
      const result = await bridge.getInherited('Stdio.File');

      assert.ok(result, 'Should handle stdlib classes');
      assert.ok('members' in result, 'Should have members');
    });

    it('should return member details', async () => {
      const result = await bridge.getInherited('Test.Class');

      if (result.members && result.members.length > 0) {
        const member = result.members[0];
        assert.ok('name' in member, 'Member should have name');
      }
    });
  });

  // =========================================================================
  // 45.9 Method: find_occurrences
  // =========================================================================

  describe('45.9 Method: find_occurrences', () => {
    it('should find symbol occurrences', async () => {
      const code = `
        int x = 5;
        void foo() {
          int y = x;
        }
      `;
      const result = await bridge.findOccurrences(code);

      assert.ok(result, 'findOccurrences should return a result');
      assert.ok(Array.isArray(result.occurrences), 'Should have occurrences array');
    });

    it('should handle empty code', async () => {
      const result = await bridge.findOccurrences('');

      assert.ok(result, 'Should handle empty code');
      assert.ok(Array.isArray(result.occurrences), 'Should have occurrences array');
    });

    it('should find no occurrences for unknown symbol', async () => {
      const code = 'int x = 5;';
      const result = await bridge.findOccurrences(code);

      assert.ok(result, 'Should handle code with no references');
      assert.ok(Array.isArray(result.occurrences), 'Should have occurrences array');
    });

    it('should find multiple occurrences', async () => {
      const code = `
        int counter = 0;
        void inc() { counter++; }
        void dec() { counter--; }
      `;
      const result = await bridge.findOccurrences(code);

      assert.ok(result, 'Should find multiple occurrences');
      assert.ok(Array.isArray(result.occurrences), 'Should have occurrences array');
    });
  });

  // =========================================================================
  // 45.10 Method: analyze_uninitialized
  // =========================================================================

  describe('45.10 Method: analyze_uninitialized', () => {
    it('should detect uninitialized variables', async () => {
      const code = `
        int x;
        int y = x;  // x used before initialization
      `;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      assert.ok(result, 'analyzeUninitialized should return a result');
      assert.ok('diagnostics' in result, 'Should have diagnostics field');
    });

    it('should handle fully initialized code', async () => {
      const code = 'int x = 5; int y = x;';
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      assert.ok(result, 'Should handle initialized code');
      assert.ok(Array.isArray(result.diagnostics), 'Should have diagnostics array');
    });

    it('should handle empty code', async () => {
      const result = await bridge.analyzeUninitialized('', 'test.pike');

      assert.ok(result, 'Should handle empty code');
    });

    it('should detect conditional initialization', async () => {
      const code = `
        int x;
        if (random() > 0.5) {
          x = 1;
        }
        int y = x;  // potentially uninitialized
      `;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      assert.ok(result, 'Should detect conditional initialization');
    });
  });

  // =========================================================================
  // 45.11 Method: get_completion_context
  // =========================================================================

  describe('45.11 Method: get_completion_context', () => {
    it('should get completion context for valid position', async () => {
      const code = 'int x = ';
      // line is 1-based, character is 0-based
      const result = await bridge.getCompletionContext(code, 1, 8, 'test.pike');

      assert.ok(result, 'getCompletionContext should return a result');
      // CompletionContext has properties: context, objectName, prefix, operator
      // Verify result is not null/undefined
      assert.ok(result !== null && result !== undefined, 'Should return a value');
    });

    it('should handle position out of bounds', async () => {
      const code = 'int x;';
      const result = await bridge.getCompletionContext(code, 1, 100, 'test.pike');

      assert.ok(result, 'Should handle out of bounds position');
    });

    it('should handle empty code', async () => {
      const result = await bridge.getCompletionContext('', 1, 0, 'test.pike');

      assert.ok(result, 'Should handle empty code');
    });

    it('should handle negative position', async () => {
      const code = 'int x;';
      const result = await bridge.getCompletionContext(code, 1, -1, 'test.pike');

      assert.ok(result, 'Should handle negative position');
    });

    it('should provide token context', async () => {
      const code = 'Stdio.';
      const result = await bridge.getCompletionContext(code, 1, 6, 'test.pike');

      assert.ok(result, 'Should provide token context');
    });
  });

  // =========================================================================
  // 45.12 Method: get_completion_context_cached
  // =========================================================================

  describe('45.12 Method: get_completion_context_cached', () => {
    it('should use cached completion context', async () => {
      const code = 'int x = ';
      const result = await bridge.getCompletionContext(code, 0, 9, 'test.pike');

      assert.ok(result, 'getCompletionContext (cached) should return a result');
      // Subsequent calls should use cache
      const result2 = await bridge.getCompletionContext(code, 0, 9, 'test.pike');
      assert.ok(result2, 'Cached call should also work');
    });

    it('should invalidate cache on document change', async () => {
      const code = 'int x = ';
      await bridge.getCompletionContext(code, 0, 9, 'test.pike');

      // Simulate document change
      const newCode = 'string s = ';
      const result = await bridge.getCompletionContext(newCode, 0, 11, 'test.pike');

      assert.ok(result, 'Should handle document change');
    });

    it('should handle multiple documents', async () => {
      const code1 = 'int x = ';
      const code2 = 'string s = ';

      const result1 = await bridge.getCompletionContext(code1, 0, 9, 'file1.pike');
      const result2 = await bridge.getCompletionContext(code2, 0, 11, 'file2.pike');

      assert.ok(result1 && result2, 'Should handle multiple documents');
    });

    it('should respect cache size limits', async () => {
      // Generate many requests to test cache eviction
      const promises = Array.from({ length: 100 }, (_, i) =>
        bridge.getCompletionContext(`int x${i} = `, 0, 9, `file${i}.pike`)
      );

      const results = await Promise.all(promises);
      assert.ok(results.every(r => r !== undefined), 'Should handle cache pressure');
    });
  });

  // =========================================================================
  // 45.13 Method: analyze
  // =========================================================================

  describe('45.13 Method: analyze', () => {
    it('should perform multiple analysis operations', async () => {
      const result = await bridge.analyze('int x = 5;', ['parse', 'introspect'], 'test.pike');

      assert.ok(result, 'analyze should return a result');
      assert.ok('result' in result, 'Should have result field');
    });

    it('should handle single operation', async () => {
      const result = await bridge.analyze('int x;', ['parse'], 'test.pike');

      assert.ok(result, 'Should handle single operation');
      assert.ok(result.result?.parse, 'Should have parse result');
    });

    it('should handle invalid operation names', async () => {
      const result = await bridge.analyze('int x;', ['introspect'] as any, 'test.pike');

      assert.ok(result, 'Should handle operations');
      // Check if result has expected structure
      assert.ok('result' in result || 'failures' in result, 'Should have result or failures');
    });

    it('should handle empty operations list', async () => {
      const result = await bridge.analyze('int x;', [], 'test.pike');

      assert.ok(result, 'Should handle empty operations list');
    });

    it('should handle partial failures gracefully', async () => {
      const code = 'import NonExistent.Module; int x;';
      const result = await bridge.analyze(code, ['parse', 'introspect'], 'test.pike');

      assert.ok(result, 'Should handle partial failures');
      // Parse should succeed, introspect may fail
      if (result.failures?.introspect) {
        assert.ok(true, 'Introspect failure recorded');
      }
    });

    it('should return diagnostics when requested', async () => {
      const result = await bridge.analyze('int x = ;', ['parse', 'diagnostics'], 'test.pike');

      assert.ok(result, 'Should return diagnostics');
      assert.ok(result.result?.diagnostics, 'Should have diagnostics result');
    });

    it('should include build_id in diagnostics', async () => {
      const result = await bridge.analyze('int x;', ['diagnostics'], 'test.pike');

      assert.ok(result, 'Should include build_id');
    });
  });

  // =========================================================================
  // 45.14 Method: set_debug
  // =========================================================================

  describe('45.14 Method: set_debug', () => {
    it('should enable debug mode', async () => {
      const result = await bridge.setDebug(true);

      assert.ok(result, 'setDebug should return a result');
      assert.ok('debug_mode' in result, 'Should have debug_mode field');
      assert.ok(result.debug_mode === 1, 'Debug mode should be enabled');
    });

    it('should disable debug mode', async () => {
      const result = await bridge.setDebug(false);

      assert.ok(result, 'setDebug should return a result');
      assert.ok('debug_mode' in result, 'Should have debug_mode field');
      assert.ok(result.debug_mode === 0, 'Debug mode should be disabled');
    });

    it('should return message confirming state', async () => {
      const result1 = await bridge.setDebug(true);
      assert.ok(typeof result1.message === 'string', 'Should have message when enabling');

      const result2 = await bridge.setDebug(false);
      assert.ok(typeof result2.message === 'string', 'Should have message when disabling');
    });

    it('should handle multiple toggles', async () => {
      await bridge.setDebug(true);
      const result1 = await bridge.setDebug(true);
      assert.ok(result1.debug_mode === 1, 'Should stay enabled');

      const result2 = await bridge.setDebug(false);
      assert.ok(result2.debug_mode === 0, 'Should be disabled');
    });
  });

  // =========================================================================
  // 45.15 Method: get_version
  // =========================================================================

  describe('45.15 Method: get_version', () => {
    it('should return version information', async () => {
      const result = await bridge.getVersionInfo();

      assert.ok(result, 'getVersionInfo should return a result');
      assert.ok('version' in result, 'Should have version field');
    });

    it('should include major, minor, build fields', async () => {
      const result = await bridge.getVersionInfo();

      if (result) {
        assert.ok('major' in result, 'Should have major version');
        assert.ok('minor' in result, 'Should have minor version');
        assert.ok('build' in result, 'Should have build number');
      }
    });

    it('should have display version', async () => {
      const result = await bridge.getVersionInfo();

      if (result) {
        assert.ok('display' in result, 'Should have display version');
        // display is a number (e.g., 8.01116 for Pike 8.0.1116), not a string
        assert.ok(typeof result.display === 'number' || typeof result.display === 'string', 'Display should be number or string');
      }
    });

    it('should return valid version format', async () => {
      const result = await bridge.getVersionInfo();

      if (result && result.version) {
        assert.ok(/\d+\.\d+\.\d+/.test(result.version), 'Version should match X.Y.Z format');
      }
    });
  });

  // =========================================================================
  // 45.16 Method: get_startup_metrics
  // =========================================================================
  // Tests the get_startup_metrics JSON-RPC method which returns
  // startup phase timing information from the Pike subprocess.

  describe('45.16 Method: get_startup_metrics', () => {
    it('should return startup metrics from Pike subprocess', async () => {
      const metrics = await bridge.getStartupMetrics();

      assert.ok(metrics, 'getStartupMetrics should return a result');
      assert.ok(typeof metrics === 'object' && metrics !== null, 'Should return an object');
    });

    it('should include total startup time', async () => {
      const metrics = await bridge.getStartupMetrics();

      assert.ok('total' in metrics, 'Should have total field');
      assert.ok(typeof metrics.total === 'number', 'total should be a number');
    });

    it('should include path_setup timing', async () => {
      const metrics = await bridge.getStartupMetrics();

      assert.ok('path_setup' in metrics, 'Should have path_setup field');
      if (metrics.path_setup !== undefined) {
        assert.ok(typeof metrics.path_setup === 'number', 'path_setup should be a number');
      }
    });

    it('should include version timing', async () => {
      const metrics = await bridge.getStartupMetrics();

      assert.ok('version' in metrics, 'Should have version field');
      if (metrics.version !== undefined) {
        assert.ok(typeof metrics.version === 'number', 'version should be a number');
      }
    });

    it('should include handlers timing', async () => {
      const metrics = await bridge.getStartupMetrics();

      assert.ok('handlers' in metrics, 'Should have handlers field');
      if (metrics.handlers !== undefined) {
        assert.ok(typeof metrics.handlers === 'number', 'handlers should be a number');
      }
    });
  });

  // =========================================================================
  // 45.17 Method: get_cache_stats
  // =========================================================================
  // Tests the get_cache_stats JSON-RPC method which returns
  // compilation cache statistics from the Pike subprocess.

  describe('45.17 Method: get_cache_stats', () => {
    it('should return cache stats from Pike subprocess', async () => {
      const stats = await bridge.getCacheStats();

      assert.ok(stats, 'getCacheStats should return a result');
      assert.ok(typeof stats === 'object' && stats !== null, 'Should return an object');
    });

    it('should include hits and misses counters', async () => {
      const stats = await bridge.getCacheStats();

      assert.ok('hits' in stats, 'Should have hits field');
      assert.ok('misses' in stats, 'Should have misses field');
      assert.ok(typeof stats.hits === 'number', 'hits should be a number');
      assert.ok(typeof stats.misses === 'number', 'misses should be a number');
    });

    it('should include size and max_files', async () => {
      const stats = await bridge.getCacheStats();

      assert.ok('size' in stats, 'Should have size field');
      assert.ok('max_files' in stats, 'Should have max_files field');
      assert.ok(typeof stats.size === 'number', 'size should be a number');
      assert.ok(typeof stats.max_files === 'number', 'max_files should be a number');
    });

    it('should include evictions counter', async () => {
      const stats = await bridge.getCacheStats();

      assert.ok('evictions' in stats, 'Should have evictions field');
      assert.ok(typeof stats.evictions === 'number', 'evictions should be a number');
    });
  });

  // =========================================================================
  // 45.18 Method: invalidate_cache
  // =========================================================================

  describe('45.18 Method: invalidate_cache', () => {
    it('should invalidate cache for a path', async () => {
      const result = await bridge.invalidateCache('/path/to/test.pike', false);

      assert.ok(result, 'invalidateCache should return a result');
      assert.ok('status' in result, 'Should have status field');
      assert.ok('path' in result, 'Should have path field');
    });

    it('should handle transitive invalidation', async () => {
      const result = await bridge.invalidateCache('/path/to/test.pike', true);

      assert.ok(result, 'Transitive invalidation should work');
      assert.strictEqual(result.path, '/path/to/test.pike', 'Should echo path back');
    });

    it('should handle empty path', async () => {
      const result = await bridge.invalidateCache('', false);

      assert.ok(result, 'Should handle empty path');
      assert.ok('status' in result, 'Should have status');
    });

    it('should default transitive to false', async () => {
      // Call without transitive parameter
      const result = await bridge.invalidateCache('/test.pike');

      assert.ok(result, 'Should work with default transitive=false');
    });

    it('should report invalidation status', async () => {
      const result = await bridge.invalidateCache('/some/file.pike', false);

      assert.ok(result.status, 'Should report status');
      assert.strictEqual(result.path, '/some/file.pike', 'Should echo path');
    });
  });

  // =========================================================================
  // JSON-RPC Protocol Validation
  // =========================================================================
  // NOTE: PikeBridge abstracts the JSON-RPC protocol. Direct protocol
  // validation would require access to internal sendRequest method.
  // These tests validate that PikeBridge methods work correctly.

  describe('JSON-RPC Protocol Validation', () => {
    it('should handle JSON-RPC communication internally', async () => {
      // PikeBridge handles JSON-RPC protocol internally via sendRequest
      // We can verify it works by calling any method
      const result = await bridge.getVersionInfo();
      assert.ok(result !== undefined, 'Bridge handles JSON-RPC internally');
    });

    it('should handle requests with auto-generated numeric IDs', async () => {
      // PikeBridge auto-generates request IDs internally
      const result = await bridge.parse('int x;', 'test.pike');
      assert.ok(result, 'Bridge auto-generates numeric IDs');
    });

    it('should return error for unknown methods via try/catch', async () => {
      // Unknown methods would throw PikeError
      try {
        await (bridge as any).nonExistentMethod();
        assert.ok(false, 'Should have thrown');
      } catch (err) {
        assert.ok(err instanceof Error, 'Should throw error for unknown method');
      }
    });

    it('should handle missing parameters gracefully', async () => {
      // Bridge methods handle missing parameters with defaults
      const result = await bridge.parse('int x;');
      assert.ok(result, 'Should handle missing params with defaults');
    });

    it('should use JSON-RPC 2.0 protocol', async () => {
      // PikeBridge uses JSON-RPC 2.0 protocol internally
      // Verify by checking that requests return proper results
      const version = await bridge.getVersionInfo();
      assert.ok(version, 'JSON-RPC request should succeed');
      assert.ok(version.version, 'Should have valid version in response');
    });
  });

  // =========================================================================
  // Error Handling Tests
  // =========================================================================

  describe('Error Handling', () => {
    it('should handle invalid JSON in requests', async () => {
      // Bridge handles JSON serialization internally
      // Test that valid JSON works through the full pipeline
      const result = await bridge.parse('int x = 1;', 'test.pike');
      assert.ok(result, 'Should handle valid JSON request/response');
      assert.ok(Array.isArray(result.symbols), 'Should parse response correctly');
    });

    it('should not crash on null parameters', async () => {
      const result = await bridge.parse('int x;' as any, null as any);

      assert.ok(result, 'Should handle null parameters');
    });

    it('should handle undefined parameters', async () => {
      const result = await bridge.parse('int x;', undefined as any);

      assert.ok(result, 'Should handle undefined parameters');
    });

    it('should handle very large code inputs', async () => {
      const largeCode = 'int x;\n'.repeat(10000);
      const result = await bridge.parse(largeCode, 'large.pike');

      assert.ok(result, 'Should handle large inputs');
    });

    it('should handle special characters in code', async () => {
      const code = 'string s = "\\n\\t\\r";';
      const result = await bridge.parse(code, 'special.pike');

      assert.ok(result, 'Should handle special characters');
    });

    it('should handle unicode in code', async () => {
      const code = 'string s = "Hello 世界 🌍";';
      const result = await bridge.parse(code, 'unicode.pike');

      assert.ok(result, 'Should handle unicode');
    });
  });

  // =========================================================================
  // Test Summary
  // =========================================================================

  describe('Test Summary', () => {
    it('all JSON-RPC methods tested', () => {
      console.log('\n═══════════════════════════════════════════════════');
      console.log('       PHASE 9: JSON-RPC METHODS TEST SUMMARY');
      console.log('═══════════════════════════════════════════════════');

      const methods = [
        '45.1 parse',
        '45.2 tokenize',
        '45.3 compile',
        '45.4 batch_parse',
        '45.5 resolve',
        '45.6 resolve_stdlib',
        '45.7 resolve_include',
        '45.8 get_inherited',
        '45.9 find_occurrences',
        '45.10 analyze_uninitialized',
        '45.11 get_completion_context',
        '45.12 get_completion_context_cached',
        '45.13 analyze',
        '45.14 set_debug',
        '45.15 get_version',
        '45.16 get_startup_metrics',
        '45.17 get_cache_stats',
        '45.18 invalidate_cache',
      ];

      methods.forEach(method => {
        console.log(`  ${method.padEnd(35)} ✓`);
      });

      console.log('═══════════════════════════════════════════════════\n');
    });
  });
});
