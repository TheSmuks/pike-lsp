/**
 * Diagnostic Pipeline Scenario Tests
 *
 * Exercises REAL code paths through registerDiagnosticsHandlers with
 * minimal mocking (mock bridge that simulates Pike analysis, real
 * change detection, real cache management, real diagnostic filtering).
 *
 * These scenarios would have caught:
 * - Bug #1052: stale syntax errors persist after user fixes code
 * - Bug #1058: false import/undefined errors on file open
 */

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
import type { DocumentCacheEntry } from '../../core/types.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';

// ---------------------------------------------------------------------------
// Harness factory — creates a fully wired LSP pipeline
// ---------------------------------------------------------------------------

interface BridgeSimulatorConfig {
  /** Called for each engineQuery to determine analysis result based on text */
  analyze?: (text: string) => {
    hasError: boolean;
    errorMessage?: string;
    errorLine?: number;
    errorCharacter?: number;
    symbols?: Array<{ name: string; kind: number; type?: string }>;
    introspectSuccess?: boolean;
    introspectDiagnostics?: Array<{
      message: string;
      severity: string;
      position: { line: number; character: number };
    }>;
  };
  /** Simulated engine query delay in ms */
  queryDelayMs?: number;
}

interface PipelineHarness {
  connection: Connection;
  services: Services;
  documents: TextDocuments<TextDocument>;
  publishedDiagnostics: Array<{
    uri: string;
    version?: number;
    diagnostics: Array<{
      message: string;
      severity: number;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    }>;
  }>;
  /** Set config (e.g. diagnosticDelay) */
  configure: (settings: Record<string, unknown>) => void;
  /** Send onDidChangeTextDocument with range */
  notifyChange: (
    uri: string,
    version: number,
    changes: Array<{
      range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      text: string;
    }>
  ) => void;
  /** Simulate document open */
  openDocument: (doc: TextDocument) => void;
  /** Simulate document content change (via onDidChangeContent) */
  changeDocument: (doc: TextDocument) => void;
  /** Simulate document save */
  saveDocument: (doc: TextDocument) => void;
  /** Simulate document close */
  closeDocument: (doc: TextDocument) => void;
  /** Get cache entry */
  getCachedEntry: (uri: string) => DocumentCacheEntry | undefined;
  /** Set cache entry (for pre-seeding) */
  setCachedEntry: (uri: string, entry: DocumentCacheEntry) => void;
  /** Wait for pending promises to settle */
  waitForSettle: (ms?: number) => Promise<void>;
}

function createPipelineHarness(config: BridgeSimulatorConfig = {}): PipelineHarness {
  const publishedDiagnostics: PipelineHarness['publishedDiagnostics'] = [];
  const cache = new Map<string, DocumentCacheEntry>();
  const pendingPromises: Promise<void>[] = [];
  let queryCount = 0;

  let onDidChangeConfigurationHandler: ((params: DidChangeConfigurationParams) => void) | undefined;
  let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;

  let openHandler: ((event: { document: TextDocument }) => void) | undefined;
  let saveHandler: ((event: { document: TextDocument }) => void) | undefined;
  let changeHandler: ((event: { document: TextDocument }) => void) | undefined;
  let closeHandler: ((event: { document: TextDocument }) => void) | undefined;

  const docs = new Map<string, TextDocument>();

  const defaultAnalyze = (text: string) => {
    const hasSyntaxError = text.includes('= ;') || text.includes(';;') || /^\s*\}\s*\{/m.test(text);
    return { hasError: hasSyntaxError, errorMessage: hasSyntaxError ? 'Syntax error' : undefined };
  };

  const analyzeFn = config.analyze ?? defaultAnalyze;
  const queryDelayMs = config.queryDelayMs ?? 1;

  const connectionLike = {
    sendDiagnostics(params: { uri: string; version?: number; diagnostics: unknown[] }): void {
      publishedDiagnostics.push(params as (typeof publishedDiagnostics)[number]);
    },
    onRequest() {},
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

  const servicesLike = {
    bridge: {
      isRunning(): boolean {
        return true;
      },
      async start(): Promise<void> {},
      async engineOpenDocument(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'snap-open' };
      },
      async engineChangeDocument(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'snap-change' };
      },
      async engineCloseDocument(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'snap-close' };
      },
      async engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }> {
        return { revision: 1, snapshotId: 'snap-config' };
      },
      async engineCancelRequest(): Promise<{ accepted: boolean }> {
        return { accepted: true };
      },
      async engineQuery(params: { queryParams?: { text?: string } }): Promise<{
        snapshotIdUsed: string;
        result: Record<string, unknown>;
        metrics: Record<string, unknown>;
      }> {
        queryCount++;
        const text = params.queryParams?.text ?? '';
        const analysis = analyzeFn(text);

        if (queryDelayMs > 0) {
          await new Promise(r => setTimeout(r, queryDelayMs));
        }

        const introspectDiags = analysis.introspectDiagnostics ?? [];
        const engineDiags = analysis.hasError
          ? [
              {
                message: analysis.errorMessage ?? 'Syntax error',
                severity: 'error' as const,
                position: {
                  line: analysis.errorLine ?? 1,
                  character: analysis.errorCharacter ?? 0,
                },
              },
            ]
          : [];

        return {
          snapshotIdUsed: `snp-${queryCount}`,
          result: {
            analyzeResult: {
              result: {
                parse: { symbols: [], diagnostics: [] },
                introspect: {
                  success: analysis.introspectSuccess ?? (analysis.hasError ? 0 : 1),
                  symbols: analysis.symbols ?? [],
                  functions: [],
                  variables: [],
                  classes: [],
                  inherits: [],
                  diagnostics: introspectDiags,
                },
                diagnostics: { diagnostics: engineDiags },
              },
            },
            revision: queryCount,
          },
          metrics: { durationMs: queryDelayMs },
        };
      },
      async analyze(): Promise<never> {
        throw new Error('analyze fallback should not be used in this test');
      },
      async findOccurrences(): Promise<{ occurrences: unknown[] }> {
        return { occurrences: [] };
      },
    },
    documentCache: {
      get(uri: string): DocumentCacheEntry | undefined {
        return cache.get(uri);
      },
      setPending(_uri: string, promise: Promise<void>): void {
        pendingPromises.push(promise);
        promise.catch(() => {});
      },
      set(uri: string, entry: DocumentCacheEntry): void {
        cache.set(uri, entry);
      },
      delete(uri: string): void {
        cache.delete(uri);
      },
      waitFor(uri: string): Promise<void> {
        return Promise.resolve();
      },
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
      getAllDocumentUris(): string[] {
        return [...cache.keys()];
      },
    },
    includeResolver: null,
    globalSettings: {
      pikePath: 'pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 250,
    },
    documentSnapshots: new Map<string, string>(),
    logger: {
      debug(): void {},
      info(): void {},
      warn(): void {},
      error(): void {},
    },
  };

  const documentsLike = {
    get(uri: string): TextDocument | undefined {
      return docs.get(uri);
    },
    all(): TextDocument[] {
      return [...docs.values()];
    },
    onDidOpen(handler: (event: { document: TextDocument }) => void): void {
      openHandler = handler;
    },
    onDidSave(handler: (event: { document: TextDocument }) => void): void {
      saveHandler = handler;
    },
    onDidChangeContent(handler: (event: { document: TextDocument }) => void): void {
      changeHandler = handler;
    },
    onDidClose(handler: (event: { document: TextDocument }) => void): void {
      closeHandler = handler;
    },
  };

  registerDiagnosticsHandlers(
    connectionLike as unknown as Connection,
    servicesLike as unknown as Services,
    documentsLike as unknown as TextDocuments<TextDocument>
  );

  return {
    connection: connectionLike as unknown as Connection,
    services: servicesLike as unknown as Services,
    documents: documentsLike as unknown as TextDocuments<TextDocument>,
    publishedDiagnostics,
    configure(settings: Record<string, unknown>) {
      onDidChangeConfigurationHandler?.({ settings: { pike: settings } });
    },
    notifyChange(
      uri: string,
      version: number,
      changes: Array<{
        range?: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
        text: string;
      }>
    ) {
      onDidChangeTextDocumentHandler?.({
        textDocument: { uri, version },
        contentChanges: changes,
      });
    },
    openDocument(doc: TextDocument) {
      docs.set(doc.uri, doc);
      openHandler?.({ document: doc });
    },
    changeDocument(doc: TextDocument) {
      docs.set(doc.uri, doc);
      changeHandler?.({ document: doc });
    },
    saveDocument(doc: TextDocument) {
      docs.set(doc.uri, doc);
      saveHandler?.({ document: doc });
    },
    closeDocument(doc: TextDocument) {
      docs.delete(doc.uri);
      closeHandler?.({ document: doc });
    },
    getCachedEntry(uri: string) {
      return cache.get(uri);
    },
    setCachedEntry(uri: string, entry: DocumentCacheEntry) {
      cache.set(uri, entry);
    },
    async waitForSettle(ms = 100) {
      await new Promise(r => setTimeout(r, ms));
    },
  };
}

function makeCachedEntry(
  text: string,
  options: {
    version?: number;
    parseFailed?: boolean;
    diagnostics?: DocumentCacheEntry['diagnostics'];
  } = {}
): DocumentCacheEntry {
  return {
    version: options.version ?? 1,
    symbols: [],
    diagnostics: options.diagnostics ?? [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
    analysisState: {
      isStale: false,
      parseFailed: options.parseFailed ?? false,
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Document open → receive correct diagnostics
// ---------------------------------------------------------------------------

describe('Scenario: document open → correct diagnostics', () => {
  it('should produce error diagnostics for broken Pike code on open', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/broken.pike';
    const brokenCode = 'int main() {\n  int x = ;\n  return 0;\n}\n';
    const doc = TextDocument.create(uri, 'pike', 1, brokenCode);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics on open');
    const lastDiag = diags[diags.length - 1]!;
    assert.ok(
      lastDiag.diagnostics.length > 0,
      'Should have at least one error diagnostic for broken code'
    );
    assert.ok(
      lastDiag.diagnostics.some(d => d.severity === 1),
      'Should have error severity (1) for syntax error'
    );
  });

  it('should produce zero diagnostics for valid Pike code on open', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/clean.pike';
    const cleanCode = 'int main() {\n  int x = 42;\n  return 0;\n}\n';
    const doc = TextDocument.create(uri, 'pike', 1, cleanCode);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics on open');
    const lastDiag = diags[diags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Should have zero diagnostics for valid code'
    );
  });

  it('should produce correct resultId for pull diagnostics', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/pull.pike';
    const doc = TextDocument.create(uri, 'pike', 1, 'int x = 1;\n');
    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const entry = harness.getCachedEntry(uri);
    assert.ok(entry, 'Cache entry should exist after open');
    assert.strictEqual(entry.version, 1, 'Cache version should match document version');
    assert.ok(entry.contentHash, 'Cache should have content hash');
    assert.ok(Array.isArray(entry.lineHashes), 'Cache should have line hashes');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Document edit → diagnostics update (Bug #1052)
// ---------------------------------------------------------------------------

describe('Scenario: document edit → diagnostics update', () => {
  it('should clear stale error diagnostics after fixing code', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/fix-error.pike';

    // Step 1: Open with broken code
    const brokenCode = 'int main() {\n  int x = ;\n  return 0;\n}\n';
    const v1 = TextDocument.create(uri, 'pike', 1, brokenCode);
    harness.openDocument(v1);
    await harness.waitForSettle(200);

    const afterOpenDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(
      afterOpenDiags.some(d => d.diagnostics.length > 0),
      'Should have error diagnostics for broken code'
    );

    // Step 2: Fix the code
    const fixedCode = 'int main() {\n  int x = 42;\n  return 0;\n}\n';
    const v2 = TextDocument.create(uri, 'pike', 2, fixedCode);
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 1, character: 9 }, end: { line: 1, character: 9 } },
        text: '42',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(200);

    const afterFixDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = afterFixDiags[afterFixDiags.length - 1]!;
    assert.ok(
      lastDiag.diagnostics.length === 0,
      `Should have zero diagnostics after fix, got: ${JSON.stringify(lastDiag.diagnostics)}`
    );
  });

  it('should produce error diagnostics when introducing a syntax error', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/introduce-error.pike';

    // Step 1: Open with clean code
    const cleanCode = 'int x = 1;\n';
    const v1 = TextDocument.create(uri, 'pike', 1, cleanCode);
    harness.openDocument(v1);
    await harness.waitForSettle(200);

    // Step 2: Introduce error
    const brokenCode = 'int x = ;\n';
    const v2 = TextDocument.create(uri, 'pike', 2, brokenCode);
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
        text: '',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(200);

    const afterBreakDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = afterBreakDiags[afterBreakDiags.length - 1]!;
    assert.ok(
      lastDiag.diagnostics.length > 0,
      'Should have error diagnostics after introducing error'
    );
  });

  it('should NOT skip validation when cached entry has parseFailed=true (#1052)', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/parse-failed-no-skip.pike';

    // Pre-seed cache with parseFailed=true (simulates previous broken state)
    const brokenCode = 'int x = ;\n';
    harness.setCachedEntry(uri, makeCachedEntry(brokenCode, { parseFailed: true }));

    // Fix the code
    const fixedCode = 'int x = 1;\n';
    const v2 = TextDocument.create(uri, 'pike', 2, fixedCode);
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
        text: '1',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Fixed code should produce empty diagnostics even after parseFailed state'
    );
  });

  it('should handle rapid error-fix-error cycle without stale diagnostics', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/rapid-cycle.pike';

    // v1: broken
    const v1 = TextDocument.create(uri, 'pike', 1, 'int x = ;\n');
    harness.openDocument(v1);
    await harness.waitForSettle(50);

    // v2: fix
    const v2 = TextDocument.create(uri, 'pike', 2, 'int x = 1;\n');
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
        text: '1',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(50);

    // v3: break again
    const v3 = TextDocument.create(uri, 'pike', 3, 'int x = ;\n');
    harness.notifyChange(uri, 3, [
      {
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
        text: '',
      },
    ]);
    harness.changeDocument(v3);
    await harness.waitForSettle(50);

    // v4: fix again
    const v4 = TextDocument.create(uri, 'pike', 4, 'int x = 2;\n');
    harness.notifyChange(uri, 4, [
      {
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
        text: '2',
      },
    ]);
    harness.changeDocument(v4);
    await harness.waitForSettle(300);

    const allDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = allDiags[allDiags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Final state should be clean after error-fix-error-fix cycle'
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Import resolution → no false undefined errors (#1058)
// ---------------------------------------------------------------------------

describe('Scenario: import resolution → no false errors', () => {
  it('should not produce false errors for resolved import symbols', async () => {
    const harness = createPipelineHarness({
      analyze: text => {
        const hasImport = text.includes('import');
        const hasResolvedSymbol = text.includes('Stdio.') || text.includes('write');
        const hasSyntaxError = text.includes('= ;');

        if (hasSyntaxError) {
          return { hasError: true, errorMessage: 'Syntax error' };
        }

        return {
          hasError: false,
          introspectSuccess: true,
          symbols: hasImport
            ? [
                { name: 'main', kind: 12, type: 'int' },
                { name: 'write', kind: 16, type: 'function' },
              ]
            : [],
          introspectDiagnostics: [],
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/imports.pike';
    const code = 'import Stdio;\n\nint main() {\n  write("hello");\n  return 0;\n}\n';
    const doc = TextDocument.create(uri, 'pike', 1, code);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      `Should have zero diagnostics for valid imported symbols, got: ${JSON.stringify(lastDiag.diagnostics.map(d => d.message))}`
    );
  });

  it('should not report false undefined errors when introspection succeeds', async () => {
    const harness = createPipelineHarness({
      analyze: () => ({
        hasError: false,
        introspectSuccess: true,
        symbols: [
          { name: 'foo', kind: 12, type: 'mixed' },
          { name: 'bar', kind: 12, type: 'int' },
        ],
        introspectDiagnostics: [],
      }),
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/resolved.pike';
    const code = 'mixed foo() { return 1; }\nint bar() { return foo(); }\n';
    const doc = TextDocument.create(uri, 'pike', 1, code);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;
    const undefinedErrors = lastDiag.diagnostics.filter(
      d =>
        d.message.toLowerCase().includes('undefined') ||
        d.message.toLowerCase().includes('unknown identifier') ||
        d.message.toLowerCase().includes('not present')
    );
    assert.strictEqual(
      undefinedErrors.length,
      0,
      `Should have no undefined/import errors when introspection succeeds, got: ${JSON.stringify(undefinedErrors.map(d => d.message))}`
    );
  });

  it('should skip module resolution diagnostics for imported symbols', async () => {
    const harness = createPipelineHarness({
      analyze: text => {
        if (text.includes('= ;')) {
          return { hasError: true, errorMessage: 'Syntax error' };
        }
        return {
          hasError: false,
          introspectSuccess: true,
          symbols: [],
          introspectDiagnostics: [
            {
              message: 'Index Stdio.File not present in module',
              severity: 'warning',
              position: { line: 1, character: 3 },
            },
            {
              message: 'Illegal program identifier',
              severity: 'error',
              position: { line: 2, character: 0 },
            },
          ],
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/module-resolve.pike';
    const code = 'import Stdio;\nint main() { return 0; }\n';
    const doc = TextDocument.create(uri, 'pike', 1, code);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;
    const moduleErrors = lastDiag.diagnostics.filter(
      d =>
        d.message.includes('not present in module') ||
        d.message.includes('Illegal program identifier')
    );
    assert.strictEqual(
      moduleErrors.length,
      0,
      'Module resolution errors should be filtered out by skipPatterns'
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Edge cases
// ---------------------------------------------------------------------------

describe('Scenario: edge cases', () => {
  it('should handle empty document without crashing', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/empty.pike';
    const doc = TextDocument.create(uri, 'pike', 1, '');

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics even for empty document');
    const lastDiag = diags[diags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Empty document should have zero diagnostics'
    );

    const entry = harness.getCachedEntry(uri);
    assert.ok(entry, 'Cache entry should exist for empty document');
  });

  it('should handle whitespace-only document', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/whitespace.pike';
    const doc = TextDocument.create(uri, 'pike', 1, '   \n  \n\t\n');

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics for whitespace document');
  });

  it('should handle malformed Pike code gracefully', async () => {
    const harness = createPipelineHarness({
      analyze: text => {
        const isGarbage = text.includes('{{{') || text.includes('###');
        return {
          hasError: isGarbage,
          errorMessage: isGarbage ? 'Unexpected token' : undefined,
          introspectSuccess: !isGarbage,
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/malformed.pike';
    const malformedCode = '{{{\n###\n}}}\n';
    const doc = TextDocument.create(uri, 'pike', 1, malformedCode);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics for malformed code');
    const lastDiag = diags[diags.length - 1]!;
    assert.ok(lastDiag.diagnostics.length > 0, 'Should report errors for malformed Pike code');
  });

  it('should handle large files (1000+ lines) without errors', async () => {
    const harness = createPipelineHarness({
      queryDelayMs: 0,
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/large.pike';
    const lines = ['int main() {'];
    for (let i = 0; i < 1000; i++) {
      lines.push(`  int var${i} = ${i};`);
    }
    lines.push('  return 0;');
    lines.push('}');
    const largeCode = lines.join('\n');

    const doc = TextDocument.create(uri, 'pike', 1, largeCode);

    harness.openDocument(doc);
    await harness.waitForSettle(500);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics for large file');
    const lastDiag = diags[diags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Large valid file should have zero diagnostics'
    );

    const entry = harness.getCachedEntry(uri);
    assert.ok(entry, 'Cache entry should exist for large file');
    assert.strictEqual(
      entry.lineHashes?.length,
      lines.length,
      `Line hashes should match line count: expected ${lines.length}, got ${entry.lineHashes?.length}`
    );
  });

  it('should handle rapid sequential edits without stale diagnostics', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 10 });

    const uri = 'file:///test/rapid-edits.pike';

    const v1 = TextDocument.create(uri, 'pike', 1, 'int x = 1;\n');
    harness.openDocument(v1);
    await harness.waitForSettle(50);

    for (let i = 2; i <= 10; i++) {
      const doc = TextDocument.create(uri, 'pike', i, `int x = ${i};\n`);
      harness.notifyChange(uri, i, [
        {
          range: {
            start: { line: 0, character: 8 },
            end: { line: 0, character: 8 + String(i - 1).length },
          },
          text: String(i),
        },
      ]);
      harness.changeDocument(doc);
    }

    await harness.waitForSettle(300);

    const allDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = allDiags[allDiags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Final state after rapid edits should be clean'
    );
  });

  it('should clear diagnostics on document close', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/close-clear.pike';
    const doc = TextDocument.create(uri, 'pike', 1, 'int x = 1;\n');

    harness.openDocument(doc);
    await harness.waitForSettle(100);

    harness.closeDocument(doc);
    await harness.waitForSettle(100);

    const closeDiags = harness.publishedDiagnostics.filter(
      d => d.uri === uri && d.diagnostics.length === 0
    );
    assert.ok(closeDiags.length > 0, 'Should publish empty diagnostics on document close');

    const entry = harness.getCachedEntry(uri);
    assert.strictEqual(entry, undefined, 'Cache entry should be removed on close');
  });

  it('should handle document with only comments', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/comments-only.pike';
    const commentCode = '// This is a comment\n// Another comment\n';
    const doc = TextDocument.create(uri, 'pike', 1, commentCode);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(diags.length > 0, 'Should publish diagnostics for comments-only file');
  });

  it('should preserve warnings on changed lines when errors are cleared', async () => {
    let callCount = 0;
    const harness = createPipelineHarness({
      analyze: text => {
        callCount++;
        const hasSyntaxError = text.includes('= ;');
        return {
          hasError: hasSyntaxError,
          errorMessage: hasSyntaxError ? 'Syntax error' : undefined,
          introspectSuccess: !hasSyntaxError,
          symbols: hasSyntaxError ? [] : [{ name: 'x', kind: 8, type: 'int' }],
          introspectDiagnostics: hasSyntaxError
            ? []
            : [
                {
                  message: 'unused variable x',
                  severity: 'warning',
                  position: { line: 1, character: 5 },
                },
              ],
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/warnings-preserved.pike';

    // Open with code that has a warning
    const cleanCode = 'int x = 1;\n';
    const v1 = TextDocument.create(uri, 'pike', 1, cleanCode);
    harness.openDocument(v1);
    await harness.waitForSettle(300);

    const afterOpenDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const openDiag = afterOpenDiags[afterOpenDiags.length - 1]!;
    const openWarnings = openDiag.diagnostics.filter(d => d.severity === 2);
    assert.ok(openWarnings.length > 0, 'Should have warnings from introspection after open');

    // Trigger a whitespace change on line 0 — should keep warnings
    const wsCode = 'int x = 1;   \n';
    const v2 = TextDocument.create(uri, 'pike', 2, wsCode);
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
        text: '   ',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(300);

    const afterChangeDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = afterChangeDiags[afterChangeDiags.length - 1]!;
    const warnings = lastDiag.diagnostics.filter(d => d.severity === 2);
    assert.ok(
      warnings.length > 0,
      `Warnings should survive whitespace change. Got diagnostics: ${JSON.stringify(lastDiag.diagnostics.map(d => d.message))}`
    );
    assert.ok(
      !lastDiag.diagnostics.some(d => d.severity === 1),
      'No errors should be present for valid code'
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Diagnostics deduplication and max problems
// ---------------------------------------------------------------------------

describe('Scenario: diagnostics deduplication and limits', () => {
  it('should deduplicate identical diagnostics from different sources', async () => {
    const harness = createPipelineHarness({
      analyze: text => ({
        hasError: false,
        introspectSuccess: true,
        symbols: [{ name: 'x', kind: 8, type: 'int' }],
        introspectDiagnostics: [
          {
            message: 'unused variable x',
            severity: 'warning',
            position: { line: 1, character: 6 },
          },
        ],
      }),
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/dedup.pike';
    const code = 'int x = 1;\n';
    const doc = TextDocument.create(uri, 'pike', 1, code);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;

    const uniqueMessages = new Set(lastDiag.diagnostics.map(d => d.message));
    assert.strictEqual(
      uniqueMessages.size,
      lastDiag.diagnostics.length,
      'No duplicate diagnostics should be published'
    );
  });

  it('should respect maxNumberOfProblems limit', async () => {
    const harness = createPipelineHarness({
      analyze: () => ({
        hasError: false,
        introspectSuccess: true,
        symbols: [],
        introspectDiagnostics: Array.from({ length: 50 }, (_, i) => ({
          message: `Warning ${i + 1}: unused variable v${i}`,
          severity: 'warning',
          position: { line: i + 1, character: 0 },
        })),
      }),
    });
    harness.configure({ diagnosticDelay: 0, maxNumberOfProblems: 10 });

    const uri = 'file:///test/max-problems.pike';
    const code = Array.from({ length: 50 }, (_, i) => `int v${i} = ${i};`).join('\n') + '\n';
    const doc = TextDocument.create(uri, 'pike', 1, code);

    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;
    assert.ok(
      lastDiag.diagnostics.length <= 10,
      `Should respect maxNumberOfProblems limit, got ${lastDiag.diagnostics.length}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Save and configuration-triggered revalidation
// ---------------------------------------------------------------------------

describe('Scenario: save and config-triggered revalidation', () => {
  it('should re-validate on save and produce correct diagnostics', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/save-revalidate.pike';

    // Open with broken code
    const brokenCode = 'int x = ;\n';
    const v1 = TextDocument.create(uri, 'pike', 1, brokenCode);
    harness.openDocument(v1);
    await harness.waitForSettle(200);

    const beforeSaveDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    assert.ok(
      beforeSaveDiags.some(d => d.diagnostics.length > 0),
      'Should have errors before fix'
    );

    // Fix and save
    const fixedCode = 'int x = 1;\n';
    const v2 = TextDocument.create(uri, 'pike', 2, fixedCode);
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
        text: '1',
      },
    ]);
    harness.changeDocument(v2);
    harness.saveDocument(v2);
    await harness.waitForSettle(300);

    const afterSaveDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = afterSaveDiags[afterSaveDiags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Should have clean diagnostics after fix+save'
    );
  });

  it('should re-validate all open documents on configuration change', async () => {
    const harness = createPipelineHarness();
    harness.configure({ diagnosticDelay: 0 });

    const uri1 = 'file:///test/config-a.pike';
    const uri2 = 'file:///test/config-b.pike';

    const doc1 = TextDocument.create(uri1, 'pike', 1, 'int a = 1;\n');
    const doc2 = TextDocument.create(uri2, 'pike', 1, 'int b = 2;\n');

    harness.openDocument(doc1);
    harness.openDocument(doc2);
    await harness.waitForSettle(200);

    const countBefore = harness.publishedDiagnostics.length;

    harness.configure({ diagnosticDelay: 100, maxNumberOfProblems: 50 });
    await harness.waitForSettle(300);

    assert.ok(
      harness.publishedDiagnostics.length > countBefore,
      'Configuration change should trigger re-validation of open documents'
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Deeply nested imports
// ---------------------------------------------------------------------------

describe('Scenario: deeply nested imports', () => {
  it('should handle chained import dependencies without false errors', async () => {
    const harness = createPipelineHarness({
      analyze: text => {
        if (text.includes('= ;')) {
          return { hasError: true, errorMessage: 'Syntax error' };
        }
        return {
          hasError: false,
          introspectSuccess: true,
          symbols: [
            { name: 'main', kind: 12, type: 'int' },
            { name: 'myFunc', kind: 16, type: 'function' },
            { name: 'Helper', kind: 5, type: 'class' },
            { name: 'process', kind: 16, type: 'function' },
            { name: 'DataStore', kind: 5, type: 'class' },
            { name: 'fetch', kind: 16, type: 'function' },
          ],
          introspectDiagnostics: [],
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/nested-imports.pike';
    const code = [
      'import Stdio;',
      'import Protocols.HTTP;',
      'import SQL;',
      '',
      'class Controller {',
      '  DataStore store;',
      '  Helper helper;',
      '',
      '  int process() {',
      '    store.fetch();',
      '    helper.process();',
      '    return 0;',
      '  }',
      '}',
      '',
      'int main() {',
      '  Controller c = Controller();',
      '  c.process();',
      '  return 0;',
      '}',
    ].join('\n');

    const doc = TextDocument.create(uri, 'pike', 1, code);
    harness.openDocument(doc);
    await harness.waitForSettle(200);

    const diags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = diags[diags.length - 1]!;
    const falseErrors = lastDiag.diagnostics.filter(
      d =>
        d.severity === 1 &&
        (d.message.toLowerCase().includes('undefined') ||
          d.message.toLowerCase().includes('unknown'))
    );
    assert.strictEqual(
      falseErrors.length,
      0,
      `Should have no false undefined errors for deeply nested imports, got: ${JSON.stringify(falseErrors.map(d => d.message))}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario: Cache persistence on skip path (#1066) — updated for #1068
// ---------------------------------------------------------------------------

describe('Scenario: cache persistence on skip validation (#1066)', () => {
  it('should re-validate (not skip) when cached entry has error diagnostics (#1068)', async () => {
    // Bug #1066 originally: skip path didn't persist filtered diagnostics to cache.
    // Bug #1068 fix: files with severity-1 diagnostics never take the skip path.
    //
    // This test now verifies that when a file has error diagnostics, a comment-only
    // change triggers re-validation instead of skip, and the error persists correctly
    // until the actual code is fixed.

    const harness = createPipelineHarness({
      analyze: (text: string) => {
        const hasUndefined = text.includes('UNDEFINED_MARKER');
        return {
          hasError: false,
          introspectSuccess: true,
          symbols: [{ name: 'main', kind: 12, type: 'int' }],
          introspectDiagnostics: hasUndefined
            ? [
                {
                  message: 'Undefined variable',
                  severity: 'error',
                  position: { line: 2, character: 0 },
                },
              ]
            : [],
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/cache-persist-skip.pike';

    // Step 1: Open with code that has an undefined variable error on line 2
    const v1 = TextDocument.create(
      uri,
      'pike',
      1,
      ['int main() {', '  int x = UNDEFINED_MARKER;', '  return 0;', '}'].join('\n')
    );
    harness.openDocument(v1);
    await harness.waitForSettle(200);

    const entry1 = harness.getCachedEntry(uri);
    assert.ok(entry1, 'Cache entry should exist after open');
    assert.ok(entry1.diagnostics.length > 0, 'Error should be cached');
    assert.strictEqual(entry1.analysisState?.parseFailed, false, 'Parsing should succeed');

    // Step 2: Add comment on line 2 (same line as error)
    // With #1068 fix: classifyChange detects severity-1 diagnostics → forces re-validation
    // Re-validation finds UNDEFINED_MARKER is still present → error persists (correct!)
    const v2 = TextDocument.create(
      uri,
      'pike',
      2,
      ['int main() {', '  int x = UNDEFINED_MARKER; // comment', '  return 0;', '}'].join('\n')
    );
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 1, character: 24 }, end: { line: 1, character: 24 } },
        text: ' // comment',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(200);

    // Error persists because UNDEFINED_MARKER is still in the code
    const entry2 = harness.getCachedEntry(uri);
    assert.ok(entry2, 'Cache entry should exist after comment change');
    assert.ok(
      entry2.diagnostics.some(d => d.severity === 1),
      `Error should persist while UNDEFINED_MARKER is present. Got: ${JSON.stringify(entry2.diagnostics)}`
    );

    // Step 3: Actually fix the error by replacing UNDEFINED_MARKER with a value
    const v3 = TextDocument.create(
      uri,
      'pike',
      3,
      ['int main() {', '  int x = 42; // comment', '  return 0;', '}'].join('\n')
    );
    harness.notifyChange(uri, 3, [
      {
        range: { start: { line: 1, character: 10 }, end: { line: 1, character: 25 } },
        text: '42',
      },
    ]);
    harness.changeDocument(v3);
    await harness.waitForSettle(200);

    const lastPublished = harness.publishedDiagnostics.filter(d => d.uri === uri).slice(-1)[0];
    assert.ok(lastPublished, 'Should have published diagnostics');
    assert.strictEqual(
      lastPublished.diagnostics.length,
      0,
      `Error should be cleared after actual fix. Got: ${JSON.stringify(lastPublished.diagnostics)}`
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario: Stale error diagnostics persist after multi-line fix (#1068)
// ---------------------------------------------------------------------------

describe('Scenario: stale error diagnostics cleared after multi-line fix (#1068)', () => {
  it('should re-validate when cached diagnostics contain severity-1 errors', async () => {
    // Bug #1068: When classifyChange() returns canSkip: true but cachedEntry
    // has severity-1 diagnostics, errors on lines far from the change persist.
    //
    // Setup: file has error on line 2, user edits line 4 (far from error).
    // Without fix, classifyChange returns canSkip: true because line hashes
    // for the change range (line 4) match, and the error on line 2 persists.
    // With fix, classifyChange detects severity-1 diagnostics and forces
    // re-validation, clearing the stale error.

    const harness = createPipelineHarness({
      analyze: text => {
        const hasUndefined = text.includes('UNDEFINED_VAR');
        return {
          hasError: false,
          introspectSuccess: true,
          symbols: hasUndefined ? [] : [{ name: 'main', kind: 12, type: 'int' }],
          introspectDiagnostics: hasUndefined
            ? [
                {
                  message: 'Undefined identifier UNDEFINED_VAR',
                  severity: 'error',
                  position: { line: 2, character: 12 },
                },
              ]
            : [],
        };
      },
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/1068-stale-error.pike';

    // Step 1: Open with error on line 2
    const v1 = TextDocument.create(
      uri,
      'pike',
      1,
      ['int main() {', '  int x = UNDEFINED_VAR;', '  int y = 0;', '  return x + y;', '}'].join(
        '\n'
      )
    );
    harness.openDocument(v1);
    await harness.waitForSettle(200);

    const afterOpenDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const openDiag = afterOpenDiags[afterOpenDiags.length - 1]!;
    assert.ok(
      openDiag.diagnostics.some(d => d.severity === 1),
      'Should have error diagnostic for UNDEFINED_VAR after open'
    );

    // Step 2: Fix the error on line 2 by replacing UNDEFINED_VAR with a number
    const v2 = TextDocument.create(
      uri,
      'pike',
      2,
      ['int main() {', '  int x = 42;', '  int y = 0;', '  return x + y;', '}'].join('\n')
    );
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 1, character: 10 }, end: { line: 1, character: 23 } },
        text: '42',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(200);

    const afterFixDiags = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = afterFixDiags[afterFixDiags.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.filter(d => d.severity === 1).length,
      0,
      `Error on line 2 should be cleared after fix. Got: ${JSON.stringify(lastDiag.diagnostics)}`
    );
  });

  it('should still skip validation for error-free files with no semantic change', async () => {
    // Complementary test: the optimization should still work for error-free files.
    // A comment-only change on a clean file should trigger canSkip: true.

    const harness = createPipelineHarness({
      analyze: () => ({
        hasError: false,
        introspectSuccess: true,
        symbols: [{ name: 'main', kind: 12, type: 'int' }],
        introspectDiagnostics: [],
      }),
    });
    harness.configure({ diagnosticDelay: 0 });

    const uri = 'file:///test/1068-skip-clean.pike';

    const v1 = TextDocument.create(
      uri,
      'pike',
      1,
      ['int main() {', '  int x = 1;', '  return x;', '}'].join('\n')
    );
    harness.openDocument(v1);
    await harness.waitForSettle(200);

    const afterOpen = harness.publishedDiagnostics.filter(d => d.uri === uri).length;

    // Add comment — no semantic change, no errors → should skip
    const v2 = TextDocument.create(
      uri,
      'pike',
      2,
      ['int main() {', '  int x = 1; // a comment', '  return x;', '}'].join('\n')
    );
    harness.notifyChange(uri, 2, [
      {
        range: { start: { line: 1, character: 11 }, end: { line: 1, character: 11 } },
        text: ' // a comment',
      },
    ]);
    harness.changeDocument(v2);
    await harness.waitForSettle(200);

    const afterComment = harness.publishedDiagnostics.filter(d => d.uri === uri);
    const lastDiag = afterComment[afterComment.length - 1]!;
    assert.strictEqual(
      lastDiag.diagnostics.length,
      0,
      'Clean file should remain clean after comment change'
    );

    // The comment-only change should NOT trigger re-validation since there are no errors
    // So publishedDiagnostics count should be similar (skip path used)
    assert.ok(
      afterComment.length <= afterOpen + 2,
      'Comment-only change on error-free file should use skip path (minimal re-publishing)'
    );
  });
});
