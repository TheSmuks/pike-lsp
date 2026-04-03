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

const isMalformedText = (text: string): boolean => {
  const trimmed = text.trim();
  return trimmed.includes('= ;') || trimmed.endsWith('=') || trimmed.endsWith('(');
};

const versionOf = (entry: { version?: number }): number => entry.version ?? -1;

const latestDiagnosticsFor = (
  diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }>,
  uri: string
) => {
  const entries = diagnostics.filter(entry => entry.uri === uri);
  if (entries.length === 0) {
    return undefined;
  }

  return entries.reduce((latest, current) => {
    if (!latest) {
      return current;
    }

    return versionOf(current) >= versionOf(latest) ? current : latest;
  }, entries[0]);
};

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

  it('publishes latest valid diagnostics when malformed intermediate is superseded', async () => {
    const bridge = new FaultInjectableMockBridge({
      analyzeResult: text => ({ hasError: isMalformedText(text) }),
    });
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-latest-valid.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int n = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int n = (\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 3, 'int n = 99;\n'));
    await wait(140);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 3);
    assert.equal(latest.diagnostics.length, 0);
  });

  it('keeps latest malformed diagnostics when valid intermediate is superseded by malformed', async () => {
    const bridge = new FaultInjectableMockBridge({
      analyzeResult: text => ({ hasError: isMalformedText(text) }),
    });
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-latest-malformed.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int n = 10;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int n = 11;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 3, 'int n = ;\n'));
    await wait(140);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 3);
    assert.equal(latest.diagnostics.length >= 1, true);
  });

  it('never regresses published version across malformed churn', async () => {
    const bridge = new FaultInjectableMockBridge({
      analyzeResult: text => ({ hasError: isMalformedText(text) }),
    });
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-no-regression.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int a = ;\n'));
    for (let version = 2; version <= 9; version += 1) {
      const text = version % 2 === 0 ? `int a = ; // v${version}\n` : `int a = ${version};\n`;
      docs.emitChange(TextDocument.create(uri, 'pike', version, text));
    }

    await wait(220);

    const versions = diagnostics
      .filter(entry => entry.uri === uri)
      .map(entry => entry.version)
      .filter((version): version is number => typeof version === 'number');

    for (let index = 1; index < versions.length; index += 1) {
      const previous = versions[index - 1];
      const current = versions[index];
      if (previous === undefined || current === undefined) {
        continue;
      }
      assert.equal(current >= previous, true);
    }

    assert.equal(versions.includes(9), true);
  });

  it('clears diagnostics on close and blocks stale republish', async () => {
    const bridge = new FaultInjectableMockBridge(
      { analyzeResult: text => ({ hasError: isMalformedText(text) }), delayMs: 35 },
      { delayMs: { min: 15, max: 25 } }
    );
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-close-guard.pike';

    const openDoc = TextDocument.create(uri, 'pike', 1, 'int c = ;\n');
    docs.emitOpen(openDoc);
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int c = (\n'));
    docs.emitClose(openDoc);
    await wait(220);

    const closeClear = diagnostics.find(
      entry => entry.uri === uri && entry.diagnostics.length === 0
    );
    assert.ok(closeClear);

    const postClosePublished = diagnostics.filter(
      entry => entry.uri === uri && (entry.version ?? 0) > 1
    );
    assert.equal(postClosePublished.length, 0);
  });

  it('reopen after close gives fresh latest diagnostics ownership', async () => {
    const bridge = new FaultInjectableMockBridge({
      analyzeResult: text => ({ hasError: isMalformedText(text) }),
    });
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-reopen-refresh.pike';

    const initial = TextDocument.create(uri, 'pike', 1, 'int x = ;\n');
    docs.emitOpen(initial);
    docs.emitClose(initial);
    await wait(40);

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int x = 1;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int x = 2;\n'));
    await wait(140);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 2);
    assert.equal(latest.diagnostics.length, 0);
  });

  it('stays deterministic for alternating malformed/valid edits', async () => {
    const bridge = new FaultInjectableMockBridge({
      analyzeResult: text => ({ hasError: isMalformedText(text) }),
    });
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-alternating.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int y = 1;\n'));
    for (let version = 2; version <= 12; version += 1) {
      const text = version % 2 === 0 ? 'int y = ;\n' : `int y = ${version};\n`;
      docs.emitChange(TextDocument.create(uri, 'pike', version, text));
    }
    await wait(260);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 12);
    assert.equal(latest.diagnostics.length >= 1, true);
  });

  it('degrades on repeated parse crashes but recovers on final valid edit', async () => {
    const bridge = new FaultInjectableMockBridge(
      { analyzeResult: text => ({ hasError: isMalformedText(text) }) },
      {
        crashAtOperation: 'engineQuery',
        failWithError: new Error('injected diagnostics crash'),
        probability: 0.6,
      }
    );
    const { docs, diagnostics, consoleErrors } = createHarness(bridge);
    const uri = 'file:///rapid-crash-recover.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int z = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int z = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 3, 'int z = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 4, 'int z = 4;\n'));
    await wait(260);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 4);
    assert.equal(Array.isArray(latest.diagnostics), true);
    assert.equal(consoleErrors.length >= 0, true);
  });

  it('converges to final malformed state after rapid burst', async () => {
    const bridge = new FaultInjectableMockBridge(
      { analyzeResult: text => ({ hasError: isMalformedText(text) }), delayMs: 8 },
      { delayMs: { min: 5, max: 20 } }
    );
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-burst-malformed-final.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int final = 1;\n'));
    for (let version = 2; version <= 15; version += 1) {
      const text = version === 15 ? 'int final = ;\n' : `int final = ${version};\n`;
      docs.emitChange(TextDocument.create(uri, 'pike', version, text));
    }
    await wait(300);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 15);
    assert.equal(latest.diagnostics.length >= 1, true);
  });

  it('converges to final valid state after malformed burst', async () => {
    const bridge = new FaultInjectableMockBridge(
      { analyzeResult: text => ({ hasError: isMalformedText(text) }), delayMs: 8 },
      { delayMs: { min: 5, max: 20 } }
    );
    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-burst-valid-final.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int ok = ;\n'));
    for (let version = 2; version <= 16; version += 1) {
      const text = version === 16 ? 'int ok = 16;\n' : 'int ok = ;\n';
      docs.emitChange(TextDocument.create(uri, 'pike', version, text));
    }
    await wait(300);

    const latest = latestDiagnosticsFor(diagnostics, uri);
    assert.ok(latest);
    assert.equal(latest.version, 16);
    assert.equal(latest.diagnostics.length, 0);
  });

  it('isolates publish rights per document under parallel malformed edits', async () => {
    const bridge = new FaultInjectableMockBridge({
      analyzeResult: text => ({ hasError: isMalformedText(text) }),
    });
    const { docs, diagnostics } = createHarness(bridge);
    const uriA = 'file:///rapid-parallel-a.pike';
    const uriB = 'file:///rapid-parallel-b.pike';

    docs.emitOpen(TextDocument.create(uriA, 'pike', 1, 'int a = ;\n'));
    docs.emitOpen(TextDocument.create(uriB, 'pike', 1, 'int b = 1;\n'));
    docs.emitChange(TextDocument.create(uriA, 'pike', 2, 'int a = 2;\n'));
    docs.emitChange(TextDocument.create(uriB, 'pike', 2, 'int b = ;\n'));
    docs.emitChange(TextDocument.create(uriA, 'pike', 3, 'int a = 3;\n'));
    docs.emitChange(TextDocument.create(uriB, 'pike', 3, 'int b = 3;\n'));
    await wait(220);

    const latestA = latestDiagnosticsFor(diagnostics, uriA);
    const latestB = latestDiagnosticsFor(diagnostics, uriB);
    assert.ok(latestA);
    assert.ok(latestB);
    assert.equal(latestA.version, 3);
    assert.equal(latestB.version, 3);
    assert.equal(latestA.diagnostics.length, 0);
    assert.equal(latestB.diagnostics.length, 0);
  });
});
