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

interface Harness {
  docs: ReturnType<typeof createMockDocuments>;
  diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }>;
  emitConfigChange: () => void;
}

function isMalformedIntermediate(text: string): boolean {
  const trimmed = text.trim();
  return (
    /=\s*;/.test(trimmed) ||
    /=\s*\($/.test(trimmed) ||
    /\+\s*;/.test(trimmed) ||
    /\{\s*$/.test(trimmed) ||
    /\(\s*\n?$/.test(trimmed)
  );
}

function createHarness(bridge: FaultInjectableMockBridge): Harness {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }> = [];
  let onDidChangeConfiguration: ((params: { settings: Record<string, unknown> }) => void) | null =
    null;

  const connection = {
    sendDiagnostics(params: { uri: string; version?: number; diagnostics: unknown[] }) {
      diagnostics.push(params);
    },
    onRequest() {},
    onDidChangeConfiguration(handler: (params: { settings: Record<string, unknown> }) => void) {
      onDidChangeConfiguration = handler;
    },
    onDidChangeTextDocument() {},
    console: {
      log() {},
      warn() {},
      error() {},
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

  return {
    docs,
    diagnostics,
    emitConfigChange: () => {
      onDidChangeConfiguration?.({ settings: { pike: { diagnosticDelay: 5 } } });
    },
  };
}

function assertMonotonicVersions(
  diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }>,
  uri: string
): void {
  const versions = diagnostics
    .filter(entry => entry.uri === uri)
    .map(entry => entry.version)
    .filter((version): version is number => typeof version === 'number');

  for (let index = 1; index < versions.length; index += 1) {
    assert.equal(versions[index]! >= versions[index - 1]!, true);
  }
}

describe('Scenario: rapid malformed edits keep diagnostics latest-wins', () => {
  const transitionCases = [
    {
      name: 'missing-expression -> fixed assignment',
      steps: ['int x = ;\n', 'int x = 1;\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'unclosed-paren -> closed expression',
      steps: ['int x = (\n', 'int x = (1 + 2);\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'open-brace transition -> completed block',
      steps: ['int main() {\n', 'int main() { return 0; }\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'malformed arithmetic tail -> valid arithmetic',
      steps: ['int x = 10 + ;\n', 'int x = 10 + 2;\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'malformed -> malformed -> fixed',
      steps: ['int x = ;\n', 'int x = (\n', 'int x = 3;\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'valid -> malformed intermediate -> valid',
      steps: ['int x = 1;\n', 'int x = ;\n', 'int x = 2;\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'nested malformed transitions recover at latest revision',
      steps: ['int x = ;\n', 'int x = 1 + ;\n', 'int x = (\n', 'int x = (4);\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'latest malformed retains diagnostics when not fixed',
      steps: ['int x = 1;\n', 'int x = ;\n', 'int x = (\n'],
      finalHasDiagnostics: true,
    },
    {
      name: 'repeated malformed lines do not regress to older versions',
      steps: ['int x = ;\n', 'int x = ;\n', 'int x = ;\n', 'int x = 7;\n'],
      finalHasDiagnostics: false,
    },
    {
      name: 'long burst with alternating malformed/valid converges to latest valid',
      steps: [
        'int x = ;\n',
        'int x = 1;\n',
        'int x = (\n',
        'int x = 2;\n',
        'int x = ;\n',
        'int x = 3;\n',
      ],
      finalHasDiagnostics: false,
    },
  ] as const;

  for (const testCase of transitionCases) {
    it(`handles ${testCase.name}`, async () => {
      const bridge = new FaultInjectableMockBridge({
        delayMs: 12,
        analyzeResult: text =>
          isMalformedIntermediate(text)
            ? { hasError: true, errorMessage: 'Syntax error: malformed intermediate state' }
            : { hasError: false },
      });

      const { docs, diagnostics } = createHarness(bridge);
      const uri = `file:///rapid-malformed-${testCase.name.replace(/\s+/g, '-')}.pike`;

      docs.emitOpen(TextDocument.create(uri, 'pike', 1, testCase.steps[0]));
      for (let index = 1; index < testCase.steps.length; index += 1) {
        docs.emitChange(TextDocument.create(uri, 'pike', index + 1, testCase.steps[index]!));
      }

      await wait(160);

      const uriDiagnostics = diagnostics.filter(entry => entry.uri === uri);
      assert.equal(uriDiagnostics.length > 0, true);
      assertMonotonicVersions(diagnostics, uri);

      const last = uriDiagnostics[uriDiagnostics.length - 1];
      assert.equal(last?.version, testCase.steps.length);

      const finalHasDiagnostics = (last?.diagnostics.length ?? 0) > 0;
      assert.equal(finalHasDiagnostics, testCase.finalHasDiagnostics);
    });
  }

  it('suppresses stale delayed malformed publish after a newer valid revision', async () => {
    const bridge = new FaultInjectableMockBridge(
      {
        delayMs: 30,
        analyzeResult: text =>
          isMalformedIntermediate(text)
            ? { hasError: true, errorMessage: 'Syntax error: delayed malformed' }
            : { hasError: false },
      },
      {
        delayMs: { min: 10, max: 25 },
      }
    );

    const { docs, diagnostics } = createHarness(bridge);
    const uri = 'file:///rapid-malformed-supersede.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int x = ;\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int x = (\n'));
    docs.emitChange(TextDocument.create(uri, 'pike', 3, 'int x = 9;\n'));
    await wait(220);

    const uriDiagnostics = diagnostics.filter(entry => entry.uri === uri);
    assert.equal(uriDiagnostics.length > 0, true);
    assertMonotonicVersions(diagnostics, uri);

    const last = uriDiagnostics[uriDiagnostics.length - 1];
    assert.equal(last?.version, 3);
    assert.equal((last?.diagnostics.length ?? 0) === 0, true);
  });

  it('keeps latest config-triggered validation ownership for malformed transitions', async () => {
    const bridge = new FaultInjectableMockBridge({
      delayMs: 18,
      analyzeResult: text =>
        isMalformedIntermediate(text)
          ? { hasError: true, errorMessage: 'Syntax error: config race malformed' }
          : { hasError: false },
    });

    const { docs, diagnostics, emitConfigChange } = createHarness(bridge);
    const uri = 'file:///rapid-malformed-config.pike';

    docs.emitOpen(TextDocument.create(uri, 'pike', 1, 'int x = ;\n'));
    emitConfigChange();
    docs.emitChange(TextDocument.create(uri, 'pike', 2, 'int x = 42;\n'));
    docs.emitSave(TextDocument.create(uri, 'pike', 2, 'int x = 42;\n'));
    emitConfigChange();
    await wait(220);

    const uriDiagnostics = diagnostics.filter(entry => entry.uri === uri);
    assertMonotonicVersions(diagnostics, uri);
    assert.equal(
      uriDiagnostics.every(entry => (entry.version ?? 0) <= 2),
      true
    );
    if (uriDiagnostics.length > 0) {
      const last = uriDiagnostics[uriDiagnostics.length - 1];
      assert.equal(last?.version, 2);
      assert.equal((last?.diagnostics.length ?? 0) === 0, true);
    }
  });
});
