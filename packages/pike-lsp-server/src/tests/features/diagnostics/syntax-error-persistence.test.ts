/**
 * Syntax Error Diagnostics Persistence - Integration Tests
 *
 * Regression tests for the bug where syntax error diagnostics persisted
 * after the user edited code.
 *
 * Root cause (two parts):
 * 1. classifyChange() returned canSkip:true when previous parse had errors
 *    (parseFailed), meaning we never re-validated after the user fixed the error.
 * 2. The skip path in validateDocumentDebounced() never called
 *    connection.sendDiagnostics(), leaving stale diagnostics visible.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import type {
  Connection,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../../services/index.js';
import { registerDiagnosticsHandlers } from '../../../features/diagnostics/index.js';
import { computeContentHash, computeLineHashes } from '../../../services/document-cache.js';
import type { DocumentCacheEntry } from '../../../core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeCachedEntry(
  text: string,
  parseFailed = false,
  diagnostics: unknown[] = []
): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: diagnostics as DocumentCacheEntry['diagnostics'],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
    analysisState: { isStale: false, parseFailed },
  };
}

// =========================================================================
// Test: parseFailed must force re-validation on next edit
// =========================================================================
describe('Syntax error diagnostics persistence (integration)', () => {
  it('forces re-validation after syntax error and publishes empty diagnostics on fix', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: Array<{ message: string }> }> =
      [];
    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const uri = 'file:///test-parse-failed.pike';
    let cachedEntry: DocumentCacheEntry | undefined;
    let queryCallCount = 0;

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
      console: { log() {}, warn() {}, error() {} },
    };

    const documentsLike = createStatefulMockDocuments();

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-open-1' };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-change-1' };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-close-1' };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-config-1' };
        },
        async engineCancelRequest(): Promise<{ accepted: boolean }> {
          return { accepted: true };
        },
        async engineQuery(params: { queryParams?: { text?: string } }): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          queryCallCount++;
          const text = params.queryParams?.text ?? '';
          const hasError = text.includes('int x = ;');
          const diags = hasError
            ? [
                {
                  message: 'Syntax error: expected expression',
                  severity: 'error',
                  position: { line: 1, character: 8 },
                },
              ]
            : [];

          return {
            snapshotIdUsed: `snp-${queryCallCount}`,
            result: {
              analyzeResult: {
                result: {
                  parse: { symbols: [], diagnostics: [] },
                  introspect: {
                    success: hasError ? 0 : 1,
                    symbols: [],
                    functions: [],
                    variables: [],
                    classes: [],
                    inherits: [],
                    diagnostics: [],
                  },
                  diagnostics: { diagnostics: diags },
                },
              },
              revision: 1,
            },
            metrics: { durationMs: 1 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used');
        },
        async findOccurrences(): Promise<{ occurrences: unknown[] }> {
          return { occurrences: [] };
        },
      },
      documentCache: {
        get(requestedUri: string): DocumentCacheEntry | undefined {
          return requestedUri === uri ? cachedEntry : undefined;
        },
        setPending(): void {},
        set(requestedUri: string, entry: DocumentCacheEntry): void {
          if (requestedUri === uri) cachedEntry = entry;
        },
        delete(): void {},
      },
      typeDatabase: {
        setProgram(): void {},
        removeProgram(): void {},
        getMemoryStats() {
          return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
        },
      },
      workspaceIndex: {
        indexDocument(): void {},
        removeDocument(): void {},
      },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    registerDiagnosticsHandlers(
      connectionLike as unknown as Connection,
      servicesLike as unknown as Services,
      documentsLike as unknown as TextDocuments<TextDocument>
    );

    // Set diagnostic delay to 0 for immediate validation
    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 0 } } });
    }

    // --- Step 1: Open document with syntax error ---
    const docError = TextDocument.create(uri, 'pike', 1, 'int x = ;\n');
    documentsLike.emitOpen(docError);

    // Wait for validation to complete
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify: error diagnostics were published
    const afterOpen = diagnosticsPublished.filter(d => d.uri === uri);
    assert.ok(afterOpen.length > 0, 'Should publish diagnostics after open');
    const lastAfterOpen = afterOpen[afterOpen.length - 1];
    assert.ok(
      lastAfterOpen.diagnostics.length > 0,
      'Should show syntax error after opening with broken code'
    );

    // Verify: parseFailed was set in cache
    assert.ok(cachedEntry?.analysisState?.parseFailed, 'parseFailed should be true after error');

    // --- Step 2: Fix the syntax error ---
    const docFixed = TextDocument.create(uri, 'pike', 2, 'int x = 1;\n');

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: 2 },
        contentChanges: [
          {
            range: {
              start: { line: 0, character: 8 },
              end: { line: 0, character: 8 },
            },
            text: '1;',
          },
        ],
      });
    }
    documentsLike.emitChange(docFixed);

    // Wait for debounced validation
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify: diagnostics should be empty after fix
    const afterFix = diagnosticsPublished.filter(d => d.uri === uri);
    const lastAfterFix = afterFix[afterFix.length - 1];
    assert.ok(
      lastAfterFix.diagnostics.length === 0,
      `Diagnostics should be empty after fix. Got: ${JSON.stringify(lastAfterFix.diagnostics)}`
    );

    // Verify: bridge was called at least twice (open + fix)
    assert.ok(
      queryCallCount >= 2,
      `Bridge should have been called at least twice. Calls: ${queryCallCount}`
    );
  });

  // =========================================================================
  // Test: Fix error on same line, then edit different line → should re-validate
  // =========================================================================
  it('re-validates when fixing error on the same line', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: Array<{ message: string }> }> =
      [];
    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const uri = 'file:///test-fix-same-line.pike';
    let cachedEntry: DocumentCacheEntry | undefined;
    let queryCallCount = 0;

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
      console: { log() {}, warn() {}, error() {} },
    };

    const documentsLike = createStatefulMockDocuments();

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-1' };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-2' };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-3' };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-4' };
        },
        async engineCancelRequest(): Promise<{ accepted: boolean }> {
          return { accepted: true };
        },
        async engineQuery(params: { queryParams?: { text?: string } }): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          queryCallCount++;
          const text = params.queryParams?.text ?? '';
          const hasError = text.includes('int x = ;');
          const diags = hasError
            ? [
                {
                  message: 'Syntax error: expected expression',
                  severity: 'error',
                  position: { line: 2, character: 8 },
                },
              ]
            : [];

          return {
            snapshotIdUsed: `snp-${queryCallCount}`,
            result: {
              analyzeResult: {
                result: {
                  parse: { symbols: [], diagnostics: [] },
                  introspect: {
                    success: hasError ? 0 : 1,
                    symbols: [],
                    functions: [],
                    variables: [],
                    classes: [],
                    inherits: [],
                    diagnostics: [],
                  },
                  diagnostics: { diagnostics: diags },
                },
              },
              revision: 1,
            },
            metrics: { durationMs: 1 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used');
        },
        async findOccurrences(): Promise<{ occurrences: unknown[] }> {
          return { occurrences: [] };
        },
      },
      documentCache: {
        get(requestedUri: string): DocumentCacheEntry | undefined {
          return requestedUri === uri ? cachedEntry : undefined;
        },
        setPending(): void {},
        set(requestedUri: string, entry: DocumentCacheEntry): void {
          if (requestedUri === uri) cachedEntry = entry;
        },
        delete(): void {},
      },
      typeDatabase: {
        setProgram(): void {},
        removeProgram(): void {},
        getMemoryStats() {
          return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
        },
      },
      workspaceIndex: { indexDocument(): void {}, removeDocument(): void {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    registerDiagnosticsHandlers(
      connectionLike as unknown as Connection,
      servicesLike as unknown as Services,
      documentsLike as unknown as TextDocuments<TextDocument>
    );

    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 0 } } });
    }

    // Open with error on line 2
    const codeWithError = 'int a = 1;\nint x = ;\n';
    const docError = TextDocument.create(uri, 'pike', 1, codeWithError);
    documentsLike.emitOpen(docError);
    await new Promise(resolve => setTimeout(resolve, 200));

    assert.ok(cachedEntry?.analysisState?.parseFailed, 'parseFailed should be true');

    // Fix the error on line 2
    const codeFixed = 'int a = 1;\nint x = 1;\n';
    const docFixed = TextDocument.create(uri, 'pike', 2, codeFixed);

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: 2 },
        contentChanges: [
          {
            range: { start: { line: 1, character: 8 }, end: { line: 1, character: 8 } },
            text: '1',
          },
        ],
      });
    }
    documentsLike.emitChange(docFixed);
    await new Promise(resolve => setTimeout(resolve, 200));

    // After fix, diagnostics should be empty
    const afterFix = diagnosticsPublished.filter(d => d.uri === uri);
    const lastAfterFix = afterFix[afterFix.length - 1];
    assert.ok(
      lastAfterFix.diagnostics.length === 0,
      `Diagnostics should be empty after fix. Got: ${JSON.stringify(lastAfterFix.diagnostics)}`
    );
  });

  // =========================================================================
  // Test: Rapid error-fix-error cycle
  // =========================================================================
  it('handles rapid error-fix-error-fix cycle ending with no errors', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: Array<{ message: string }> }> =
      [];
    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const uri = 'file:///test-rapid-cycle.pike';
    let cachedEntry: DocumentCacheEntry | undefined;
    let queryCallCount = 0;

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
      console: { log() {}, warn() {}, error() {} },
    };

    const documentsLike = createStatefulMockDocuments();

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-1' };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-2' };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-3' };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-4' };
        },
        async engineCancelRequest(): Promise<{ accepted: boolean }> {
          return { accepted: true };
        },
        async engineQuery(params: { queryParams?: { text?: string } }): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          queryCallCount++;
          const text = params.queryParams?.text ?? '';
          const hasError = text.includes('int x = ;');
          const diags = hasError
            ? [{ message: 'Syntax error', severity: 'error', position: { line: 1, character: 8 } }]
            : [];

          return {
            snapshotIdUsed: `snp-${queryCallCount}`,
            result: {
              analyzeResult: {
                result: {
                  parse: { symbols: [], diagnostics: [] },
                  introspect: {
                    success: hasError ? 0 : 1,
                    symbols: [],
                    functions: [],
                    variables: [],
                    classes: [],
                    inherits: [],
                    diagnostics: [],
                  },
                  diagnostics: { diagnostics: diags },
                },
              },
              revision: 1,
            },
            metrics: { durationMs: 1 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used');
        },
        async findOccurrences(): Promise<{ occurrences: unknown[] }> {
          return { occurrences: [] };
        },
      },
      documentCache: {
        get(requestedUri: string): DocumentCacheEntry | undefined {
          return requestedUri === uri ? cachedEntry : undefined;
        },
        setPending(): void {},
        set(requestedUri: string, entry: DocumentCacheEntry): void {
          if (requestedUri === uri) cachedEntry = entry;
        },
        delete(): void {},
      },
      typeDatabase: {
        setProgram(): void {},
        removeProgram(): void {},
        getMemoryStats() {
          return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
        },
      },
      workspaceIndex: { indexDocument(): void {}, removeDocument(): void {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    registerDiagnosticsHandlers(
      connectionLike as unknown as Connection,
      servicesLike as unknown as Services,
      documentsLike as unknown as TextDocuments<TextDocument>
    );

    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 0 } } });
    }

    // Cycle 1: Open with error
    const doc1 = TextDocument.create(uri, 'pike', 1, 'int x = ;\n');
    documentsLike.emitOpen(doc1);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Cycle 2: Fix
    const doc2 = TextDocument.create(uri, 'pike', 2, 'int x = 1;\n');
    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: doc2.getText() }],
      });
    }
    documentsLike.emitChange(doc2);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Cycle 3: Re-introduce error
    const doc3 = TextDocument.create(uri, 'pike', 3, 'int x = ;\n');
    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: 3 },
        contentChanges: [{ text: doc3.getText() }],
      });
    }
    documentsLike.emitChange(doc3);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Cycle 4: Fix again
    const doc4 = TextDocument.create(uri, 'pike', 4, 'int x = 42;\n');
    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: 4 },
        contentChanges: [{ text: doc4.getText() }],
      });
    }
    documentsLike.emitChange(doc4);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Final state should have no errors
    const allForUri = diagnosticsPublished.filter(d => d.uri === uri);
    const last = allForUri[allForUri.length - 1];
    assert.ok(
      last.diagnostics.length === 0,
      `Final state should have no errors. Got: ${JSON.stringify(last.diagnostics)}`
    );

    // Should have published at least 4 times (open + 3 changes)
    assert.ok(
      allForUri.length >= 4,
      `Should have at least 4 publish events. Got: ${allForUri.length}`
    );
  });

  // =========================================================================
  // Test: Whitespace-only edit still publishes diagnostics (skip path)
  // =========================================================================
  it('publishes cached diagnostics even when re-parse is skipped', async () => {
    const diagnosticsPublished: Array<{ uri: string; diagnostics: Array<{ message: string }> }> =
      [];
    let onDidChangeConfigurationHandler:
      | ((params: DidChangeConfigurationParams) => void)
      | undefined;
    let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

    const uri = 'file:///test-skip-publish.pike';
    const cleanCode = 'int x = 1;\n';
    let cachedEntry: DocumentCacheEntry = makeCachedEntry(cleanCode, false, []);

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
      console: { log() {}, warn() {}, error() {} },
    };

    const documentsLike = createStatefulMockDocuments();

    const servicesLike = {
      bridge: {
        isRunning(): boolean {
          return true;
        },
        async start(): Promise<void> {},
        async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-1' };
        },
        async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-2' };
        },
        async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-3' };
        },
        async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
          return { revision: 1, snapshotId: 'snap-4' };
        },
        async engineCancelRequest(): Promise<{ accepted: boolean }> {
          return { accepted: true };
        },
        async engineQuery(): Promise<{
          snapshotIdUsed: string;
          result: Record<string, unknown>;
          metrics: Record<string, unknown>;
        }> {
          return {
            snapshotIdUsed: 'snp-1',
            result: {
              analyzeResult: {
                result: {
                  parse: { symbols: [], diagnostics: [] },
                  introspect: {
                    success: 1,
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
              revision: 1,
            },
            metrics: { durationMs: 1 },
          };
        },
        async analyze(): Promise<never> {
          throw new Error('analyze fallback should not be used');
        },
        async findOccurrences(): Promise<{ occurrences: unknown[] }> {
          return { occurrences: [] };
        },
      },
      documentCache: {
        get(requestedUri: string): DocumentCacheEntry | undefined {
          return requestedUri === uri ? cachedEntry : undefined;
        },
        setPending(): void {},
        set(requestedUri: string, entry: DocumentCacheEntry): void {
          if (requestedUri === uri) cachedEntry = entry;
        },
        delete(): void {},
      },
      typeDatabase: {
        setProgram(): void {},
        removeProgram(): void {},
        getMemoryStats() {
          return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
        },
      },
      workspaceIndex: { indexDocument(): void {}, removeDocument(): void {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    };

    registerDiagnosticsHandlers(
      connectionLike as unknown as Connection,
      servicesLike as unknown as Services,
      documentsLike as unknown as TextDocuments<TextDocument>
    );

    if (onDidChangeConfigurationHandler) {
      onDidChangeConfigurationHandler({ settings: { pike: { diagnosticDelay: 0 } } });
    }

    // Open with clean code
    const docOpen = TextDocument.create(uri, 'pike', 1, cleanCode);
    documentsLike.emitOpen(docOpen);
    await new Promise(resolve => setTimeout(resolve, 200));

    const afterOpen = diagnosticsPublished.filter(d => d.uri === uri);
    assert.ok(afterOpen.length > 0, 'Should publish after open');

    // Add trailing whitespace — semantic_unchanged → skip
    // Pre-seed cache with parseFailed=false so classifyChange can skip
    cachedEntry = makeCachedEntry(cleanCode, false, []);

    const whitespaceCode = 'int x = 1;   \n';
    const docWs = TextDocument.create(uri, 'pike', 2, whitespaceCode);

    if (onDidChangeTextDocumentHandler) {
      onDidChangeTextDocumentHandler({
        textDocument: { uri, version: 2 },
        contentChanges: [
          {
            range: { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
            text: '   ',
          },
        ],
      });
    }
    documentsLike.emitChange(docWs);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should have published at least twice (open + whitespace change)
    const afterWs = diagnosticsPublished.filter(d => d.uri === uri);
    assert.ok(
      afterWs.length >= 2,
      `Should publish at least twice (open + whitespace). Got: ${afterWs.length}`
    );
  });
});
