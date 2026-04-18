/**
 * Fault scenario: bridge crash during analysis
 * KB-1248: Tests for diagnostics handler resilience during bridge crashes
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry } from '../core/types.js';
import {
  createMockBridge,
  createMockConnection,
  createMockDocuments,
  makeCachedEntry,
  type FaultInjectableMockBridge,
} from '../tests/helpers/test-helpers.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 10
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start >= timeoutMs) {
      throw new Error('Timed out waiting for fault scenario to settle');
    }
    await wait(intervalMs);
  }
}

function createHarness(
  bridge: FaultInjectableMockBridge,
  seeded?: { uri: string; entry: DocumentCacheEntry }
) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const consoleErrors: string[] = [];

  if (seeded) {
    cache.set(seeded.uri, seeded.entry);
  }

  const conn = createMockConnection();

  // Override sendDiagnostics to capture locally
  const diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }> = [];
  const originalSendDiagnostics = conn.sendDiagnostics.bind(conn);
  (conn as { sendDiagnostics: typeof originalSendDiagnostics }).sendDiagnostics = params => {
    diagnostics.push(params);
    originalSendDiagnostics(params);
  };
  // Override console.error to capture errors
  const originalConsoleError = conn.console.error;
  (conn as { console: { error: typeof originalConsoleError } }).console.error = (
    message: unknown
  ) => {
    consoleErrors.push(String(message));
  };

  const services = {
    bridge,
    documentCache: {
      get(uri: string) {
        return cache.get(uri);
      },
      set(uri: string, entry: DocumentCacheEntry) {
        cache.set(uri, entry);
      },
      setPending(_uri: string, promise: Promise<void>) {
        promise.catch(() => {});
      },
      waitFor: async () => {},
      delete(uri: string) {
        cache.delete(uri);
      },
      keys() {
        return cache.keys();
      },
    },
    typeDatabase: {
      setProgram() {},
      removeProgram() {},
      getMemoryStats() {
        return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
      },
    },
    workspaceIndex: {
      indexDocument() {},
      removeDocument() {},
      getAllDocumentUris() {
        return [...cache.keys()];
      },
    },
    includeResolver: null,
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 10 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerDiagnosticsHandlers(
    conn as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  return { docs, cache, diagnostics, consoleErrors };
}

describe('Fault scenario: bridge crash during analysis', () => {
  it('propagates failure path cleanly and preserves cache integrity', async () => {
    const uri = 'file:///fault-crash.pike';
    const seededEntry = makeCachedEntry('int stable = 1;\n');
    seededEntry.version = 1;

    const bridge = createMockBridge({
      faultInjection: {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('injected crash'),
        probability: 1,
      },
    }) as FaultInjectableMockBridge;

    const harness = createHarness(bridge, { uri, entry: seededEntry });
    const crashingDoc = TextDocument.create(uri, 'pike', 2, 'int now = 2;\n');

    harness.docs.emitOpen(crashingDoc);
    await waitForCondition(() => bridge.getFaultStats().triggered >= 1);

    const stats = bridge.getFaultStats();
    assert.equal(stats.triggered >= 1, true);
    assert.equal(harness.diagnostics.length, 0);

    const cached = harness.cache.get(uri);
    assert.ok(cached);
    assert.equal(cached?.version, 1);
    assert.equal(cached?.analysisState?.parseFailed ?? false, false);
  });
});
