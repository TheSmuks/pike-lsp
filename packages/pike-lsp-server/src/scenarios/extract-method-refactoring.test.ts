/**
 * Scenario test: Extract Method Refactoring
 *
 * Validates that extract-method uses symbol-table data (DocumentCacheEntry)
 * instead of regex for variable detection and type inference.
 *
 * Covers issue #1343: old regex missed complex types, multi-variable
 * declarations, uninitialised variables, and misclassified hex/negative literals.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getExtractMethodAction } from '../features/advanced/extract-method.js';
import type { DocumentCacheEntry } from '../core/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function doc(source: string, uri = 'file:///scenario-extract.pike'): TextDocument {
  return TextDocument.create(uri, 'pike', 1, source);
}

function emptyCache(): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: '',
    lineHashes: [],
    analysisState: { isStale: false, parseFailed: false },
  };
}

/** Build a cache entry with typed variables (as PikeSymbol with kind='variable'). */
function cacheWithTypedVars(vars: Array<{ name: string; typeKind: string }>): DocumentCacheEntry {
  const symbols = vars.map(v => ({
    name: v.name,
    kind: 'variable' as const,
    modifiers: [] as string[],
    type: { kind: v.typeKind },
    children: [],
  })) as PikeSymbol[];

  const symbolNames = new Map<string, PikeSymbol>();
  for (const s of symbols) {
    symbolNames.set(s.name, s);
  }

  return {
    version: 1,
    symbols,
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames,
    contentHash: '',
    lineHashes: [],
    analysisState: { isStale: false, parseFailed: false },
  };
}

/** Extract the replacement (first) edit's newText from a CodeAction. */
function replacementText(
  action: ReturnType<typeof getExtractMethodAction>,
  uri = 'file:///scenario-extract.pike'
): string | null {
  if (!action?.edit?.changes) return null;
  const edits = action.edit.changes[uri];
  if (!edits || !Array.isArray(edits) || edits.length === 0) return null;
  return (edits[0] as { newText: string }).newText;
}

/** Extract the function-insertion (second) edit's newText. */
function insertionText(
  action: ReturnType<typeof getExtractMethodAction>,
  uri = 'file:///scenario-extract.pike'
): string | null {
  if (!action?.edit?.changes) return null;
  const edits = action.edit.changes[uri];
  if (!edits || !Array.isArray(edits) || edits.length < 2) return null;
  return (edits[1] as { newText: string }).newText;
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe('Extract Method Refactoring — symbol-table variable detection', () => {
  it('should use symbol-table variables as parameters when referenced in code', () => {
    const code = `int main() {
    int count = 0;
    count = count + 1;
}`;
    const document = doc(code);
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 22 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      cacheWithTypedVars([{ name: 'count', typeKind: 'int' }])
    );

    assert.ok(result, 'Should return an action');
    const replacement = replacementText(result);
    assert.ok(replacement, 'Should have replacement edit');
    assert.ok(replacement!.includes('count'), `count should be a parameter — got: ${replacement}`);
  });

  it('should detect variables with complex types like mapping(string:int)', () => {
    const code = `int main() {
    mapping(string:int) m = ([]);
    m["key"] = 42;
}`;
    const document = doc(code);
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 16 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      cacheWithTypedVars([{ name: 'm', typeKind: 'mapping' }])
    );

    assert.ok(result, 'Should return an action');
    const replacement = replacementText(result);
    assert.ok(replacement, 'Should have replacement edit');
    assert.ok(
      replacement!.includes('m'),
      `m should be a parameter (complex type) — got: ${replacement}`
    );
  });

  it('should not include symbols that are not referenced in the selected code', () => {
    const code = `int main() {
    int x = 1;
    int y = 2;
    return x;
}`;
    const document = doc(code);
    const range = {
      start: { line: 3, character: 4 },
      end: { line: 3, character: 13 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      cacheWithTypedVars([
        { name: 'x', typeKind: 'int' },
        { name: 'y', typeKind: 'int' },
      ])
    );

    assert.ok(result, 'Should return an action');
    const replacement = replacementText(result);
    assert.ok(replacement, 'Should have replacement edit');
    assert.ok(replacement!.includes('x'), `x should be a parameter — got: ${replacement}`);
    assert.ok(
      !replacement!.includes('y'),
      `y should NOT be a parameter (not in selection) — got: ${replacement}`
    );
  });
});

describe('Extract Method Refactoring — type inference from symbol table', () => {
  it('should infer int return type from symbol table for a variable', () => {
    const code = `int main() {
    int count = 5;
    return count;
}`;
    const document = doc(code);
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 17 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      cacheWithTypedVars([{ name: 'count', typeKind: 'int' }])
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('int extracted_function('),
      `Return type should be 'int' from symbol table — got: ${funcText}`
    );
  });

  it('should infer string return type from symbol table for a variable', () => {
    const code = `string main() {
    string name = "test";
    return name;
}`;
    const document = doc(code);
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 16 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      cacheWithTypedVars([{ name: 'name', typeKind: 'string' }])
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('string extracted_function('),
      `Return type should be 'string' from symbol table — got: ${funcText}`
    );
  });

  it('should correctly classify hex literal return value as int', () => {
    const code = `int main() {
    return 0xFF;
}`;
    const document = doc(code);
    // "return 0xFF;" is 13 chars starting at char 4, ending at char 17
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 17 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      emptyCache()
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('int extracted_function('),
      `Hex literal 0xFF should infer int — got: ${funcText}`
    );
  });

  it('should correctly classify negative number return value as int', () => {
    const code = `int main() {
    return -42;
}`;
    const document = doc(code);
    // "return -42;" is 11 chars starting at char 4, ending at char 15
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 15 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      emptyCache()
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('int extracted_function('),
      `Negative number -42 should infer int — got: ${funcText}`
    );
  });

  it('should correctly classify float literal return value', () => {
    const code = `float main() {
    return 3.14;
}`;
    const document = doc(code);
    // "return 3.14;" is 12 chars starting at char 4, ending at char 16
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 16 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      emptyCache()
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('float extracted_function('),
      `3.14 should infer float — got: ${funcText}`
    );
  });

  it('should correctly classify scientific notation float literal', () => {
    const code = `float main() {
    return 1e10;
}`;
    const document = doc(code);
    // "return 1e10;" is 12 chars starting at char 4, ending at char 16
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 16 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      emptyCache()
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('float extracted_function('),
      `1e10 should infer float — got: ${funcText}`
    );
  });

  it('should return mixed for unknown return expressions', () => {
    const code = `mixed main() {
    return some_func();
}`;
    const document = doc(code);
    // "return some_func();" is 19 chars starting at char 4, ending at char 23
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 23 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      emptyCache()
    );

    assert.ok(result, 'Should return an action');
    const funcText = insertionText(result);
    assert.ok(funcText, 'Should have function insertion edit');
    assert.ok(
      funcText!.includes('mixed extracted_function('),
      `Unknown expression should infer mixed — got: ${funcText}`
    );
  });
});

describe('Extract Method Refactoring — comment/string stripping', () => {
  it('should not treat identifiers inside Pike #"multi-line"# strings as variables', () => {
    const code = `int main() {
    int count = 0;
    write(#"count is unused");
    count = count + 1;
}`;
    const document = doc(code);
    const range = {
      start: { line: 3, character: 4 },
      end: { line: 3, character: 22 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///scenario-extract.pike',
      range,
      code,
      undefined,
      cacheWithTypedVars([{ name: 'count', typeKind: 'int' }])
    );

    assert.ok(result, 'Should return an action');
    const replacement = replacementText(result);
    assert.ok(replacement, 'Should have replacement edit');
    const callMatch = replacement!.match(/extracted_function\(([^)]*)\)/);
    assert.ok(callMatch, 'Should have a function call');
    const args = callMatch![1]!
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const countOccurrences = args.filter(a => a === 'count').length;
    assert.equal(
      countOccurrences,
      1,
      `count should appear exactly once in args, got ${countOccurrences}: ${callMatch![1]}`
    );
  });
});
