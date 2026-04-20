/**
 * Scenario test: cache builder graceful degradation when resolveDependenciesViaBridge throws.
 *
 * Issue #2208 — the catch block in buildCacheWithIntrospection should log the error
 * and continue building the cache entry without dependencies.
 *
 * resolveDependenciesViaBridge has internal error handling (allSettled, try/catch)
 * so it never throws under normal conditions. The cache-builder's catch block is
 * defense-in-depth. We use bun:test mock.module to replace the function with one
 * that throws, verifying the catch block's logging and continuation behavior.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, it, expect } from 'bun:test';
import type { DocumentCacheEntry, CoreDiagnostic } from '../core/types.js';
import type {
  PikeSymbol,
  IntrospectionResult,
  PikeToken,
  PikeDiagnostic,
} from '@pike-lsp/pike-bridge';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { Logger } from '@pike-lsp/core';

// Capture log messages.
class CapturingLogger extends Logger {
  readonly debugCalls: Array<{ msg: string; data: Record<string, unknown> }> = [];

  override debug(msg: string, data?: Record<string, unknown>) {
    this.debugCalls.push({ msg, data: data ?? {} });
    super.debug(msg, data);
  }
}

// Minimal TextDocument stub satisfying the documents.get contract.
function makeTextDoc(uri: string, text: string, version: number): TextDocument {
  return {
    uri,
    getText: () => text,
    version,
    languageId: 'pike',
    lineCount: text.split('\n').length,
    positionAt: (offset: number) => {
      const before = text.slice(0, offset);
      const line = before.split('\n').length - 1;
      const character = offset - before.lastIndexOf('\n') - 1;
      return { line, character };
    },
    offsetAt: (pos: { line: number; character: number }) => {
      const lines = text.split('\n');
      let off = 0;
      for (let i = 0; i < pos.line && i < lines.length; i++) {
        off += lines[i]!.length + 1;
      }
      return off + pos.character;
    },
  };
}

// bun:test mock.module is available at runtime but not in TypeScript type definitions.
// We access it via require to avoid TS errors, and use it for module-level mocking.
const mockApi = require('bun:test') as {
  mock: {
    module(path: string, factory: () => Record<string, unknown>): void;
    restore(): void;
  };
};

describe('cache-builder bridge failure graceful degradation', () => {
  it('logs and builds cache without dependencies when resolveDependenciesViaBridge throws', async () => {
    // Mock resolveDependenciesViaBridge to throw, testing the defense-in-depth catch.
    mockApi.mock.module('../features/diagnostics/dependency-resolver.js', () => ({
      resolveDependenciesViaBridge: () => {
        throw new Error('bridge connection lost');
      },
    }));

    try {
      // Dynamic import to pick up the mocked module.
      const { buildCacheWithIntrospection } =
        await import('../features/diagnostics/cache-builder.js');

      const log = new CapturingLogger('test-scenario');

      const uri = 'file:///test.pike';
      const version = 1;
      const text = 'int x;\n';
      const lines = text.split('\n');

      // Pre-populate documentCache so the stale-version guard passes.
      const storedEntries = new Map<string, DocumentCacheEntry>();
      storedEntries.set(uri, {
        version,
        symbols: [],
        diagnostics: [],
        symbolPositions: new Map(),
        callPositions: new Map(),
        symbolNames: new Map(),
        contentHash: '',
        lineHashes: [],
        analysisState: { isStale: false, parseFailed: false, hasErrorDiagnostics: false },
      });

      const doc = makeTextDoc(uri, text, version);

      // Minimal bridge — won't be used since resolveDependenciesViaBridge is mocked.
      const bridge = {
        bridge: {
          resolveInclude: async () => ({ path: '/x', exists: true, originalPath: 'x' }),
          resolveStdlib: async () => ({ found: 0 }),
          tokenize: async () => [],
          parse: async () => ({ symbols: [], diagnostics: [] }),
          analyze: async () => ({
            parse: { symbols: [], diagnostics: [] },
            introspect: {
              success: 0,
              symbols: [],
              functions: [],
              classes: [],
              variables: [],
              inherits: [],
              diagnostics: [],
            },
          }),
        },
        parseFileSymbols: async () => [],
      };

      const services = {
        documentCache: {
          get: (u: string) => storedEntries.get(u) ?? undefined,
          set: (u: string, entry: DocumentCacheEntry) => storedEntries.set(u, entry),
          setPending: () => {},
        },
        logger: log,
        bridge,
      };

      const parseData = {
        symbols: [] as PikeSymbol[],
        diagnostics: [] as PikeDiagnostic[],
      };
      const introspectData: IntrospectionResult = {
        success: 0,
        symbols: [],
        functions: [],
        variables: [],
        classes: [],
        inherits: [],
        diagnostics: [],
      };
      const tokenizeData: PikeToken[] | undefined = undefined;
      const flatSymbols: PikeSymbol[] = [];
      const diagnostics: CoreDiagnostic[] = [];

      await buildCacheWithIntrospection(
        parseData,
        introspectData,
        tokenizeData,
        flatSymbols,
        diagnostics,
        {
          uri,
          version,
          text,
          lines,
          contentHash: 'hash',
          lineHashes: [0],
          bridge: bridge as NonNullable<never>,
          services: services as NonNullable<never>,
          documents: { get: (u: string) => (u === uri ? doc : undefined) },
          log,
          ensureLatest: () => true,
        }
      );

      // (1) Verify log.debug was called with 'Bridge dependency resolution failed' and the URI.
      const failureLogs = log.debugCalls.filter(
        c => c.msg === 'Bridge dependency resolution failed' && c.data['uri'] === uri
      );
      expect(failureLogs).toHaveLength(1);

      // (2) Verify cache entry was still built without dependencies.
      const entry = storedEntries.get(uri);
      expect(entry).toBeDefined();
      expect(entry!.version).toBe(version);
      expect(entry!.dependencies).toBeUndefined();
      expect(entry!.inherits).toBeUndefined();
    } finally {
      mockApi.mock.restore();
    }
  });
});
