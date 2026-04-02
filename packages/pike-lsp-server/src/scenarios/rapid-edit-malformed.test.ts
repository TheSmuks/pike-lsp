import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry } from '../core/types.js';
import { createMockDocuments } from '../tests/helpers/test-helpers.js';
import { FaultInjectableMockBridge } from '../tests/helpers/mock-bridge.js';

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
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 5 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerDiagnosticsHandlers(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  return { docs, diagnostics, consoleErrors };
}

describe('Scenario: rapid malformed edits degrade gracefully', () => {
  it('keeps diagnostics flowing across malformed burst and recovers on valid edit', async () => {
    const bridge = new FaultInjectableMockBridge(
      {},
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('injected parse hard-fail'),
        probability: 1,
      }
    );

    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-malformed.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int x = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int x = (\n'));
    await wait(80);

    const malformedDiagCount = diagnostics.filter(entry => entry.uri === uri).length;
    assert.equal(
      malformedDiagCount >= 1,
      true,
      'Malformed rapid edits must still publish degraded diagnostics'
    );

    bridge.setFaultConfig({});
    docs.emitChange(TextDocument.create(uri, 'pike', 3, 'int x = 3;\n'));
    await wait(80);

    const recovered = diagnostics.find(entry => entry.uri === uri && entry.version === 3);
    assert.ok(recovered, 'Validation must recover and publish diagnostics for the fixed edit');
    assert.equal(Array.isArray(recovered.diagnostics), true);
  });
});
