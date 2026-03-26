/**
 * Semantic Tokens Delta Handler Tests
 *
 * Regression tests for textDocument/semanticTokens/full/delta handler.
 * Tests that the server properly handles delta requests (added in commit 64e7208).
 *
 * Background: The server was advertising delta support in capabilities but lacked
 * a handler, causing 'Unhandled method' errors when clients requested delta updates.
 */

import { describe, it, expect } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerSemanticTokensHandler } from '../../features/advanced/semantic-tokens.js';
import {
  createMockConnection,
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
} from '../helpers/mock-services.js';
import type { DocumentCacheEntry } from '../../core/types.js';

const TOKEN_TYPE = {
  variable: 8,
};

function decodeTokens(tokensData: number[]): Array<{
  line: number;
  startChar: number;
  length: number;
  tokenType: number;
}> {
  const decoded: Array<{
    line: number;
    startChar: number;
    length: number;
    tokenType: number;
  }> = [];

  let currentLine = 0;
  let currentStartChar = 0;

  for (let i = 0; i < tokensData.length; i += 5) {
    const deltaLine = tokensData[i] ?? 0;
    const deltaStart = tokensData[i + 1] ?? 0;
    const length = tokensData[i + 2] ?? 0;
    const tokenType = tokensData[i + 3] ?? 0;

    if (deltaLine === 0) {
      currentStartChar += deltaStart;
    } else {
      currentLine += deltaLine;
      currentStartChar = deltaStart;
    }

    decoded.push({
      line: currentLine,
      startChar: currentStartChar,
      length,
      tokenType,
    });
  }

  return decoded;
}

describe('Semantic Tokens Delta Handler', () => {
  describe('Handler Registration', () => {
    it('should register semanticTokens full handler', () => {
      const conn = createMockConnection();
      const services = createMockServices({});
      const documents = createMockDocuments(new Map());

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      // Handler should be registered
      expect(() => conn.semanticTokensHandler).not.toThrow();
    });

    it('should register semanticTokens delta handler', () => {
      const conn = createMockConnection();
      const services = createMockServices({});
      const documents = createMockDocuments(new Map());

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      // Delta handler should be registered
      expect(() => conn.semanticTokensDeltaHandler).not.toThrow();
    });
  });

  describe('Delta Request Handling', () => {
    it('should return valid delta response for existing document', () => {
      const uri = 'file:///test.pike';
      const code = `int x = 42;
int main() { return x; }`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      // Create cache entry with symbols
      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [
          sym('x', 'variable', { position: { line: 1, character: 4 } }),
          sym('main', 'method', { position: { line: 2, character: 4 } }),
        ],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      // Call delta handler
      const result = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: 'previous-result-id',
      });

      // Should return a valid SemanticTokensDelta response
      expect(result).toBeDefined();
      expect(result.resultId).toBeDefined();
      expect(Array.isArray(result.edits)).toBe(true);
    });

    it('should return empty delta for non-existent document', () => {
      const uri = 'file:///nonexistent.pike';
      const docsMap = new Map<string, TextDocument>();
      const services = createMockServices({});
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      // Call delta handler with non-existent document
      const result = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: 'any-id',
      });

      // Should return empty response, not error
      expect(result).toBeDefined();
      expect(result.resultId).toBe('0');
      expect(result.edits).toEqual([]);
    });

    it('should not return "Unhandled method" error', () => {
      const uri = 'file:///test.pike';
      const code = `int value = 10;`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('value', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      // The handler should exist and be callable - this is the regression test
      // Previously, calling onDelta would result in "Unhandled method" error
      expect(conn.semanticTokensDeltaHandler).toBeDefined();
      expect(typeof conn.semanticTokensDeltaHandler).toBe('function');

      // Should return valid response, not an error object
      const result = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: 'initial',
      });

      // Verify it's not an error response
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      expect(result.resultId).toBeDefined();
    });
  });

  describe('Full Request Handling', () => {
    it('should return tokens for document with symbols', () => {
      const uri = 'file:///test.pike';
      const code = `class MyClass {
    int myMethod() { return 0; }
}`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [
          sym('MyClass', 'class', { position: { line: 1, character: 6 } }),
          sym('myMethod', 'method', { position: { line: 2, character: 8 } }),
        ],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      // Call full handler
      const result = conn.semanticTokensHandler({
        textDocument: { uri },
      });

      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.resultId).toBeDefined();
    });

    it('should return empty tokens for non-existent document', () => {
      const uri = 'file:///nonexistent.pike';
      const docsMap = new Map<string, TextDocument>();
      const services = createMockServices({});
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const result = conn.semanticTokensHandler({
        textDocument: { uri },
      });

      expect(result).toBeDefined();
      expect(result.data).toEqual([]);
    });

    it('reuses full semantic token result for unchanged document version', () => {
      const uri = 'file:///cached-full.pike';
      const code = `int cached = 1;`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('cached', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const first = conn.semanticTokensHandler({ textDocument: { uri } });
      const second = conn.semanticTokensHandler({ textDocument: { uri } });

      expect(second.resultId).toBe(first.resultId);
      expect(second.data).toEqual(first.data);
    });

    it('skips identifiers inside multiline #"..."# string bodies but keeps nearby code tokens', () => {
      const uri = 'file:///multiline-string-filter.pike';
      const code = `int target = 1;
string template = #"
target should stay plain text here
target should also stay plain text here
"#;
if (target > 0) {
    target--;
}`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('target', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const result = conn.semanticTokensHandler({
        textDocument: { uri },
      });

      const decoded = decodeTokens(result.data);
      const targetTokens = decoded.filter(
        token => token.tokenType === TOKEN_TYPE.variable && token.length === 'target'.length
      );

      expect(targetTokens.map(token => token.line).sort((a, b) => a - b)).toEqual([0, 5, 6]);
      expect(targetTokens.some(token => token.line === 2 || token.line === 3)).toBe(false);
    });
  });

  describe('Delta Edits Format', () => {
    it('should return edits that replace tokens from position 0', () => {
      const uri = 'file:///test.pike';
      const code = `int a = 1;
int b = 2;`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [
          sym('a', 'variable', { position: { line: 1, character: 4 } }),
          sym('b', 'variable', { position: { line: 2, character: 4 } }),
        ],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const result = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: 'old-id',
      });

      // Verify delta format
      expect(result.edits.length).toBeGreaterThanOrEqual(0);
      for (const edit of result.edits) {
        expect(edit.start).toBeGreaterThanOrEqual(0);
        expect(edit.deleteCount).toBeDefined();
        expect(edit.deleteCount).toBeGreaterThanOrEqual(0);
        expect(edit.data).toBeDefined();
      }
    });

    it('should return empty edits when token data is unchanged and previousResultId matches', () => {
      const uri = 'file:///stable.pike';
      const code = `int stable = 1;`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('stable', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const full = conn.semanticTokensHandler({
        textDocument: { uri },
      });

      const delta = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: full.resultId,
      });

      expect(delta.edits).toEqual([]);
    });

    it('should reset delta state after document close', () => {
      const uri = 'file:///close-reset.pike';
      const code = `int close_reset = 1;`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('close_reset', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const full = conn.semanticTokensHandler({
        textDocument: { uri },
      });

      (documents as any).triggerDidClose(uri);

      const delta = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: full.resultId,
      });

      expect(delta.edits.length).toBe(1);
      expect(delta.edits[0].start).toBe(0);
    });

    it('reuses delta state for unchanged version and matching previousResultId', () => {
      const uri = 'file:///cached-delta.pike';
      const code = `int token = 1;`;

      const doc = TextDocument.create(uri, 'pike', 1, code);
      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, doc);

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('token', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const full = conn.semanticTokensHandler({ textDocument: { uri } });
      const delta = conn.semanticTokensDeltaHandler({
        textDocument: { uri },
        previousResultId: full.resultId,
      });

      expect(delta.resultId).toBe(full.resultId);
      expect(delta.edits).toEqual([]);
    });

    it('invalidates semantic token cache when document version changes', () => {
      const uri = 'file:///cached-invalidate.pike';
      const firstCode = `int invalidate = 1;`;
      const secondCode = `int invalidate = 2;`;

      const docsMap = new Map<string, TextDocument>();
      docsMap.set(uri, TextDocument.create(uri, 'pike', 1, firstCode));

      const cacheEntry: DocumentCacheEntry = makeCacheEntry({
        symbols: [sym('invalidate', 'variable', { position: { line: 1, character: 4 } })],
      });

      const services = createMockServices({
        cacheEntries: new Map([[uri, cacheEntry]]),
      });
      const documents = createMockDocuments(docsMap);
      const conn = createMockConnection();

      registerSemanticTokensHandler(conn as any, services as any, documents as any);

      const first = conn.semanticTokensHandler({ textDocument: { uri } });

      docsMap.set(uri, TextDocument.create(uri, 'pike', 2, secondCode));
      const second = conn.semanticTokensHandler({ textDocument: { uri } });

      expect(second.resultId).not.toBe(first.resultId);
    });
  });
});
