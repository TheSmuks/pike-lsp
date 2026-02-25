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

type OpenHandler = (event: { document: TextDocument }) => void;
type SaveHandler = (event: { document: TextDocument }) => void;
type ChangeHandler = (event: { document: TextDocument }) => void;
type CloseHandler = (event: { document: TextDocument }) => void;

function createMockDocuments() {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;

  return {
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
    all(): TextDocument[] {
      return [];
    },
    emitOpen(document: TextDocument): void {
      openHandler?.({ document });
    },
    emitSave(document: TextDocument): void {
      saveHandler?.({ document });
    },
    emitChange(document: TextDocument): void {
      changeHandler?.({ document });
    },
    emitClose(document: TextDocument): void {
      closeHandler?.({ document });
    },
  };
}

describe('Query Engine diagnostics cancellation stress', () => {
  it('publishes only latest diagnostics after repeated superseded cancels', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: unknown[] }> = [];

    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const pendingRejectByRequestId = new Map<string, (reason?: unknown) => void>();
    let queryCallCount = 0;
    let cancelCount = 0;
    let successfulQueryCount = 0;

    const connectionLike = {
      sendDiagnostics(params: { uri: string; diagnostics: unknown[] }): void {
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

    const documentsLike = createMockDocuments();

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snp-open' };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snp-change' };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snp-close' };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snp-config' };
        },
        async engineCancelRequest(params: { requestId: string }): Promise<{ accepted: boolean }> {
          cancelCount += 1;
          const reject = pendingRejectByRequestId.get(params.requestId);
          if (reject) {
            reject(new Error('request cancelled'));
            pendingRejectByRequestId.delete(params.requestId);
          }
          return { accepted: true };
        },
        async engineQuery(params: { requestId: string }): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          queryCallCount += 1;
          const isSupersededRequest = queryCallCount % 2 === 1;

          if (isSupersededRequest) {
            return await new Promise((_, reject: (reason?: unknown) => void) => {
              pendingRejectByRequestId.set(params.requestId, reject);
            });
          }

          successfulQueryCount += 1;
          return {
            snapshotIdUsed: `snp-${successfulQueryCount}`,
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
              revision: successfulQueryCount,
            },
            metrics: { durationMs: 1 },
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

    const uri = 'file:///tmp/qe2-cancel-stress.pike';
    const iterations = 25;

    for (let i = 0; i < iterations; i++) {
      const openDocument = TextDocument.create(uri, 'pike', i * 2 + 1, `int x = ${i};\n`);
      const saveDocument = TextDocument.create(uri, 'pike', i * 2 + 2, `int x = ${i + 1};\n`);

      documentsLike.emitOpen(openDocument);
      if (onDidChangeTextDocumentHandler) {
        onDidChangeTextDocumentHandler({
          textDocument: { uri, version: saveDocument.version },
          contentChanges: [{ text: saveDocument.getText() }],
        });
      }
      documentsLike.emitSave(saveDocument);

      await new Promise(resolve => setTimeout(resolve, 1));
    }

    await new Promise(resolve => setTimeout(resolve, 10));

    assert.equal(
      successfulQueryCount,
      iterations,
      'Each iteration should produce one successful latest-query response'
    );
    assert.equal(
      diagnosticsPublished.length,
      iterations,
      'Canceled/superseded requests must not publish diagnostics'
    );
    assert.ok(
      cancelCount >= iterations,
      'Every superseded request should trigger cancellation forwarding'
    );
    assert.equal(
      pendingRejectByRequestId.size,
      0,
      'No canceled request promises should remain unresolved'
    );
  });
});
