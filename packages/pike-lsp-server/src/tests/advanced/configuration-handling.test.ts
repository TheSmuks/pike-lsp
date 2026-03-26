import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type {
  Connection,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { Services } from '../../services/index.js';
import { registerDiagnosticsHandlers } from '../../features/diagnostics/index.js';

type OpenHandler = (event: { document: TextDocument }) => void;
type SaveHandler = (event: { document: TextDocument }) => void;
type ChangeHandler = (event: { document: TextDocument }) => void;
type CloseHandler = (event: { document: TextDocument }) => void;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await sleep(5);
  }
  assert.ok(predicate(), `condition not met within ${timeoutMs}ms`);
}

function createMockDocuments(seedDocs: TextDocument[]) {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>(seedDocs.map(doc => [doc.uri, doc]));

  return {
    get(uri: string): TextDocument | undefined {
      return docs.get(uri);
    },
    all(): TextDocument[] {
      return [...docs.values()];
    },
    onDidOpen(handler: OpenHandler): void {
      openHandler = handler;
    },
    onDidSave(handler: SaveHandler): void {
      saveHandler = handler;
    },
    onDidChangeContent(handler: ChangeHandler): void {
      changeHandler = handler;
    },
    onDidClose(handler: CloseHandler): void {
      closeHandler = handler;
    },
    emitOpen(document: TextDocument): void {
      docs.set(document.uri, document);
      if (openHandler) {
        openHandler({ document });
      }
    },
    emitSave(document: TextDocument): void {
      docs.set(document.uri, document);
      if (saveHandler) {
        saveHandler({ document });
      }
    },
    emitChange(document: TextDocument): void {
      docs.set(document.uri, document);
      if (changeHandler) {
        changeHandler({ document });
      }
    },
    emitClose(document: TextDocument): void {
      docs.delete(document.uri);
      if (closeHandler) {
        closeHandler({ document });
      }
    },
    dropWithoutClose(uri: string): void {
      docs.delete(uri);
    },
  };
}

function makeEngineQueryResponse(text: string) {
  const invalid = text.includes('= ;');
  return {
    snapshotIdUsed: `snp-${Date.now()}`,
    result: {
      analyzeResult: {
        result: {
          parse: { symbols: [], diagnostics: [] },
          introspect: {
            success: 0,
            symbols: [],
            functions: [],
            variables: [],
            classes: [],
            inherits: [],
            diagnostics: [],
          },
          diagnostics: {
            diagnostics: invalid
              ? [
                  {
                    message: 'Syntax error',
                    severity: 'error',
                    position: { line: 1, character: 6 },
                  },
                ]
              : [],
          },
        },
      },
      revision: 1,
    },
    metrics: { durationMs: 1 },
  };
}

function createHarness(seedDocs: TextDocument[]) {
  const diagnosticsPublished: Array<{ uri: string; diagnostics: unknown[] }> = [];
  const engineUpdateConfigCalls: Array<Record<string, unknown>> = [];
  let queryCount = 0;

  let configHandler: ((params: DidChangeConfigurationParams) => void) | undefined;
  let textChangeHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

  const connectionLike = {
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }): void {
      diagnosticsPublished.push(params);
    },
    onDidChangeConfiguration(handler: (params: DidChangeConfigurationParams) => void): void {
      configHandler = handler;
    },
    onDidChangeTextDocument(handler: (params: DidChangeTextDocumentParams) => void): void {
      textChangeHandler = handler;
    },
    console: {
      log(): void {},
      warn(): void {},
      error(): void {},
    },
  };

  const documentsLike = createMockDocuments(seedDocs);

  const servicesLike = {
    bridge: {
      isRunning(): boolean {
        return true;
      },
      async start(): Promise<void> {},
      async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'open-1' };
      },
      async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'change-1' };
      },
      async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'close-1' };
      },
      async engineUpdateConfig(params: Record<string, unknown>): Promise<{
        revision: number;
        snapshotId: string;
      }> {
        engineUpdateConfigCalls.push(params);
        return { revision: 1, snapshotId: 'config-1' };
      },
      async engineCancelRequest(): Promise<{ accepted: boolean }> {
        return { accepted: true };
      },
      async engineQuery(params: {
        queryParams?: {
          text?: string;
        };
      }): Promise<Record<string, unknown>> {
        queryCount += 1;
        const text = params.queryParams?.text ?? '';
        return makeEngineQueryResponse(text);
      },
      async analyze(): Promise<never> {
        throw new Error('analyze fallback should not be used in configuration tests');
      },
    },
    documentCache: {
      get(): undefined {
        return undefined;
      },
      setPending(): void {},
      set(): void {},
      delete(): void {},
    },
    typeDatabase: {
      setProgram(): void {},
      removeProgram(): void {},
      getMemoryStats(): {
        programCount: number;
        symbolCount: number;
        totalBytes: number;
        utilizationPercent: number;
      } {
        return {
          programCount: 0,
          symbolCount: 0,
          totalBytes: 0,
          utilizationPercent: 0,
        };
      },
    },
    workspaceIndex: {
      indexDocument(): void {},
      removeDocument(): void {},
    },
    includeResolver: null,
    logger: {
      debug(): void {},
      info(): void {},
      warn(): void {},
      error(): void {},
    },
  };

  registerDiagnosticsHandlers(
    connectionLike as unknown as Connection,
    servicesLike as unknown as Services,
    documentsLike as unknown as TextDocuments<TextDocument>
  );

  return {
    documentsLike,
    diagnosticsPublished,
    engineUpdateConfigCalls,
    getQueryCount(): number {
      return queryCount;
    },
    getConfigHandler(): (params: DidChangeConfigurationParams) => void {
      assert.ok(configHandler, 'configuration handler must be registered');
      return configHandler;
    },
    getTextChangeHandler(): (params: DidChangeTextDocumentParams) => void {
      assert.ok(textChangeHandler, 'text change handler must be registered');
      return textChangeHandler;
    },
  };
}

describe('Configuration Handling', () => {
  it('registers configuration handler and forwards pike settings to engine', async () => {
    const harness = createHarness([]);
    const onConfig = harness.getConfigHandler();

    onConfig({
      settings: {
        pike: {
          diagnosticDelay: 12,
          maxNumberOfProblems: 42,
        },
      },
    });

    await waitFor(() => harness.engineUpdateConfigCalls.length === 1, 100);
    assert.deepEqual(harness.engineUpdateConfigCalls[0], {
      settings: {
        pike: {
          diagnosticDelay: 12,
          maxNumberOfProblems: 42,
        },
      },
    });
  });

  it('revalidates all open documents after configuration change', async () => {
    const docA = TextDocument.create('file:///tmp/config-a.pike', 'pike', 1, 'int a = 1;\n');
    const docB = TextDocument.create('file:///tmp/config-b.pike', 'pike', 1, 'int b = 2;\n');
    const harness = createHarness([docA, docB]);

    const onConfig = harness.getConfigHandler();
    onConfig({ settings: { pike: { diagnosticDelay: 0 } } });

    await waitFor(() => harness.diagnosticsPublished.length >= 2, 200);
    const uris = new Set(harness.diagnosticsPublished.map(entry => entry.uri));
    assert.equal(uris.has(docA.uri), true);
    assert.equal(uris.has(docB.uri), true);
  });

  it('uses updated diagnosticDelay for subsequent debounced change validation', async () => {
    const harness = createHarness([]);
    const onConfig = harness.getConfigHandler();

    onConfig({ settings: { pike: { diagnosticDelay: 30 } } });
    await waitFor(() => harness.engineUpdateConfigCalls.length === 1, 100);

    const changedDoc = TextDocument.create('file:///tmp/config-delay.pike', 'pike', 1, 'int x = 1;\n');
    harness.documentsLike.emitChange(changedDoc);

    await sleep(10);
    assert.equal(harness.getQueryCount(), 0);

    await waitFor(() => harness.getQueryCount() >= 1, 100);
  });

  it('falls back to default debounce behavior when pike section is missing', async () => {
    const harness = createHarness([]);
    const onConfig = harness.getConfigHandler();

    onConfig({ settings: {} });
    await waitFor(() => harness.engineUpdateConfigCalls.length === 1, 100);

    const changedDoc = TextDocument.create(
      'file:///tmp/config-default-delay.pike',
      'pike',
      1,
      'int y = 2;\n'
    );
    harness.documentsLike.emitChange(changedDoc);

    await sleep(80);
    assert.equal(harness.getQueryCount(), 0);

    await waitFor(() => harness.getQueryCount() >= 1, 400);
  });

  it('captures incremental changes before debounced validation', async () => {
    const harness = createHarness([]);
    const onConfig = harness.getConfigHandler();
    const onTextChange = harness.getTextChangeHandler();

    onConfig({ settings: { pike: { diagnosticDelay: 0 } } });

    const uri = 'file:///tmp/config-incremental.pike';
    const text = 'int z = ;\n';
    const changedDoc = TextDocument.create(uri, 'pike', 2, text);

    onTextChange({
      textDocument: { uri, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 9 },
          },
          text: ';',
        },
      ],
    });
    harness.documentsLike.emitChange(changedDoc);

    await waitFor(() => harness.getQueryCount() >= 1, 200);
    const published = harness.diagnosticsPublished.find(entry => entry.uri === uri);
    assert.ok(published, 'diagnostics should be published for changed document');
  });

  it('cleans version tracking when debounce runs after document disappears without close event', async () => {
    type TrackedMapOperation = {
      map: Map<unknown, unknown>;
      op: 'set' | 'delete';
      key: unknown;
      value?: unknown;
    };

    const trackedOps: TrackedMapOperation[] = [];
    const OriginalMap = globalThis.Map;

    class TrackingMap<K, V> extends OriginalMap<K, V> {
      override set(key: K, value: V): this {
        trackedOps.push({ map: this as unknown as Map<unknown, unknown>, op: 'set', key, value });
        return super.set(key, value);
      }

      override delete(key: K): boolean {
        trackedOps.push({ map: this as unknown as Map<unknown, unknown>, op: 'delete', key });
        return super.delete(key);
      }
    }

    (globalThis as unknown as { Map: typeof Map }).Map = TrackingMap as unknown as typeof Map;

    try {
      const harness = createHarness([]);
      const onConfig = harness.getConfigHandler();
      onConfig({ settings: { pike: { diagnosticDelay: 0 } } });

      const uri = 'file:///tmp/config-debounce-disappeared-doc.pike';
      const changedDoc = TextDocument.create(uri, 'pike', 9, 'int orphaned = 1;\n');

      harness.documentsLike.emitChange(changedDoc);
      harness.documentsLike.dropWithoutClose(uri);

      await sleep(20);

      assert.equal(
        harness.getQueryCount(),
        0,
        'Debounced validation should stop when live document is missing'
      );

      const mapsWithVersionSet = new Set(
        trackedOps
          .filter(op => op.op === 'set' && op.key === uri && typeof op.value === 'number')
          .map(op => op.map)
      );

      assert.ok(
        mapsWithVersionSet.size > 0,
        'Expected debounce path to store validation version for changed URI'
      );

      const versionMapDeleteSeen = trackedOps.some(
        op => op.op === 'delete' && op.key === uri && mapsWithVersionSet.has(op.map)
      );

      assert.equal(
        versionMapDeleteSeen,
        true,
        'Debounce path must always clear validationVersions entry when document is no longer live'
      );
    } finally {
      (globalThis as unknown as { Map: typeof Map }).Map = OriginalMap;
    }
  });
});
