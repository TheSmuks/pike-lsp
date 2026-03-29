/**
 * LSP Scenario Runner (Anti-Cheat Edition)
 *
 * These scenarios test the actual code paths that were buggy, not the
 * full mock pipeline. Each scenario directly verifies the fix:
 *
 * 1. classifyChange must return canSkip:false when parseFailed:true
 * 2. sendDiagnostics must be called even when skip is legitimate
 *
 * The scenarios test at the RIGHT level of abstraction:
 * - classifyChange behavior (unit-level, but scenario-formatted)
 * - Full pipeline with pre-seeded cache (integration-level)
 *
 * If an agent changes the code, these scenarios MUST fail before the
 * fix and pass after. If they pass in both states, the agent cheated.
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
import { classifyChange } from '../features/diagnostics/change-detection.js';
import {
  PIKE_PREDEFINED_MACROS,
  MACRO_MAP,
  isPikeMacro,
  getMacroInfo,
} from '../features/navigation/keywords.js';
import type { Services } from '../services/index.js';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import type { DocumentCacheEntry } from '../core/types.js';

// ---------------------------------------------------------------------------
// Level 1: classifyChange directly (the actual fix point)
// ---------------------------------------------------------------------------

describe('Scenario: classifyChange with parseFailed', () => {
  function makeEntry(text: string, parseFailed: boolean): DocumentCacheEntry {
    const lines = text.split('\n');
    // Simple hash function matching the real one
    const lineHashes = lines.map(line => {
      const semantic = line.replace(/\/\/.*/, '').trim();
      let h = 2166136261;
      for (let i = 0; i < semantic.length; i++) {
        h ^= semantic.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    });
    return {
      version: 1,
      symbols: [],
      diagnostics: parseFailed
        ? [
            {
              message: 'Syntax error',
              severity: 1,
              range: {
                start: { line: 0, character: 8 },
                end: { line: 0, character: 9 },
              },
              source: 'pike',
            },
          ]
        : [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'test-hash',
      lineHashes,
      analysisState: { isStale: false, parseFailed },
    };
  }

  it('MUST NOT skip when parseFailed=true, even if line hash matches', () => {
    // This is the exact bug: parseFailed=true, edit doesn't change line semantics,
    // classifyChange returns canSkip:true, diagnostics never updated
    const entry = makeEntry('int x = ;\n', true);
    const doc = TextDocument.create('file:///t.pike', 'pike', 2, 'int x = ;   \n');

    const result = classifyChange(
      doc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      entry
    );

    assert.strictEqual(result.canSkip, false, 'MUST re-validate when parseFailed');
    assert.strictEqual(result.reason, 'previous_parse_failed');
  });

  it('MUST NOT skip when parseFailed=true, even with full document (no range)', () => {
    const entry = makeEntry('int x = ;\n', true);
    const doc = TextDocument.create('file:///t.pike', 'pike', 2, 'int x = ;\n');

    const result = classifyChange(doc, undefined, entry);

    assert.strictEqual(result.canSkip, false, 'MUST re-validate when parseFailed');
  });

  it('MUST NOT skip when parseFailed=true, edit on different line', () => {
    const entry = makeEntry('int a = 1;\nint x = ;\n', true);
    const doc = TextDocument.create('file:///t.pike', 'pike', 2, 'int a = 2;\nint x = ;\n');

    const result = classifyChange(
      doc,
      { start: { line: 0, character: 8 }, end: { line: 0, character: 9 } },
      entry
    );

    assert.strictEqual(result.canSkip, false, 'MUST re-validate when parseFailed');
  });

  it('CAN skip when parseFailed=false and only whitespace changed', () => {
    const entry = makeEntry('int x = 1;\n', false);
    const doc = TextDocument.create('file:///t.pike', 'pike', 2, 'int x = 1;   \n');

    const result = classifyChange(
      doc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      entry
    );

    assert.strictEqual(result.canSkip, true, 'CAN skip when no error and whitespace');
  });

  it('CAN skip when analysisState is undefined (no error state)', () => {
    const entry = makeEntry('int x = 1;\n', false);
    delete entry.analysisState;
    const doc = TextDocument.create('file:///t.pike', 'pike', 2, 'int x = 1;   \n');

    const result = classifyChange(
      doc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      entry
    );

    assert.strictEqual(result.canSkip, true);
  });
});

// ---------------------------------------------------------------------------
// Level 2: Full pipeline with pre-seeded cache (integration)
// ---------------------------------------------------------------------------

describe('Scenario: sendDiagnostics on skip path', () => {
  type Handler = (event: { document: TextDocument }) => void;

  function createDocs() {
    let handler: Handler | undefined;
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
      onDidChangeContent(h: Handler) {
        handler = h;
      },
      onDidClose() {},
      open(uri: string, doc: TextDocument) {
        docs.set(uri, doc);
        handler?.({ document: doc });
      },
      change(uri: string, doc: TextDocument) {
        docs.set(uri, doc);
        handler?.({ document: doc });
      },
    };
  }

  it('publishes diagnostics even when re-parse is skipped (whitespace edit)', async () => {
    const uri = 'file:///skip-publish.pike';
    const diags: unknown[] = [];
    let configHandler: ((p: DidChangeConfigurationParams) => void) | undefined;
    let changeHandler: ((p: DidChangeTextDocumentParams) => void) | undefined;

    // Pre-seed cache: valid code, no errors, parseFailed=false
    const cleanCode = 'int x = 1;\n';
    let cached: DocumentCacheEntry = {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'clean-hash',
      lineHashes: [12345],
      analysisState: { isStale: false, parseFailed: false },
    };

    const docs = createDocs();
    const conn = {
      sendDiagnostics(p: { diagnostics: unknown[] }) {
        diags.push(p.diagnostics);
      },
      onDidChangeConfiguration(h: (p: DidChangeConfigurationParams) => void) {
        configHandler = h;
      },
      onDidChangeTextDocument(h: (p: DidChangeTextDocumentParams) => void) {
        changeHandler = h;
      },
      console: { log() {}, warn() {}, error() {} },
    };

    const services = {
      bridge: {
        isRunning: () => true,
        start: async () => {},
        engineOpenDocument: async () => ({ revision: 1, snapshotId: 's1' }),
        engineChangeDocument: async () => ({ revision: 1, snapshotId: 's2' }),
        engineCloseDocument: async () => ({ revision: 1, snapshotId: 's3' }),
        engineUpdateConfig: async () => ({ revision: 1, snapshotId: 's4' }),
        engineCancelRequest: async () => ({ accepted: true }),
        engineQuery: async () => ({
          snapshotIdUsed: 'snp',
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
        }),
        analyze: async () => {
          throw new Error('nope');
        },
        findOccurrences: async () => ({ occurrences: [] }),
      },
      documentCache: {
        get: (u: string) => (u === uri ? cached : undefined),
        setPending() {},
        set: (u: string, e: DocumentCacheEntry) => {
          if (u === uri) cached = e;
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
    };

    registerDiagnosticsHandlers(
      conn as unknown as Connection,
      services as unknown as Services,
      docs as unknown as TextDocuments<TextDocument>
    );

    configHandler?.({ settings: { pike: { diagnosticDelay: 0 } } });

    // Open with valid code
    docs.open(uri, TextDocument.create(uri, 'pike', 1, cleanCode));
    await new Promise(r => setTimeout(r, 200));
    const openCount = diags.length;
    assert.ok(openCount > 0, 'Should publish on open');

    // Add whitespace — semantic_unchanged → classifyChange returns canSkip:true
    // The fix ensures sendDiagnostics is still called
    cached = {
      ...cached,
      version: 1,
      analysisState: { isStale: false, parseFailed: false },
    };
    const wsCode = 'int x = 1;   \n';
    docs.change(uri, TextDocument.create(uri, 'pike', 2, wsCode));

    if (changeHandler) {
      changeHandler({
        textDocument: { uri, version: 2 },
        contentChanges: [
          {
            range: {
              start: { line: 0, character: 10 },
              end: { line: 0, character: 10 },
            },
            text: '   ',
          },
        ],
      });
    }

    // Wait for diagnostics to be published (polling for up to 2 seconds)
    const startTime = Date.now();
    while (diags.length <= openCount && Date.now() - startTime < 2000) {
      await new Promise(r => setTimeout(r, 50));
    }

    // MUST have published again (even if skipped, sendDiagnostics must be called)
    assert.ok(
      diags.length > openCount,
      `sendDiagnostics must be called even on skip path. Got ${diags.length} publishes, expected > ${openCount}`
    );
  });
});

// ---------------------------------------------------------------------------
// Level 3: Edge case scenarios
// ---------------------------------------------------------------------------

describe('Scenario: rapid error-fix-error cycle', () => {
  it('parseFailed blocks skip, forcing re-validation each time', () => {
    // Simulate the cycle:
    // 1. Error → parseFailed=true
    // 2. Fix → classifyChange must NOT skip → re-validate → parseFailed=false
    // 3. Error again → parseFailed=true
    // 4. Fix again → classifyChange must NOT skip → re-validate → parseFailed=false

    function makeEntry(parseFailed: boolean): DocumentCacheEntry {
      return {
        version: 1,
        symbols: [],
        diagnostics: parseFailed
          ? [
              {
                message: 'err',
                severity: 1,
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                source: 'pike',
              },
            ]
          : [],
        symbolPositions: new Map(),
        symbolNames: new Map(),
        contentHash: 'h',
        lineHashes: [12345],
        analysisState: { isStale: false, parseFailed },
      };
    }

    // Cycle 1: Error state → edit should NOT skip
    const r1 = classifyChange(
      TextDocument.create('f', 'pike', 2, 'int x = ;\n'),
      { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
      makeEntry(true)
    );
    assert.strictEqual(r1.canSkip, false, 'Cycle 1: must not skip with error');

    // Cycle 2: Clean state → whitespace edit CAN skip
    // Must use same line count and matching semantic content
    const cleanEntry = makeEntry(false);
    const cleanDoc = TextDocument.create('f', 'pike', 2, 'int x = 1;\n');
    const r2 = classifyChange(
      cleanDoc,
      { start: { line: 0, character: 10 }, end: { line: 0, character: 10 } },
      cleanEntry
    );
    // parseFailed=false means we don't force re-validate — the skip or semantic_changed
    // decision depends on hash matching, but the key point is it's not "previous_parse_failed"
    assert.notStrictEqual(
      r2.reason,
      'previous_parse_failed',
      'Cycle 2: clean state should not be blocked by parseFailed'
    );

    // Cycle 3: Error again → must not skip
    const r3 = classifyChange(
      TextDocument.create('f', 'pike', 2, 'int x = ;\n'),
      { start: { line: 0, character: 8 }, end: { line: 0, character: 8 } },
      makeEntry(true)
    );
    assert.strictEqual(r3.canSkip, false, 'Cycle 3: must not skip with error');
  });
});

// ---------------------------------------------------------------------------
// Scenario: Pike predefined macros are available for completion and hover
// ---------------------------------------------------------------------------

describe('Scenario: Pike predefined macros', () => {
  const EXPECTED_MACROS = [
    '__LINE__',
    '__FILE__',
    '__DIR__',
    '__DATE__',
    '__TIME__',
    '__VERSION__',
    '__MAJOR__',
    '__MINOR__',
    '__BUILD__',
    '__REAL_VERSION__',
    '__REAL_MAJOR__',
    '__REAL_MINOR__',
    '__REAL_BUILD__',
    '__PIKE__',
  ];

  it('must include all expected predefined macros in PIKE_PREDEFINED_MACROS', () => {
    const definedNames = new Set(PIKE_PREDEFINED_MACROS.map(m => m.name));
    const missing = EXPECTED_MACROS.filter(name => !definedNames.has(name));
    assert.deepStrictEqual(missing, [], `Missing predefined macros: ${missing.join(', ')}`);
  });

  it('must expose all expected macros through MACRO_MAP lookup', () => {
    for (const name of EXPECTED_MACROS) {
      assert.ok(MACRO_MAP.has(name), `MACRO_MAP missing: ${name}`);
    }
  });

  it('must return true from isPikeMacro for all predefined macros', () => {
    for (const name of EXPECTED_MACROS) {
      assert.strictEqual(isPikeMacro(name), true, `isPikeMacro(${name}) should be true`);
    }
  });

  it('must return info from getMacroInfo for all predefined macros', () => {
    for (const name of EXPECTED_MACROS) {
      const info = getMacroInfo(name);
      assert.ok(info, `getMacroInfo(${name}) should return info`);
      assert.ok(info!.description, `getMacroInfo(${name}).description should be non-empty`);
      assert.ok(info!.expandedValue, `getMacroInfo(${name}).expandedValue should be non-empty`);
    }
  });

  it('must NOT match non-macro identifiers like __attribute__', () => {
    assert.strictEqual(isPikeMacro('__attribute__'), false);
    assert.strictEqual(getMacroInfo('__attribute__'), undefined);
  });

  it('must have correct types for version macros', () => {
    const versionMacro = getMacroInfo('__VERSION__');
    assert.strictEqual(versionMacro?.expandedValue, 'float', '__VERSION__ should expand to float');

    const realVersionMacro = getMacroInfo('__REAL_VERSION__');
    assert.strictEqual(
      realVersionMacro?.expandedValue,
      'float',
      '__REAL_VERSION__ should expand to float'
    );
  });

  it('must have int type for line/build/major/minor macros', () => {
    for (const name of ['__LINE__', '__BUILD__', '__MAJOR__', '__MINOR__']) {
      const info = getMacroInfo(name);
      assert.strictEqual(info?.expandedValue, 'int', `${name} should expand to int`);
    }
  });

  it('must have string type for file/dir/date/time macros', () => {
    for (const name of ['__FILE__', '__DIR__', '__DATE__', '__TIME__']) {
      const info = getMacroInfo(name);
      assert.strictEqual(info?.expandedValue, 'string', `${name} should expand to string`);
    }
  });
});
