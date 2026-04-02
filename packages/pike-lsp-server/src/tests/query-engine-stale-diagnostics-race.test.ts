import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type {
  Connection,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../services/index.js';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import { computeContentHash, computeLineHashes } from '../services/document-cache.js';
import type { DocumentCacheEntry } from '../core/types.js';

type OpenHandler = (event: { document: TextDocument }) => void;
type SaveHandler = (event: { document: TextDocument }) => void;
type ChangeHandler = (event: { document: TextDocument }) => void;
type CloseHandler = (event: { document: TextDocument }) => void;

function createStatefulMockDocuments() {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>();

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
      openHandler?.({ document });
    },
    emitSave(document: TextDocument): void {
      docs.set(document.uri, document);
      saveHandler?.({ document });
    },
    emitChange(document: TextDocument): void {
      docs.set(document.uri, document);
      changeHandler?.({ document });
    },
    emitClose(document: TextDocument): void {
      docs.delete(document.uri);
      closeHandler?.({ document });
    },
  };
}

function makeCachedEntry(text: string): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
  };
}

describe('Query Engine stale diagnostics race', () => {
  it('does not publish stale syntax errors after rapid save burst', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: Array<{ message: string }> }> =
      [];

    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const connectionLike = {
      sendDiagnostics(params: { uri: string; diagnostics: Array<{ message: string }> }): void {
        diagnosticsPublished.push(params);
      },
      onDidChangeConfiguration(handler: (params: DidChangeConfigurationParams) => void): void {
        onDidChangeConfigurationHandler = handler;
      },
      onDidChangeTextDocument(handler: (params: DidChangeTextDocumentParams) => void): void {
        onDidChangeTextDocumentHandler = handler;
      },
      console: {
        log(): void {},
        warn(): void {},
        error(): void {},
      },
    };

    const documentsLike = createStatefulMockDocuments();
    let revision = 0;

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `open-${revision}` };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `change-${revision}` };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `close-${revision}` };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `config-${revision}` };
        },
        async engineCancelRequest(): Promise<{ accepted: boolean }> {
          return { accepted: true };
        },
        async engineQuery(params: { queryParams?: { text?: string } }): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          const text = params.queryParams?.text ?? '';
          const isInvalid = text.includes('int x = ;');

          await new Promise(resolve => setTimeout(resolve, isInvalid ? 35 : 1));

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
                    diagnostics: isInvalid
                      ? [
                          {
                            message: 'Syntax error: expected expression',
                            severity: 'error',
                            position: { line: 1, character: 9 },
                          },
                        ]
                      : [],
                  },
                },
              },
              revision,
            },
            metrics: { durationMs: isInvalid ? 35 : 1 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used in this test');
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

    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 0 } } });
    }

    const uri = 'file:///tmp/stale-diag-race.pike';
    const v1 = TextDocument.create(uri, 'pike', 1, 'int x = 1;\n');
    const v2 = TextDocument.create(uri, 'pike', 2, 'int x = ;\n');
    const v3 = TextDocument.create(uri, 'pike', 3, 'int x = 2;\n');

    documentsLike.emitOpen(v1);

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: v2.version },
        contentChanges: [{ text: v2.getText() }],
      });
    }
    documentsLike.emitSave(v2);

    await new Promise(resolve => setTimeout(resolve, 2));

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: v3.version },
        contentChanges: [{ text: v3.getText() }],
      });
    }
    documentsLike.emitSave(v3);

    await new Promise(resolve => setTimeout(resolve, 70));

    const publishedForUri = diagnosticsPublished.filter(entry => entry.uri === uri);
    assert.ok(publishedForUri.length > 0, 'Expected diagnostics to be published at least once');
    assert.ok(
      publishedForUri.every(entry => entry.diagnostics.length === 0),
      'No stale syntax diagnostics should be published after final valid document'
    );
  });

  it('forces validation when multiple incremental change batches arrive before debounce', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: Array<{ message: string }> }> =
      [];

    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const uri = 'file:///tmp/multi-change-batch.pike';
    const baseText = 'int x = 1;\n';
    const v2Text = 'int x = 1; \n';
    const v3Text = 'int x = 1;   \n';

    let queryCallCount = 0;
    let cachedEntry = makeCachedEntry(baseText);

    const connectionLike = {
      sendDiagnostics(params: { uri: string; diagnostics: Array<{ message: string }> }): void {
        diagnosticsPublished.push(params);
      },
      onDidChangeConfiguration(handler: (params: DidChangeConfigurationParams) => void): void {
        onDidChangeConfigurationHandler = handler;
      },
      onDidChangeTextDocument(handler: (params: DidChangeTextDocumentParams) => void): void {
        onDidChangeTextDocumentHandler = handler;
      },
      console: {
        log(): void {},
        warn(): void {},
        error(): void {},
      },
    };

    const documentsLike = createStatefulMockDocuments();

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
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'config-1' };
        },
        async engineCancelRequest(): Promise<{ accepted: boolean }> {
          return { accepted: true };
        },
        async engineQuery(): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          queryCallCount += 1;
          return {
            snapshotIdUsed: `snp-${queryCallCount}`,
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
                  diagnostics: { diagnostics: [] },
                },
              },
              revision: queryCallCount,
            },
            metrics: { durationMs: 1 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used in this test');
        },
      },
      documentCache: {
        get(requestedUri: string): DocumentCacheEntry | undefined {
          return requestedUri === uri ? cachedEntry : undefined;
        },
        setPending(): void {},
        set(requestedUri: string, entry: DocumentCacheEntry): void {
          if (requestedUri === uri) {
            cachedEntry = entry;
          }
        },
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

    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 20 } } });
    }

    const v2 = TextDocument.create(uri, 'pike', 2, v2Text);
    const v3 = TextDocument.create(uri, 'pike', 3, v3Text);

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: v2.version },
        contentChanges: [
          {
            range: {
              start: { line: 0, character: 10 },
              end: { line: 0, character: 10 },
            },
            text: ' ',
          },
        ],
      });
    }
    documentsLike.emitChange(v2);

    await new Promise(resolve => setTimeout(resolve, 5));

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: v3.version },
        contentChanges: [
          {
            range: {
              start: { line: 0, character: 11 },
              end: { line: 0, character: 11 },
            },
            text: '  ',
          },
        ],
      });
    }
    documentsLike.emitChange(v3);

    await new Promise(resolve => setTimeout(resolve, 80));

    assert.equal(
      queryCallCount,
      1,
      'Multiple pending change batches should force one validation instead of semantic-skip'
    );
    assert.equal(
      diagnosticsPublished.length,
      1,
      'Validation should still publish diagnostics once'
    );
  });

  it('does not retain stale in-flight requests after close during cancellation race', async () => {
    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;

    const canceledRequestIds: string[] = [];
    const documentsLike = createStatefulMockDocuments();
    let revision = 0;

    const connectionLike = {
      sendDiagnostics(): void {},
      onDidChangeConfiguration(handler: (params: DidChangeConfigurationParams) => void): void {
        onDidChangeConfigurationHandler = handler;
      },
      onDidChangeTextDocument(): void {},
      console: {
        log(): void {},
        warn(): void {},
        error(): void {},
      },
    };

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `open-${revision}` };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `change-${revision}` };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `close-${revision}` };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          revision += 1;
          return { revision, snapshotId: `config-${revision}` };
        },
        async engineCancelRequest(params: { requestId: string }): Promise<{ accepted: boolean }> {
          canceledRequestIds.push(params.requestId);
          await new Promise(resolve => setTimeout(resolve, 30));
          return { accepted: true };
        },
        async engineQuery(params: { queryParams?: { version?: number } }): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          const version = params.queryParams?.version ?? 0;
          await new Promise(resolve => setTimeout(resolve, 120));

          return {
            snapshotIdUsed: `snp-v${version}`,
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
                  diagnostics: { diagnostics: [] },
                },
              },
              revision,
            },
            metrics: { durationMs: 120 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used in this test');
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

    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 0 } } });
    }

    const uri = 'file:///tmp/in-flight-close-race.pike';
    const v1 = TextDocument.create(uri, 'pike', 1, 'int x = 1;\n');
    const v2 = TextDocument.create(uri, 'pike', 2, 'int x = 2;\n');
    const v3 = TextDocument.create(uri, 'pike', 3, 'int x = 3;\n');

    documentsLike.emitOpen(v1);
    documentsLike.emitSave(v2);

    await new Promise(resolve => setTimeout(resolve, 5));
    documentsLike.emitClose(v2);

    await new Promise(resolve => setTimeout(resolve, 40));
    documentsLike.emitOpen(v3);

    await new Promise(resolve => setTimeout(resolve, 15));

    assert.equal(
      canceledRequestIds.length,
      1,
      'Close-race must not retain a stale in-flight request that gets canceled on next open'
    );
    assert.ok(
      canceledRequestIds[0]?.includes(`${uri}:1:`),
      'The only cancellation should target the original version-1 request'
    );
  });
});
