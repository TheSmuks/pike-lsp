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
});
