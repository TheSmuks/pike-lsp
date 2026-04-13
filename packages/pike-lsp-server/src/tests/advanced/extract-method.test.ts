/**
 * Extract Method Refactoring Tests
 *
 * Tests for extract method actions: token-based return detection, identifier
 * presence checking via token kinds, and end-to-end extract method actions.
 * Covers the scenarios that old regex patterns mishandled: identifiers in
 * comments/strings, multi-line return expressions, and return statements in
 * nested blocks.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeActionKind } from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

import type { DocumentCacheEntry } from '../../core/types.js';

// ---------------------------------------------------------------------------
// Import the module under test.
// Internal helpers are not exported so we test them indirectly through
// getExtractMethodAction, which is the single public entry point.
// ---------------------------------------------------------------------------
import { getExtractMethodAction } from '../../features/advanced/extract-method.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Pike TextDocument from source. */
function doc(source: string, uri = 'file:///test.pike'): TextDocument {
  return TextDocument.create(uri, 'pike', 1, source);
}

/** Build a minimal DocumentCacheEntry with the given variable names. */
function cachedWithVars(...names: string[]): DocumentCacheEntry {
  return {
    version: 1,
    symbols: names.map(name => ({
      name,
      kind: 'variable' as const,
      children: [],
    })),
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(
      names.map(name => [name, { name, kind: 'variable' as const, children: [] }])
    ),
    contentHash: '',
    lineHashes: [],
    analysisState: { isStale: false, parseFailed: false },
  };
}

/** Build a DocumentCacheEntry with a method that has argNames. */
function cachedWithMethod(methodName: string, argNames: (string | null)[]): DocumentCacheEntry {
  const method: PikeSymbol = {
    name: methodName,
    kind: 'method',
    children: [],
    argNames,
    argTypes: argNames.map(() => 'mixed'),
    returnType: 'void',
  } as PikeSymbol;

  return {
    version: 1,
    symbols: [method],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map([[methodName, method]]),
    contentHash: '',
    lineHashes: [],
    analysisState: { isStale: false, parseFailed: false },
  };
}

/** Extract the replacement text (first edit) from a CodeAction. */
function replacementEdit(
  action: { edit?: { changes: Record<string, unknown[]> } },
  uri = 'file:///test.pike'
): unknown {
  if (!action.edit?.changes) return null;
  const edits = action.edit.changes[uri];
  if (!edits || !Array.isArray(edits)) return null;
  return edits[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Extract Method — comment/string false positives', () => {
  it('should not treat a variable name inside a line comment as a parameter', () => {
    const code = `int main() {
    int count = 0;
    // count is used here
    int x = 1;
    return x;
}`;
    const document = doc(code);
    // Select "int x = 1;\n    return x;" (lines 3-4)
    const range = {
      start: { line: 3, character: 4 },
      end: { line: 4, character: 14 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('count')
    );
    assert.ok(result, 'Should return an action');

    // The method call should NOT include `count` as a parameter
    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // "count" appears only in the comment on line 2, not in actual code on lines 3-4
    assert.ok(
      !edit?.newText?.includes('count'),
      `count should NOT be a parameter — got: ${edit?.newText}`
    );
  });

  it('should not treat a variable name inside a string literal as a parameter', () => {
    const code = `int main() {
    int name = 5;
    write("name is %d\\n", name);
    return 0;
}`;
    const document = doc(code);
    // Select line 2 (write("name is %d\n", name);)
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 33 },
    };

    // Provide `name` as a defined variable
    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('name')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // name IS used in actual code (second argument to write), so it should be a parameter.
    // But the "name" inside the string "name is %d\n" should NOT cause a duplicate.
    // We just verify it appears exactly once as an argument.
    const callMatch = edit!.newText!.match(/extracted_function\(([^)]*)\)/);
    assert.ok(callMatch, 'Should have a function call');
    const args = callMatch![1]!
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    // name should appear exactly once
    const nameCount = args.filter(a => a === 'name').length;
    assert.equal(nameCount, 1, `name should appear exactly once in args, got: ${callMatch![1]}`);
  });

  it('should not treat a variable name inside a block comment as a parameter', () => {
    const code = `int main() {
    int data = 42;
    /* data should be positive */
    int y = 1;
    return y;
}`;
    const document = doc(code);
    // Select lines 3-4
    const range = {
      start: { line: 3, character: 4 },
      end: { line: 4, character: 14 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('data')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    assert.ok(
      !edit?.newText?.includes('data'),
      `data should NOT be a parameter (only in block comment) — got: ${edit?.newText}`
    );
  });
});

describe('Extract Method — return statement handling', () => {
  it('should detect a single-line return expression', () => {
    const code = `int main() {
    int x = 1;
    return x + 2;
}`;
    const document = doc(code);
    // Select line 2 (return x + 2;)
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 17 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('x')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // Should assign the return value: "x = extracted_function(x);"
    assert.ok(
      edit!.newText!.includes('='),
      `Should include return value assignment — got: ${edit!.newText}`
    );
  });

  it('should detect a multi-line return expression', () => {
    const code = `int main() {
    int x = 1;
    return x +
           2;
}`;
    const document = doc(code);
    // Select lines 2-3 (return x +\n           2;)
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 3, character: 15 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('x')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // The multi-line return expression "x +\n           2" should be captured
    assert.ok(
      edit!.newText!.includes('='),
      `Should detect multi-line return — got: ${edit!.newText}`
    );
  });

  it('should handle return inside a nested block (only first return)', () => {
    const code = `int main() {
    int x = 1;
    if (x) {
        return 1;
    }
    return 0;
}`;
    const document = doc(code);
    // Select lines 2-5 (the if block + return 0)
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 5, character: 13 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('x')
    );
    assert.ok(result, 'Should return an action');

    // Should still produce a valid action (first return found)
    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
  });

  it('should preserve string literal content in return expression for type inference', () => {
    const code = `string main() {
    return "hello world";
}`;
    const document = doc(code);
    // Select line 1
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 26 },
    };

    const result = getExtractMethodAction(document, 'file:///test.pike', range, code, undefined, {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: '',
      lineHashes: [],
      analysisState: { isStale: false, parseFailed: false },
    });
    assert.ok(result, 'Should return an action');

    // The inserted function should have a string return type
    const allEdits = result!.edit!.changes!['file:///test.pike'] as { newText: string }[];
    const insertEdit = allEdits[1];
    assert.ok(insertEdit, 'Should have an insert edit for the new function');
    // The extracted function should detect "hello world" is a string literal
    assert.ok(
      insertEdit.newText.includes('string'),
      `Return type should be 'string' for string literal — got: ${insertEdit.newText}`
    );
  });
});

describe('Extract Method — basic functionality', () => {
  it('should return null for empty selection', () => {
    const code = `int main() {
    int x = 1;
}`;
    const document = doc(code);
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 4 }, // empty selection
    };

    const result = getExtractMethodAction(document, 'file:///test.pike', range, code, undefined, {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: '',
      lineHashes: [],
      analysisState: { isStale: false, parseFailed: false },
    });
    assert.equal(result, null, 'Should return null for empty selection');
  });

  it('should produce a RefactorExtract action for valid selection', () => {
    const code = `int main() {
    int result = 1 + 2;
    return result;
}`;
    const document = doc(code);
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 19 },
    };

    const result = getExtractMethodAction(document, 'file:///test.pike', range, code, undefined, {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: '',
      lineHashes: [],
      analysisState: { isStale: false, parseFailed: false },
    });
    assert.ok(result, 'Should return an action');
    assert.equal(result!.kind, CodeActionKind.RefactorExtract);
    assert.ok(result!.edit, 'Should have an edit');
  });

  it('should include method parameters as variables', () => {
    const code = `int main() {
    int a = 5;
    int b = 10;
    int sum = a + b;
    return sum;
}`;
    const document = doc(code);
    // Select "int sum = a + b;" (line 3)
    const range = {
      start: { line: 3, character: 4 },
      end: { line: 3, character: 20 },
    };

    // Simulate method with parameters a and b
    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithMethod('main', ['a', 'b'])
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // Should include both a and b as parameters
    assert.ok(edit!.newText!.includes('a'), 'Should include parameter a');
    assert.ok(edit!.newText!.includes('b'), 'Should include parameter b');
  });

  it('should return null when context filter excludes refactor.extract', () => {
    const code = `int main() {
    int result = 1 + 2;
    return result;
}`;
    const document = doc(code);
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 19 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      [CodeActionKind.QuickFix], // excludes refactor.extract
      {
        version: 1,
        symbols: [],
        diagnostics: [],
        symbolPositions: new Map(),
        symbolNames: new Map(),
        contentHash: '',
        lineHashes: [],
        analysisState: { isStale: false, parseFailed: false },
      }
    );
    assert.equal(result, null, 'Should return null when filter excludes refactor');
  });
});

describe('Extract Method — token-based return detection edge cases', () => {
  it('should not detect return keyword inside a string literal', () => {
    const code = `int main() {
    string s = "return 42;";
    return s;
}`;
    const document = doc(code);
    // Select line 2 (return s;)
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 13 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('s')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // Should detect 'return s;' as the return statement with 's' as the value
    assert.ok(
      edit!.newText!.includes('s ='),
      `Should assign return value 's' — got: ${edit!.newText}`
    );
  });

  it('should not detect return keyword inside a line comment', () => {
    const code = `int main() {
    // return should happen here
    int x = 1;
    return x;
}`;
    const document = doc(code);
    // Select only line 2 (int x = 1;) — no return statement in this code
    const range = {
      start: { line: 2, character: 4 },
      end: { line: 2, character: 14 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('x')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // No return statement in the selection, so it should be a void call
    assert.ok(
      !edit!.newText!.includes('='),
      `Should be a void call (no return) — got: ${edit!.newText}`
    );
  });

  it('should handle return expression with semicolon inside string', () => {
    const code = `string main() {
    return "hello; world";
}`;
    const document = doc(code);
    // Select line 1 (return "hello; world";)
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 28 },
    };

    const result = getExtractMethodAction(document, 'file:///test.pike', range, code, undefined, {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: '',
      lineHashes: [],
      analysisState: { isStale: false, parseFailed: false },
    });
    assert.ok(result, 'Should return an action');

    // The inserted function should detect the string literal and infer 'string' type
    const allEdits = result!.edit!.changes!['file:///test.pike'] as { newText: string }[];
    const insertEdit = allEdits[1];
    assert.ok(insertEdit, 'Should have an insert edit for the new function');
    assert.ok(
      insertEdit.newText.includes('string'),
      `Return type should be 'string' for literal with semicolon — got: ${insertEdit.newText}`
    );
    // The return expression should include the full string, not truncated at the inner ';'
    assert.ok(
      insertEdit.newText.includes('"hello; world"'),
      `Return expression should preserve full string — got: ${insertEdit.newText}`
    );
  });

  it('should infer int type for numeric return expression', () => {
    const code = `int main() {
    return 42;
}`;
    const document = doc(code);
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 14 },
    };

    const result = getExtractMethodAction(document, 'file:///test.pike', range, code, undefined, {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: '',
      lineHashes: [],
      analysisState: { isStale: false, parseFailed: false },
    });
    assert.ok(result, 'Should return an action');

    const allEdits = result!.edit!.changes!['file:///test.pike'] as { newText: string }[];
    const insertEdit = allEdits[1];
    assert.ok(insertEdit, 'Should have an insert edit');
    assert.ok(
      insertEdit.newText.includes('int '),
      `Return type should be 'int' for integer literal — got: ${insertEdit.newText}`
    );
  });

  it('should infer float type for decimal literal return', () => {
    const code = `float main() {
    return 3.14;
}`;
    const document = doc(code);
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 1, character: 16 },
    };

    const result = getExtractMethodAction(document, 'file:///test.pike', range, code, undefined, {
      version: 1,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: '',
      lineHashes: [],
      analysisState: { isStale: false, parseFailed: false },
    });
    assert.ok(result, 'Should return an action');

    const allEdits = result!.edit!.changes!['file:///test.pike'] as { newText: string }[];
    const insertEdit = allEdits[1];
    assert.ok(insertEdit, 'Should have an insert edit');
    assert.ok(
      insertEdit.newText.includes('float '),
      `Return type should be 'float' for decimal literal — got: ${insertEdit.newText}`
    );
  });

  it('should not detect return inside a block comment', () => {
    const code = `int main() {
    /* return 42; */
    int x = 1;
}`;
    const document = doc(code);
    // Select lines 1-2 (the comment + assignment)
    const range = {
      start: { line: 1, character: 4 },
      end: { line: 2, character: 14 },
    };

    const result = getExtractMethodAction(
      document,
      'file:///test.pike',
      range,
      code,
      undefined,
      cachedWithVars('x')
    );
    assert.ok(result, 'Should return an action');

    const edit = replacementEdit(result) as { newText?: string } | null;
    assert.ok(edit, 'Should have a replacement edit');
    // No real return statement — should be a void call
    assert.ok(
      !edit!.newText!.includes('='),
      `Should be a void call (return is in comment) — got: ${edit!.newText}`
    );
  });
});
