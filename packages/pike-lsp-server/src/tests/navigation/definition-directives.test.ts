/**
 * Tests for definition-directives.ts
 *
 * Tests for handleDirectiveNavigation - go-to-definition on directive lines.
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import type { Logger, RoxenDetectorBridge } from '@pike-lsp/core';
import { handleDirectiveNavigation } from '../../features/navigation/definition-directives.js';

// Mock logger
function createMockLog(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as Logger;
}

// Mock services with configurable bridge responses
function createMockServices(options: {
  includeResult?: { exists: boolean; path?: string };
  importResult?: { exists: boolean; path?: string };
}): Services {
  const bridge: RoxenDetectorBridge = {
    roxenDetect: async () => ({ is_roxen_module: 0 }),
    resolveInclude: async () => options.includeResult ?? { exists: false },
    resolveImport: async () => options.importResult ?? { exists: false },
    // Extract imports from source — returns include at line 1 for test documents
    extractImports: async (code: string) => {
      const imports: Array<{
        type: 'include' | 'import' | 'inherit' | 'require';
        path: string;
        line: number;
      }> = [];
      const lines = code.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const m = line.match(/^#include\s+["<]([^">]+)[">]/);
        if (m) imports.push({ type: 'include', path: m[1], line: i + 1 });
      }
      return { imports };
    },
  } as unknown as RoxenDetectorBridge;

  return {
    bridge: {
      bridge,
      isRunning: () => true,
    },
  } as unknown as Services;
}

// Mock document cache entry
function createMockCached(overrides?: Partial<DocumentCacheEntry>): DocumentCacheEntry {
  return {
    symbols: [],
    ...overrides,
  } as DocumentCacheEntry;
}

// Create test document
function createDocument(text: string, uri = 'file:///test.pike'): TextDocument {
  return TextDocument.create(uri, 'pike', 1, text);
}

describe('handleDirectiveNavigation', () => {
  const log = createMockLog();

  describe('#include directive', () => {
    it('should return Location when include resolves successfully', async () => {
      const doc = createDocument('#include "module.h"');
      const services = createMockServices({
        includeResult: { exists: true, path: '/path/to/module.h' },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 10 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location');
      assert.strictEqual(result!.uri, 'file:///path/to/module.h');
    });

    it('should return null when include does not exist', async () => {
      const doc = createDocument('#include "nonexistent.h"');
      const services = createMockServices({
        includeResult: { exists: false },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 10 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null);
    });

    it('should handle angle-bracket includes', async () => {
      const doc = createDocument('#include <stdio.h>');
      const services = createMockServices({
        includeResult: { exists: true, path: '/usr/include/stdio.h' },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 10 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location for system include');
    });
  });

  describe('import statement', () => {
    it('should return Location from cached imports', async () => {
      const doc = createDocument('import Stdio;');
      const services = createMockServices({});
      const cached = createMockCached({
        dependencies: {
          imports: [
            {
              modulePath: 'Stdio',
              resolvedPath: '/pike/lib/modules/Stdio.pmod',
            },
          ],
        },
      } as unknown as DocumentCacheEntry);

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 8 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location from cache');
      assert.strictEqual(result!.uri, 'file:///pike/lib/modules/Stdio.pmod');
    });

    it('should fall back to bridge.resolveImport when not in cache', async () => {
      const doc = createDocument('import Parser.Pike;');
      const services = createMockServices({
        importResult: { exists: true, path: '/pike/lib/Parser/Pike.pike' },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 8 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location from bridge');
    });

    it('should return null when import not found', async () => {
      const doc = createDocument('import NonExistent;');
      const services = createMockServices({
        importResult: { exists: false },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 8 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null);
    });
  });

  describe('inherit statement', () => {
    it('should use cached when source_name matches, fallback to bridge otherwise', async () => {
      const doc = createDocument('inherit "module";');
      const services = createMockServices({
        importResult: { exists: true, path: '/path/to/module.pike' },
      });
      const cached = createMockCached({
        inherits: [
          {
            source_name: 'different_module',
            path: '/path/to/other.pike',
          },
        ],
      } as unknown as DocumentCacheEntry);

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      // Falls back to bridge because cached source_name doesn't match "module"
      assert.ok(result, 'Should return a Location from bridge fallback');
      assert.strictEqual(result!.uri, 'file:///path/to/module.pike');
    });

    it('should fall back to bridge.resolveImport when not in cache', async () => {
      const doc = createDocument('inherit "other_module";');
      const services = createMockServices({
        importResult: { exists: true, path: '/path/to/other_module.pike' },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location from bridge');
    });

    it('should return null when inherit not found', async () => {
      const doc = createDocument('inherit "nonexistent";');
      const services = createMockServices({
        importResult: { exists: false },
      });
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null);
    });

    it('should use cached inherit when source_name matches', async () => {
      const doc = createDocument('inherit "Parent";');
      const services = createMockServices({
        importResult: { exists: true, path: '/fallback/Parent.pike' },
      });
      const cached = createMockCached({
        inherits: [
          {
            source_name: 'Parent',
            path: '/workspace/Parent.pike',
          },
        ],
      } as unknown as DocumentCacheEntry);

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location from cache');
      assert.strictEqual(result!.uri, 'file:///workspace/Parent.pike');
    });

    it('should fallback to bridge when cached source_name does not match', async () => {
      let bridgeCalled = false;
      const doc = createDocument('inherit "Other";');
      const services = {
        bridge: {
          bridge: {
            resolveImport: async () => {
              bridgeCalled = true;
              return { exists: true, path: '/fallback/Other.pike' };
            },
          },
          isRunning: () => true,
        },
      } as unknown as Services;
      const cached = createMockCached({
        inherits: [
          {
            source_name: 'Parent',
            path: '/workspace/Parent.pike',
          },
        ],
      } as unknown as DocumentCacheEntry);

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(bridgeCalled, true, 'Should fallback to bridge');
      assert.ok(result, 'Should return a Location from bridge');
      assert.strictEqual(result!.uri, 'file:///fallback/Other.pike');
    });

    it('should work without bridge when cached hit exists', async () => {
      const doc = createDocument('inherit "CachedModule";');
      const services = {} as Services;
      const cached = createMockCached({
        inherits: [
          {
            source_name: 'CachedModule',
            path: '/workspace/CachedModule.pike',
          },
        ],
      } as unknown as DocumentCacheEntry);

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.ok(result, 'Should return a Location from cache without bridge');
      assert.strictEqual(result!.uri, 'file:///workspace/CachedModule.pike');
    });
  });

  describe('#require directive', () => {
    it('should return null for #require (no navigation)', async () => {
      const doc = createDocument('#require constant_string');
      const services = createMockServices({});
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 10 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null, '#require should not navigate');
    });
  });

  describe('non-directive lines', () => {
    it('should return null for regular code', async () => {
      const doc = createDocument('int x = 42;');
      const services = createMockServices({});
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 5 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null, 'Should return null for non-directive');
    });

    it('should return null for function call', async () => {
      const doc = createDocument('write("hello");');
      const services = createMockServices({});
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 3 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null);
    });
  });

  describe('error handling', () => {
    it('should return null when bridge throws error', async () => {
      const doc = createDocument('#include "module.h"');
      const services: Services = {
        bridge: {
          bridge: {
            resolveInclude: async () => {
              throw new Error('Bridge error');
            },
          },
          isRunning: () => true,
        },
      } as unknown as Services;
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 10 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null, 'Should handle bridge errors gracefully');
    });

    it('should return null when no bridge available', async () => {
      const doc = createDocument('#include "module.h"');
      const services: Services = {
        bridge: null,
      } as unknown as Services;
      const cached = createMockCached();

      const result = await handleDirectiveNavigation(
        doc,
        { line: 0, character: 10 },
        'file:///test.pike',
        services,
        cached,
        log
      );

      assert.strictEqual(result, null, 'Should handle missing bridge gracefully');
    });
  });
});
