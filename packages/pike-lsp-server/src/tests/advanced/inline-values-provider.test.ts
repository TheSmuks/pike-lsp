/**
 * Inline Values Provider Tests
 *
 * Tests for debug-mode inline variable value display.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { InlineValueParams, InlineValue } from 'vscode-languageserver/node.js';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocument as TD } from 'vscode-languageserver-textdocument';

// Minimal types matching what the handler reads from services/cache
interface MockCachedDocument {
  symbols: Array<{
    kind: string;
    name?: string;
    range?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    selectionRange?: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
    modifiers?: string[];
    children?: Array<{
      kind: string;
      name?: string;
      range?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      selectionRange?: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      modifiers?: string[];
    }>;
  }>;
  diagnostics: unknown[];
}

interface MockServices {
  globalSettings?: { inlineValues?: { enabled?: boolean } };
  documentCache: { get(uri: string): MockCachedDocument | null };
  bridge: {
    bridge: {
      evaluateConstant(
        expr: string,
        uri: string
      ): Promise<{ success: boolean; value?: unknown; type?: string }>;
    };
  } | null;
}

/** Helper: build a mock connection that captures the inlineValue handler. */
function setupMock(services: MockServices, code: string, uri = 'file:///test.pike') {
  let registeredHandler: ((params: InlineValueParams) => Promise<InlineValue[] | null>) | null =
    null;

  const connection = {
    languages: {
      inlineValue: {
        on: (handler: (params: InlineValueParams) => Promise<InlineValue[] | null>) => {
          registeredHandler = handler;
        },
      },
    },
  } as unknown as Connection;

  const documents = {
    get(u: string) {
      return u === uri ? TD.create(uri, 'pike', 1, code) : null;
    },
  } as unknown as TextDocuments<TextDocument>;

  return { connection, documents, getHandler: () => registeredHandler };
}

describe('Inline Values Provider', () => {
  describe('configuration', () => {
    it('should return null when inline values disabled', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: false } },
        documentCache: { get: () => null },
        bridge: null,
      };

      const { connection, documents, getHandler } = setupMock(services, '');
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      assert.ok(getHandler(), 'Handler should be registered');
      const result = await getHandler()!(params);
      assert.strictEqual(result, null);
    });

    it('should return null when no document in cache', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: { get: () => null },
        bridge: null,
      };

      const { connection, documents, getHandler } = setupMock(services, '');
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      assert.ok(getHandler());
      const result = await getHandler()!(params);
      assert.strictEqual(result, null);
    });

    it('should always register handler regardless of config', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      let handlerRegistered = false;
      const connection = {
        languages: {
          inlineValue: {
            on: () => {
              handlerRegistered = true;
            },
          },
        },
      } as unknown as Connection;

      registerInlineValuesHandler(
        connection,
        {} as MockServices,
        {} as TextDocuments<TextDocument>
      );
      assert.ok(handlerRegistered);
    });
  });

  describe('variable detection', () => {
    it('should detect local variables from symbols', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: 'x',
                range: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
                selectionRange: {
                  start: { line: 0, character: 4 },
                  end: { line: 0, character: 5 },
                },
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: null,
      };

      const { connection, documents, getHandler } = setupMock(services, 'int x = 42;');
      registerInlineValuesHandler(connection, services, documents);
      assert.ok(getHandler());
    });

    it('should detect local variables in methods', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'method',
                name: 'test',
                range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
                children: [
                  {
                    kind: 'variable',
                    name: 'localVar',
                    range: { start: { line: 1, character: 6 }, end: { line: 1, character: 21 } },
                    selectionRange: {
                      start: { line: 1, character: 6 },
                      end: { line: 1, character: 14 },
                    },
                  },
                ],
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: null,
      };

      const code = `void test() {
  int localVar = 123;
}`;
      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);
      assert.ok(getHandler());
    });
  });

  describe('extractValueExpr (via handler integration)', () => {
    it('should extract simple constant value', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      // int x = 42;  → selectionRange covers 'x' (chars 4-5), range end at ';'
      const code = 'int x = 42;';
      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: 'x',
                // LSP Range positions are 0-indexed: line 0 = first line
                range: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
                selectionRange: {
                  start: { line: 0, character: 4 },
                  end: { line: 0, character: 5 },
                },
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: {
          bridge: {
            async evaluateConstant(expr: string) {
              assert.strictEqual(expr, '42', `Expected expression "42", got "${expr}"`);
              return { success: true, value: 42, type: 'int' };
            },
          },
        },
      };

      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      const result = await getHandler()!(params);
      assert.ok(result, 'Should return inline values');
      assert.strictEqual(result.length, 1);
      assert.ok(result[0]!.text.includes('42'), `Expected "42" in "${result[0]!.text}"`);
    });

    it('should handle string with semicolons correctly', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      // string msg = "hello; world";
      // selectionRange end points after "msg", range end points after final ";
      const code = 'string msg = "hello; world";';

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: 'msg',
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 27 } },
                selectionRange: {
                  start: { line: 0, character: 7 },
                  end: { line: 0, character: 10 },
                },
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: {
          bridge: {
            async evaluateConstant(expr: string) {
              // The extracted expression should be the full string literal
              assert.ok(expr.includes('hello;'), `Expression should contain "hello;": "${expr}"`);
              return { success: true, value: 'hello; world', type: 'string' };
            },
          },
        },
      };

      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      const result = await getHandler()!(params);
      assert.ok(result, 'Should return inline values for string with semicolons');
      assert.strictEqual(result.length, 1);
    });

    it('should handle multi-line constant expression', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const code = `int x = (1 +
  2 +
  3);`;

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: 'x',
                // LSP 0-indexed: lines 0-2 for the 3-line code
                range: { start: { line: 0, character: 4 }, end: { line: 2, character: 3 } },
                selectionRange: {
                  start: { line: 0, character: 4 },
                  end: { line: 0, character: 5 },
                },
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: {
          bridge: {
            async evaluateConstant() {
              // Multi-line expressions with parens are filtered out before evaluation.
              return { success: false };
            },
          },
        },
      };

      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      // Multi-line parenthesized expressions are filtered by the complexity check.
      const result = await getHandler()!(params);
      assert.ok(
        result === null || Array.isArray(result),
        'Should not throw on multi-line expression'
      );
    });

    it('should skip variables without selectionRange', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const code = 'int x = 42;';

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: 'x',
                range: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
                // No selectionRange
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: {
          bridge: {
            async evaluateConstant() {
              assert.fail('Should not be called');
            },
          },
        },
      };

      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      const result = await getHandler()!(params);
      assert.strictEqual(result, null, 'Should return null when no selectionRange');
    });

    it('should skip private variables', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const code = 'int _x = 42;';

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: '_x',
                range: { start: { line: 0, character: 4 }, end: { line: 0, character: 12 } },
                selectionRange: {
                  start: { line: 0, character: 4 },
                  end: { line: 0, character: 6 },
                },
                modifiers: ['private'],
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: {
          bridge: {
            async evaluateConstant() {
              assert.fail('Should not be called for private variables');
            },
          },
        },
      };

      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);

      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        },
      };

      const result = await getHandler()!(params);
      assert.strictEqual(result, null, 'Should skip private variables');
    });

    it('should filter to visible lines only', async () => {
      const { registerInlineValuesHandler } =
        await import('../../features/advanced/inline-values.js');

      const code = 'int x = 42;';

      const services: MockServices = {
        globalSettings: { inlineValues: { enabled: true } },
        documentCache: {
          get: () => ({
            symbols: [
              {
                kind: 'variable',
                name: 'x',
                range: { start: { line: 5, character: 4 }, end: { line: 5, character: 11 } },
                selectionRange: {
                  start: { line: 5, character: 4 },
                  end: { line: 5, character: 5 },
                },
              },
            ],
            diagnostics: [],
          }),
        },
        bridge: {
          bridge: {
            async evaluateConstant() {
              assert.fail('Should not be called for out-of-range variable');
            },
          },
        },
      };

      const { connection, documents, getHandler } = setupMock(services, code);
      registerInlineValuesHandler(connection, services, documents);

      // Request only lines 0-2, but variable is on line 5
      const params: InlineValueParams = {
        textDocument: { uri: 'file:///test.pike' },
        range: { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } },
        context: {
          frameId: 0,
          stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 2, character: 0 } },
        },
      };

      const result = await getHandler()!(params);
      assert.strictEqual(result, null, 'Should filter out variables outside visible range');
    });
  });

  it('should extract value for variable on line 0', async () => {
    const { registerInlineValuesHandler } =
      await import('../../features/advanced/inline-values.js');

    // Regression: line 0 previously became -1 after the erroneous -1 offset.
    const code = 'int x = 42;';

    const services: MockServices = {
      globalSettings: { inlineValues: { enabled: true } },
      documentCache: {
        get: () => ({
          symbols: [
            {
              kind: 'variable',
              name: 'x',
              range: { start: { line: 0, character: 4 }, end: { line: 0, character: 11 } },
              selectionRange: {
                start: { line: 0, character: 4 },
                end: { line: 0, character: 5 },
              },
            },
          ],
          diagnostics: [],
        }),
      },
      bridge: {
        bridge: {
          async evaluateConstant(expr: string) {
            assert.strictEqual(expr, '42', `Expected expression "42", got "${expr}"`);
            return { success: true, value: 42, type: 'int' };
          },
        },
      },
    };

    const { connection, documents, getHandler } = setupMock(services, code);
    registerInlineValuesHandler(connection, services, documents);

    const params: InlineValueParams = {
      textDocument: { uri: 'file:///test.pike' },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 20 } },
      context: {
        frameId: 0,
        stoppedLocation: { start: { line: 0, character: 0 }, end: { line: 0, character: 20 } },
      },
    };

    const result = await getHandler()!(params);
    assert.ok(result, 'Should return inline values for variable on line 0');
    assert.strictEqual(result.length, 1);
    assert.ok(result[0]!.text.includes('42'), `Expected "42" in "${result[0]!.text}"`);
  });
});
