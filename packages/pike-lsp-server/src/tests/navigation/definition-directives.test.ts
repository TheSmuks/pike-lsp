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
    it('should return Location from bridge (cached inherits matching is not based on resolved path)', async () => {
      // Note: The cached inherits lookup compares inh.path with the source string (e.g., "module")
      // This test verifies the fallback to bridge.resolveImport works correctly
      const doc = createDocument('inherit "module";');
      const services = createMockServices({
        importResult: { exists: true, path: '/path/to/module.pike' },
      });
      const cached = createMockCached({
        inherits: [
          {
            path: '/path/to/module.pike', // This is the resolved path, not the source string
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

      // Falls back to bridge because cached inherit path doesn't match source string
      assert.ok(result, 'Should return a Location from bridge fallback');
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
