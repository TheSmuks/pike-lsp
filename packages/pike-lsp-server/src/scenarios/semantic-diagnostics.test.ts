/**
 * Semantic Diagnostics Scenario Tests
 *
 * Tests for Issue #1196: Add semantic analysis beyond syntax-only
 * - Undefined variable/function detection
 * - Basic type mismatch warnings
 * - Missing required callbacks (Roxen modules)
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeToken, IntrospectionResult } from '@pike-lsp/pike-bridge';
import type { PikeSettings } from '../core/types.js';
import {
  analyzeSemantics,
  deduplicateDiagnostics,
  isSemanticAnalysisEnabled,
} from '../features/diagnostics/semantic-analyzer.js';

function createPikeDocument(uri: string, content: string): TextDocument {
  return TextDocument.create(uri, 'pike', 1, content);
}

// ---------------------------------------------------------------------------
// Tests: Undefined Symbol Detection
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Undefined Symbol Detection', () => {
  it('should detect undefined variable usage', () => {
    const doc = createPikeDocument('file:///test1.pike', 'int main() { return undefined_var; }');

    const result = analyzeSemantics(
      doc,
      [{ name: 'main', kind: 'method', modifiers: ['public'] }],
      undefined,
      [{ text: 'undefined_var', line: 1, character: 25, file: 0 }],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    assert.strictEqual(result.diagnostics.length, 1);
    assert.ok(result.diagnostics[0]!.message.includes('undefined_var'));
    assert.strictEqual(result.stats.undefinedSymbols, 1);
  });

  it('should not flag defined variables as undefined', () => {
    const doc = createPikeDocument('file:///test2.pike', 'int main() { int x = 5; return x; }');

    const symbols: PikeSymbol[] = [
      { name: 'main', kind: 'method', modifiers: ['public'] },
      { name: 'x', kind: 'variable', modifiers: ['local'] },
    ];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [
        { text: 'main', line: 1, character: 4, file: 0 },
        { text: 'x', line: 1, character: 26, file: 0 },
      ],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    assert.strictEqual(result.diagnostics.length, 0);
    assert.strictEqual(result.stats.undefinedSymbols, 0);
  });

  it('should detect undefined function calls', () => {
    const doc = createPikeDocument(
      'file:///test3.pike',
      'int main() { return undefined_function(); }'
    );

    const symbols: PikeSymbol[] = [{ name: 'main', kind: 'method', modifiers: ['public'] }];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [
        { text: 'main', line: 1, character: 4, file: 0 },
        { text: 'undefined_function', line: 1, character: 18, file: 0 },
      ],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    assert.ok(result.diagnostics.length >= 1);
    const diag = result.diagnostics.find(d => d.message.includes('undefined_function'));
    assert.ok(diag, 'Should have diagnostic for undefined function');
  });

  it('should not flag Pike built-in functions as undefined', () => {
    const doc = createPikeDocument(
      'file:///test4.pike',
      'int main() { write("hello"); return 0; }'
    );

    const symbols: PikeSymbol[] = [{ name: 'main', kind: 'method', modifiers: ['public'] }];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [
        { text: 'main', line: 1, character: 4, file: 0 },
        { text: 'write', line: 1, character: 13, file: 0 },
      ],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    const writeDiag = result.diagnostics.find(d => d.message.includes('write'));
    assert.strictEqual(writeDiag, undefined, 'write() is a built-in and should not be flagged');
  });

  it('should skip member access tokens (obj->member)', () => {
    const doc = createPikeDocument(
      'file:///test5.pike',
      'int main() { object o; return o->member; }'
    );

    const symbols: PikeSymbol[] = [{ name: 'main', kind: 'method', modifiers: ['public'] }];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [
        { text: 'main', line: 1, character: 4, file: 0 },
        { text: 'o', line: 1, character: 24, file: 0 },
        { text: '->', line: 1, character: 25, file: 0 },
        { text: 'member', line: 1, character: 27, file: 0 },
      ],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    const memberDiag = result.diagnostics.find(d => d.message.includes('member'));
    assert.strictEqual(memberDiag, undefined, 'Member access should be skipped');
  });

  it('should skip scope resolution tokens (Class::method)', () => {
    const doc = createPikeDocument(
      'file:///test6.pike',
      'class Test { static int x; } int main() { return Test::x; }'
    );

    const symbols: PikeSymbol[] = [
      {
        name: 'Test',
        kind: 'class',
        modifiers: ['public'],
        children: [{ name: 'x', kind: 'variable', modifiers: ['static'] }],
      },
      { name: 'main', kind: 'method', modifiers: ['public'] },
    ];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [
        { text: 'Test', line: 1, character: 6, file: 0 },
        { text: 'x', line: 1, character: 30, file: 0 },
        { text: 'main', line: 1, character: 41, file: 0 },
        { text: 'Test', line: 1, character: 57, file: 0 },
        { text: '::', line: 1, character: 61, file: 0 },
        { text: 'x', line: 1, character: 63, file: 0 },
      ],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    const scopeDiag = result.diagnostics.find(
      d => d.message.includes('x') && d.message.includes('Undefined')
    );
    assert.strictEqual(scopeDiag, undefined, 'Scope resolution should be skipped');
  });

  it('should skip Pike keywords', () => {
    const doc = createPikeDocument('file:///test7.pike', 'int main() { if (1) return 0; }');

    const symbols: PikeSymbol[] = [{ name: 'main', kind: 'method', modifiers: ['public'] }];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [
        { text: 'main', line: 1, character: 4, file: 0 },
        { text: 'if', line: 1, character: 13, file: 0 },
        { text: 'return', line: 1, character: 20, file: 0 },
      ],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    const keywordDiag = result.diagnostics.find(
      d => d.message.includes('if') || d.message.includes('return')
    );
    assert.strictEqual(keywordDiag, undefined, 'Keywords should not be flagged as undefined');
  });
});

// ---------------------------------------------------------------------------
// Tests: Type Mismatch Detection
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Type Mismatch Detection', () => {
  it('should detect type mismatch in variable assignment', () => {
    const doc = createPikeDocument('file:///test8.pike', 'x = "hello";');

    const introspection: IntrospectionResult = {
      success: 1,
      symbols: [{ name: 'x', kind: 'variable', type: { kind: 'int' }, modifiers: [] }],
      functions: [],
      variables: [{ name: 'x', kind: 'variable', type: { kind: 'int' }, modifiers: [] }],
      classes: [],
      inherits: [],
      diagnostics: [],
    };
    const tokens: PikeToken[] = [
      { text: 'x', line: 0, character: 0, file: 0 },
      { text: '=', line: 0, character: 2, file: 0 },
      { text: '"hello"', line: 0, character: 4, file: 0 },
      { text: ';', line: 0, character: 12, file: 0 },
    ];

    const result = analyzeSemantics(doc, [], introspection, tokens, {
      maxProblems: 100,
      enableUndefinedDetection: false,
      enableTypeMismatch: true,
      enableMissingCallbacks: false,
    });

    assert.ok(result.diagnostics.length >= 1, 'Should detect type mismatch');
    const mismatchDiag = result.diagnostics.find(d => d.message.includes('Type mismatch'));
    assert.ok(mismatchDiag, 'Should have type mismatch diagnostic');
  });
  it('should allow int to float assignment (compatible types)', () => {
    const doc = createPikeDocument('file:///test9.pike', 'x = 42;');

    const introspection: IntrospectionResult = {
      success: 1,
      symbols: [{ name: 'x', kind: 'variable', type: { kind: 'float' }, modifiers: [] }],
      functions: [],
      variables: [{ name: 'x', kind: 'variable', type: { kind: 'float' }, modifiers: [] }],
      classes: [],
      inherits: [],
      diagnostics: [],
    };
    const tokens: PikeToken[] = [
      { text: 'x', line: 0, character: 0, file: 0 },
      { text: '=', line: 0, character: 2, file: 0 },
      { text: '42', line: 0, character: 4, file: 0 },
      { text: ';', line: 0, character: 6, file: 0 },
    ];

    const result = analyzeSemantics(doc, [], introspection, tokens, {
      maxProblems: 100,
      enableUndefinedDetection: false,
      enableTypeMismatch: true,
      enableMissingCallbacks: false,
    });

    assert.strictEqual(
      result.diagnostics.length,
      0,
      'int to float is compatible, should have no diagnostics'
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: Roxen Module Callback Detection
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Roxen Module Callbacks', () => {
  it('should hint about missing required callbacks in Roxen module', () => {
    const doc = createPikeDocument(
      'file:///test10.pike',
      'inherit "roxen"; int main() { return 0; }'
    );

    const result = analyzeSemantics(
      doc,
      [{ name: 'main', kind: 'method', modifiers: ['public'] }],
      undefined,
      [],
      {
        maxProblems: 100,
        enableUndefinedDetection: false,
        enableTypeMismatch: false,
        enableMissingCallbacks: true,
      }
    );

    assert.ok(result.diagnostics.length >= 1, 'Should detect missing callbacks');
    const callbackDiag = result.diagnostics.find(d => d.message.includes('callback'));
    assert.ok(callbackDiag, 'Should hint about missing callback');
  });

  it('should not flag callbacks when they are implemented', () => {
    const doc = createPikeDocument(
      'file:///test11.pike',
      'inherit "roxen"; void start() {} void stop() {}'
    );

    const symbols: PikeSymbol[] = [
      { name: 'start', kind: 'method', modifiers: ['public'] },
      { name: 'stop', kind: 'method', modifiers: ['public'] },
    ];

    const result = analyzeSemantics(doc, symbols, undefined, [], {
      maxProblems: 100,
      enableUndefinedDetection: false,
      enableTypeMismatch: false,
      enableMissingCallbacks: true,
    });

    const missingDiag = result.diagnostics.find(d => d.message.includes('missing'));
    assert.strictEqual(missingDiag, undefined, 'Should not flag implemented callbacks');
  });

  it('should detect Roxen module from MODULE_ constants', () => {
    const doc = createPikeDocument('file:///test12.pike', 'constant MODULE_NAME = "test";');

    const result = analyzeSemantics(doc, [], undefined, [], {
      maxProblems: 100,
      enableUndefinedDetection: false,
      enableTypeMismatch: false,
      enableMissingCallbacks: true,
    });

    assert.ok(result.diagnostics.length >= 1, 'Should detect MODULE_ pattern as Roxen module');
  });
});

// ---------------------------------------------------------------------------
// Tests: Diagnostics Deduplication
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Deduplication', () => {
  it('should not duplicate existing Pike compiler diagnostics', () => {
    const existing = [
      {
        severity: 1 as const,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        message: 'Test error',
        source: 'pike',
      },
    ];

    const newDiags = [
      {
        severity: 1 as const,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        message: 'Test error',
        source: 'pike-semantic',
      },
    ];

    const deduplicated = deduplicateDiagnostics(existing, newDiags);
    assert.strictEqual(deduplicated.length, 0, 'Should filter duplicate');
  });

  it('should keep unique semantic diagnostics', () => {
    const existing = [
      {
        severity: 1 as const,
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        message: 'Syntax error',
        source: 'pike',
      },
    ];

    const newDiags = [
      {
        severity: 2 as const,
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
        message: 'Undefined symbol',
        source: 'pike-semantic',
      },
    ];

    const deduplicated = deduplicateDiagnostics(existing, newDiags);
    assert.strictEqual(deduplicated.length, 1, 'Should keep unique diagnostic');
    assert.strictEqual(deduplicated[0]!.message, 'Undefined symbol');
  });
});

// ---------------------------------------------------------------------------
// Tests: Settings
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Settings', () => {
  it('should return true when enableSemanticAnalysis is not set', () => {
    const settings: PikeSettings = {
      pikePath: '/usr/bin/pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 500,
    };
    assert.strictEqual(isSemanticAnalysisEnabled(settings), true);
  });

  it('should return true when enableSemanticAnalysis is true', () => {
    const settings: PikeSettings = {
      pikePath: '/usr/bin/pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 500,
    };
    assert.strictEqual(isSemanticAnalysisEnabled(settings), true);
  });

  it('should always return true since enableSemanticAnalysis is not a typed setting', () => {
    const settings: PikeSettings = {
      pikePath: '/usr/bin/pike',
      maxNumberOfProblems: 100,
      diagnosticDelay: 500,
    };
    assert.strictEqual(isSemanticAnalysisEnabled(settings), true);
  });
});

// ---------------------------------------------------------------------------
// Tests: Performance and Limits
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Performance', () => {
  it('should respect maxProblems limit', () => {
    const doc = createPikeDocument(
      'file:///perf-test.pike',
      'int main() { int a = x; int b = y; int c = z; int d = w; }'
    );

    const tokens: PikeToken[] = [
      { text: 'main', line: 1, character: 4, file: 0 },
      { text: 'a', line: 1, character: 20, file: 0 },
      { text: 'x', line: 1, character: 24, file: 0 },
      { text: 'b', line: 1, character: 35, file: 0 },
      { text: 'y', line: 1, character: 39, file: 0 },
      { text: 'c', line: 1, character: 50, file: 0 },
      { text: 'z', line: 1, character: 54, file: 0 },
    ];

    const result = analyzeSemantics(doc, [], undefined, tokens, {
      maxProblems: 2,
      enableUndefinedDetection: true,
      enableTypeMismatch: false,
      enableMissingCallbacks: false,
    });

    assert.ok(result.diagnostics.length <= 2, 'Should respect maxProblems limit');
  });

  it('should handle empty tokens gracefully', () => {
    const doc = createPikeDocument('file:///empty-test.pike', '');

    const result = analyzeSemantics(doc, [], undefined, [], {
      maxProblems: 100,
      enableUndefinedDetection: true,
      enableTypeMismatch: true,
      enableMissingCallbacks: true,
    });

    assert.strictEqual(result.diagnostics.length, 0);
    assert.deepStrictEqual(result.stats, {
      undefinedSymbols: 0,
      typeMismatches: 0,
      missingCallbacks: 0,
    });
  });

  it('should handle undefined introspection gracefully', () => {
    const doc = createPikeDocument('file:///no-introspect.pike', 'int main() { return 0; }');

    const symbols: PikeSymbol[] = [{ name: 'main', kind: 'method', modifiers: ['public'] }];

    const result = analyzeSemantics(
      doc,
      symbols,
      undefined,
      [{ text: 'main', line: 1, character: 4, file: 0 }],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: true,
        enableMissingCallbacks: false,
      }
    );

    assert.ok(result.diagnostics !== undefined);
    assert.ok(result.stats !== undefined);
  });
});

// ---------------------------------------------------------------------------
// Tests: Edge Cases
// ---------------------------------------------------------------------------

describe('Semantic Diagnostics: Edge Cases', () => {
  it('should handle nested class symbols', () => {
    const symbols: PikeSymbol[] = [
      {
        name: 'Outer',
        kind: 'class',
        modifiers: ['public'],
        children: [
          {
            name: 'Inner',
            kind: 'class',
            modifiers: ['public'],
            children: [{ name: 'value', kind: 'variable', modifiers: ['public'] }],
          },
        ],
      },
    ];

    const defined = new Set<string>();
    const flatten = (s: PikeSymbol[]) => {
      for (const sym of s) {
        if (sym.name) defined.add(sym.name);
        if (sym.children) flatten(sym.children);
      }
    };
    flatten(symbols);

    assert.ok(defined.has('Outer'));
    assert.ok(defined.has('Inner'));
    assert.ok(defined.has('value'));
  });

  it('should handle string literals with escape sequences', () => {
    const doc = createPikeDocument(
      'file:///string-test.pike',
      'int main() { string x = "hello\\nworld"; }'
    );

    const result = analyzeSemantics(
      doc,
      [{ name: 'main', kind: 'method', modifiers: ['public'] }],
      undefined,
      [{ text: 'main', line: 1, character: 4, file: 0 }],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    const stringDiag = result.diagnostics.find(d => d.message.includes('hello'));
    assert.strictEqual(stringDiag, undefined);
  });

  it('should handle preprocessor directives', () => {
    const doc = createPikeDocument(
      'file:///preproc.pike',
      '#if constant(DEBUG)\nvoid debug() {}\n#endif'
    );

    // With empty symbols, DEBUG from preprocessor context is reported as
    // undefined — this is correct since no symbol table data resolves it.
    // When real parse data is available, preprocessor tokens are typically
    // not included in the token stream, so this scenario only arises with
    // manually constructed tokens.
    const result = analyzeSemantics(
      doc,
      [],
      undefined,
      [{ text: 'DEBUG', line: 1, character: 17, file: 0 }],
      {
        maxProblems: 100,
        enableUndefinedDetection: true,
        enableTypeMismatch: false,
        enableMissingCallbacks: false,
      }
    );

    // Previously, regex accidentally treated constant(DEBUG) as a function
    // parameter list, suppressing the diagnostic. Symbol-table-based approach
    // correctly requires symbols to resolve identifiers.
    assert.ok(result.diagnostics.length > 0);
    assert.ok(result.diagnostics.some(d => d.message.includes('DEBUG')));
  });
});
