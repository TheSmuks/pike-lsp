import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, DidChangeConfigurationParams } from 'vscode-languageserver/node.js';
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
    onDidChangeConfiguration(_handler: (params: DidChangeConfigurationParams) => void) {},
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
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerDiagnosticsHandlers(
    connection as unknown as Connection,
    services as unknown as Services,
    docs
  );

  return { docs, diagnostics, consoleErrors };
}

describe('Fault scenario: QE2 RFC invariants', () => {
  it('INV-04: cancelled or superseded work never publishes outputs', async () => {
    const bridge = createMockBridge({
      delayMs: 40,
    }) as FaultInjectableMockBridge;

    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///fault-invariant-cancel.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int v = 1;\n'));
    await wait(5);
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int v = 2;\n'));
    await wait(160);

    const version1Published = diagnostics.some(entry => entry.uri === uri && entry.version === 1);
    const version2Published = diagnostics.some(entry => entry.uri === uri && entry.version === 2);

    assert.equal(version1Published, false, 'Superseded diagnostics should not publish for v1');
    assert.equal(version2Published, true, 'Latest diagnostics must publish for v2');
  });

  it('INV-08: parsing under active edits never hard-fails', async () => {
    const bridge = createMockBridge({
      faultInjection: {
        crashAtOperation: 'engineQuery',
        probability: 1,
        failWithError: new Error('injected parse crash'),
      },
    }) as FaultInjectableMockBridge;

    const { docs, diagnostics, consoleErrors } = createHarness(bridge);
    const uri = 'file:///fault-invariant-parse.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int x = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int x = (\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 3, 'int x = 3;\n'));
    await wait(160);

    const publishedForLatestVersion = diagnostics.some(
      entry => entry.uri === uri && entry.version === 3
    );
    assert.equal(
      publishedForLatestVersion,
      true,
      'Diagnostics should still publish after hard-fail'
    );
    assert.equal(consoleErrors.length, 0);
  });
});
