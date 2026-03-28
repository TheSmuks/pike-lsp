/**
 * LSP Scenario Runner
 *
 * Behavior-level tests for pike-lsp. Instead of testing internal functions,
 * these tests simulate what an editor does: open files, make edits, check
 * diagnostics. If these pass, the LSP actually works.
 *
 * Format: each scenario is a sequence of editor actions + expected outcomes.
 * Agents must pass ALL scenarios to prove their changes are correct.
 *
 * Usage:
 *   bun test scenarios/scenario-runner.test.ts
 *   bun test scenarios/scenario-runner.test.ts --scenario "syntax-error-clears-on-fix"
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
import type { Services } from '../services/index.js';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import type { DocumentCacheEntry } from '../core/types.js';

// ---------------------------------------------------------------------------
// Scenario DSL
// ---------------------------------------------------------------------------

interface DiagnosticExpectation {
  /** Line number (0-indexed) where diagnostic should appear */
  line?: number;
  /** Whether this should be an error */
  isError?: boolean;
  /** Substring that should appear in the diagnostic message */
  messageContains?: string;
}

interface EditorAction {
  /** Action type */
  type: 'open' | 'edit' | 'save' | 'close';
  /** File content after this action */
  content: string;
  /** Document version */
  version: number;
  /** For incremental edits: the range being replaced */
  editRange?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  /** For incremental edits: the text being inserted */
  editText?: string;
}

interface Scenario {
  /** Unique name for this scenario */
  name: string;
  /** Description of what this scenario tests */
  description: string;
  /** Sequence of editor actions */
  actions: EditorAction[];
  /** Expected diagnostics after the LAST action */
  expect: {
    /** Expected number of diagnostics */
    diagnosticCount: number;
    /** Specific diagnostic expectations */
    diagnostics?: DiagnosticExpectation[];
  };
}

// ---------------------------------------------------------------------------
// Test infrastructure (matches project's mock pattern)
// ---------------------------------------------------------------------------

type ChangeHandler = (event: { document: TextDocument }) => void;

function createMockDocuments() {
  let changeHandler: ChangeHandler | undefined;
  const docs = new Map<string, TextDocument>();

  return {
    get(uri: string) {
      return docs.get(uri);
    },
    all() {
      return [...docs.values()];
    },
    onDidOpen() {},
    onDidSave() {},
    onDidChangeContent(handler: ChangeHandler) {
      changeHandler = handler;
    },
    onDidClose() {},
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    set(uri: string, doc: TextDocument) {
      docs.set(uri, doc);
      changeHandler?.({ document: doc });
    },
    delete(uri: string) {
      docs.delete(uri);
    },
  };
}

interface MockBridgeConfig {
  /** Simulates Pike's parser: returns error diagnostics for broken code */
  analyzeResult: (text: string) => { hasError: boolean; errorMessage?: string };
  /** Simulated analysis delay in ms */
  delayMs?: number;
}

function createMockBridge(config: MockBridgeConfig) {
  let callCount = 0;
  const delayMs = config.delayMs ?? 1;

  return {
    get callCount() {
      return callCount;
    },
    bridge: {
      isRunning() {
        return true;
      },
      async start() {},
      async engineOpenDocument() {
        return { revision: 1, snapshotId: 'snap-1' };
      },
      async engineChangeDocument() {
        return { revision: 1, snapshotId: 'snap-2' };
      },
      async engineCloseDocument() {
        return { revision: 1, snapshotId: 'snap-3' };
      },
      async engineUpdateConfig() {
        return { revision: 1, snapshotId: 'snap-4' };
      },
      async engineCancelRequest() {
        return { accepted: true };
      },
      async engineQuery(params: { queryParams?: { text?: string } }) {
        callCount++;
        const text = params.queryParams?.text ?? '';
        const analysis = config.analyzeResult(text);
        const diags = analysis.hasError
          ? [
              {
                message: analysis.errorMessage ?? 'Syntax error',
                severity: 'error',
                position: { line: 1, character: 0 },
              },
            ]
          : [];

        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, delayMs));
        }

        return {
          snapshotIdUsed: `snp-${callCount}`,
          result: {
            analyzeResult: {
              result: {
                parse: { symbols: [], diagnostics: [] },
                introspect: {
                  success: analysis.hasError ? 0 : 1,
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
          metrics: { durationMs: delayMs },
        };
      },
      async analyze() {
        throw new Error('analyze fallback should not be used');
      },
      async findOccurrences() {
        return { occurrences: [] };
      },
    },
  };
}

function createMockServices(
  uri: string,
  cachedEntry: DocumentCacheEntry | undefined,
  bridgeConfig: MockBridgeConfig
) {
  const mockBridge = createMockBridge(bridgeConfig);
  let entry = cachedEntry;

  return {
    services: {
      bridge: mockBridge.bridge,
      documentCache: {
        get(requestedUri: string) {
          return requestedUri === uri ? entry : undefined;
        },
        setPending() {},
        set(requestedUri: string, e: DocumentCacheEntry) {
          if (requestedUri === uri) entry = e;
        },
        delete() {},
      },
      typeDatabase: {
        setProgram() {},
        removeProgram() {},
        getMemoryStats() {
          return {
            programCount: 0,
            symbolCount: 0,
            totalBytes: 0,
            utilizationPercent: 0,
          };
        },
      },
      workspaceIndex: { indexDocument() {}, removeDocument() {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    },
    get cachedEntry() {
      return entry;
    },
    bridgeCallCount: () => mockBridge.callCount,
  };
}

/** Run a scenario and return the final diagnostics */
async function runScenario(
  scenario: Scenario,
  bridgeConfig: MockBridgeConfig
): Promise<{ diagnostics: unknown[]; bridgeCallCount: number }> {
  const uri = `file:///test-${scenario.name}.pike`;
  const diagnosticsPublished: Array<{ uri: string; diagnostics: unknown[] }> = [];

  let onDidChangeTextDocumentHandler: ((params: DidChangeTextDocumentParams) => void) | undefined;
  let onDidChangeConfigurationHandler: ((params: DidChangeConfigurationParams) => void) | undefined;

  const docs = createMockDocuments();
  const { services, bridgeCallCount } = createMockServices(uri, undefined, bridgeConfig);

  const connectionLike = {
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }) {
      diagnosticsPublished.push(params);
    },
    onDidChangeConfiguration(handler: (params: DidChangeConfigurationParams) => void) {
      onDidChangeConfigurationHandler = handler;
    },
    onDidChangeTextDocument(handler: (params: DidChangeTextDocumentParams) => void) {
      onDidChangeTextDocumentHandler = handler;
    },
    console: { log() {}, warn() {}, error() {} },
  };

  registerDiagnosticsHandlers(
    connectionLike as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  // Set diagnostic delay to 0
  onDidChangeConfigurationHandler?.({ settings: { pike: { diagnosticDelay: 0 } } });

  // Execute actions
  for (const action of scenario.actions) {
    const doc = TextDocument.create(uri, 'pike', action.version, action.content);

    if (action.type === 'open') {
      docs.set(uri, doc);
    } else if (action.type === 'edit') {
      docs.set(uri, doc);
      if (action.editRange && onDidChangeTextDocumentHandler) {
        onDidChangeTextDocumentHandler({
          textDocument: { uri, version: action.version },
          contentChanges: [
            {
              range: action.editRange,
              text: action.editText ?? '',
            },
          ],
        });
      } else if (onDidChangeTextDocumentHandler) {
        onDidChangeTextDocumentHandler({
          textDocument: { uri, version: action.version },
          contentChanges: [{ text: action.content }],
        });
      }
    } else if (action.type === 'save') {
      docs.set(uri, doc);
    }

    // Wait for validation
    await new Promise(r => setTimeout(r, 200));
  }

  const lastPublish = diagnosticsPublished.filter(d => d.uri === uri).pop();

  return {
    diagnostics: lastPublish?.diagnostics ?? [],
    bridgeCallCount: bridgeCallCount(),
  };
}

// ---------------------------------------------------------------------------
// PARSER: simulates Pike's actual syntax error detection
// ---------------------------------------------------------------------------

function pikeAnalyzer(text: string): { hasError: boolean; errorMessage?: string } {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('//')) continue;
    // Check for incomplete assignments: "int x = ;" or "int x ="
    if (/=\s*;/.test(trimmed) || (/=\s*$/.test(trimmed) && !trimmed.endsWith('{'))) {
      return { hasError: true, errorMessage: 'Syntax error: expected expression' };
    }
    // Check for missing semicolons (line ends with identifier/digit/paren but not ; or { or })
    if (
      trimmed.length > 0 &&
      !trimmed.endsWith(';') &&
      !trimmed.endsWith('{') &&
      !trimmed.endsWith('}') &&
      !trimmed.endsWith('(') &&
      !trimmed.endsWith(',') &&
      !trimmed.startsWith('//') &&
      !trimmed.startsWith('/*') &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('if') &&
      !trimmed.startsWith('else') &&
      !trimmed.startsWith('for') &&
      !trimmed.startsWith('while') &&
      !trimmed.startsWith('class') &&
      !trimmed.startsWith('return') &&
      /[a-zA-Z0-9)\]]$/.test(trimmed)
    ) {
      return { hasError: true, errorMessage: "Syntax error: expected ';'" };
    }
  }
  return { hasError: false };
}

// ---------------------------------------------------------------------------
// SCENARIOS
// ---------------------------------------------------------------------------

const scenarios: Scenario[] = [
  {
    name: 'syntax-error-clears-on-fix',
    description: 'Opening a file with syntax error shows diagnostic, fixing it clears it',
    actions: [
      { type: 'open', content: 'int x = ;\n', version: 1 },
      {
        type: 'edit',
        content: 'int x = 1;\n',
        version: 2,
        editRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
        editText: '1',
      },
    ],
    expect: { diagnosticCount: 0 },
  },
  {
    name: 'error-on-different-line-clears-on-fix',
    description: 'Fixing an error on line 2 while line 1 was edited',
    actions: [
      { type: 'open', content: 'int a = 1;\nint x = ;\n', version: 1 },
      {
        type: 'edit',
        content: 'int a = 2;\nint x = ;\n',
        version: 2,
        editRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
        editText: '2',
      },
      {
        type: 'edit',
        content: 'int a = 2;\nint x = 1;\n',
        version: 3,
        editRange: { start: { line: 1, character: 8 }, end: { line: 1, character: 8 } },
        editText: '1',
      },
    ],
    expect: { diagnosticCount: 0 },
  },
  {
    name: 'rapid-edit-cycle-settles-correctly',
    description: 'Multiple rapid edits should settle on the final state, not intermediate errors',
    actions: [
      { type: 'open', content: 'int x = ;\n', version: 1 },
      { type: 'edit', content: 'int x = 1;\n', version: 2 },
      { type: 'edit', content: 'int x = ;\n', version: 3 },
      { type: 'edit', content: 'int x = 42;\n', version: 4 },
    ],
    expect: { diagnosticCount: 0 },
  },
  {
    name: 'valid-code-stays-clean',
    description: 'Valid code should not produce diagnostics even after whitespace edits',
    actions: [
      { type: 'open', content: 'int x = 1;\n', version: 1 },
      {
        type: 'edit',
        content: 'int x = 1;   \n',
        version: 2,
        editRange: { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
        editText: '   ',
      },
    ],
    expect: { diagnosticCount: 0 },
  },
  {
    name: 'error-appears-on-broken-edit',
    description: 'Editing valid code to break it should show diagnostics',
    actions: [
      { type: 'open', content: 'int x = 1;\n', version: 1 },
      {
        type: 'edit',
        content: 'int x = ;\n',
        version: 2,
        editRange: { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
        editText: '',
      },
    ],
    expect: { diagnosticCount: 1, diagnostics: [{ isError: true, messageContains: 'error' }] },
  },
  {
    name: 'multi-line-function-error-clears',
    description: 'Syntax error in multi-line function clears after fix',
    actions: [
      { type: 'open', content: 'int add(int a, int b) {\n  return a + ;\n}\n', version: 1 },
      {
        type: 'edit',
        content: 'int add(int a, int b) {\n  return a + b;\n}\n',
        version: 2,
        editRange: { start: { line: 1, character: 12 }, end: { line: 1, character: 12 } },
        editText: 'b',
      },
    ],
    expect: { diagnosticCount: 0 },
  },
  {
    name: 'undo-restores-error',
    description: 'CTRL+Z undo should restore the error if the fix is reverted',
    actions: [
      { type: 'open', content: 'int x = ;\n', version: 1 },
      { type: 'edit', content: 'int x = 1;\n', version: 2 },
      { type: 'edit', content: 'int x = ;\n', version: 3 },
    ],
    expect: { diagnosticCount: 1, diagnostics: [{ isError: true }] },
  },
];

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

describe('LSP Scenario Runner (behavior-level verification)', () => {
  for (const scenario of scenarios) {
    it(`[${scenario.name}] ${scenario.description}`, async () => {
      const result = await runScenario(scenario, { analyzeResult: pikeAnalyzer });

      assert.strictEqual(
        result.diagnostics.length,
        scenario.expect.diagnosticCount,
        `Expected ${scenario.expect.diagnosticCount} diagnostics, got ${result.diagnostics.length}. ` +
          `Diagnostics: ${JSON.stringify(result.diagnostics)}`
      );

      if (scenario.expect.diagnostics) {
        for (const expected of scenario.expect.diagnostics) {
          if (expected.isError) {
            const hasError = (result.diagnostics as Record<string, unknown>[]).some(
              d => d['severity'] === 1
            );
            assert.ok(hasError, 'Expected at least one error diagnostic');
          }
          if (expected.messageContains) {
            const hasMatch = (result.diagnostics as Record<string, unknown>[]).some(d =>
              String(d['message']).toLowerCase().includes(expected.messageContains!.toLowerCase())
            );
            assert.ok(hasMatch, `Expected diagnostic containing "${expected.messageContains}"`);
          }
        }
      }
    });
  }
});
