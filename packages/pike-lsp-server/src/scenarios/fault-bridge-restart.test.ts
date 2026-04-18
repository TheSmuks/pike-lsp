import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry } from '../core/types.js';
import {
  createMockBridge,
  createMockDocuments,
  type FaultInjectableMockBridge,
} from '../tests/helpers/test-helpers.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function createHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }> = [];
  const consoleErrors: string[] = [];

  const connection = {
    sendDiagnostics(params: { uri: string; version?: number; diagnostics: unknown[] }) {
      diagnostics.push(params);
    },
    onRequest() {},
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: {
      log() {},
      warn() {},
      error(message: unknown) {
        consoleErrors.push(String(message));
      },
    },
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
    connection as unknown as Connection,
    services as unknown as Services,
    docs
  );

  return { docs, cache, diagnostics, consoleErrors };
}

describe('Fault scenario: bridge restart during validation', () => {
  it('recovers and completes validation without process crash', async () => {
    const bridge = createMockBridge({
      faultInjection: {
        restartAtIteration: 1,
        triggerAfterMs: 5,
        probability: 1,
      },
    }) as FaultInjectableMockBridge;

    const harness = createHarness(bridge);
    const uri = 'file:///fault-restart.pike';
    const doc = TextDocument.create(uri, 'pike', 1, 'int main() { return 1; }\n');

    harness.docs.emitOpen(doc);
    await wait(120);

    const stats = bridge.getFaultStats();
    assert.equal(stats.triggered >= 1, true);
    assert.equal(bridge.isRunning(), true);
    assert.equal(harness.consoleErrors.length, 0);
    assert.ok(harness.cache.get(uri));
  });
});
