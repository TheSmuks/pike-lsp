/**
 * Scenario: call-hierarchy with incomplete position info
 *
 * #2075: Tests that call hierarchy handlers return safe results (null or [])
 * when PikeSymbol entries have missing or undefined position fields.
 *
 * Exercises handlers through the LSP connection interface (public API).
 * Does not read internal implementation logic.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type {
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerCallHierarchyHandlers } from '../features/call-hierarchy.js';
import {
  createMockBridge,
  createMockDocuments,
  createMockServices,
  makeCachedEntry,
} from '../tests/helpers/test-helpers.js';
import type { DocumentCacheEntry } from '../core/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

// ---------------------------------------------------------------------------
// Capturing mock connection
// ---------------------------------------------------------------------------

type PrepareHandler = (params: {
  textDocument: { uri: string };
  position: { line: number; character: number };
}) => Promise<CallHierarchyItem[] | null>;

type IncomingHandler = (params: {
  item: CallHierarchyItem;
}) => Promise<CallHierarchyIncomingCall[] | null>;

type OutgoingHandler = (params: {
  item: CallHierarchyItem;
}) => Promise<CallHierarchyOutgoingCall[] | null>;

function createCapturingConnection() {
  let prepareHandler: PrepareHandler | undefined;
  let incomingHandler: IncomingHandler | undefined;
  let outgoingHandler: OutgoingHandler | undefined;

  const connection = {
    languages: {
      callHierarchy: {
        onPrepare(handler: PrepareHandler) {
          prepareHandler = handler;
        },
        onIncomingCalls(handler: IncomingHandler) {
          incomingHandler = handler;
        },
        onOutgoingCalls(handler: OutgoingHandler) {
          outgoingHandler = handler;
        },
      },
    },
    console: { log() {}, warn() {}, error() {} },
  };

  return {
    connection: connection as unknown,
    get prepare() {
      return prepareHandler!;
    },
    get incoming() {
      return incomingHandler!;
    },
    get outgoing() {
      return outgoingHandler!;
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_URI = 'file:///test.pike';
const SOURCE_TEXT = 'int myFunc() { return 0; }\n';

function makeEntryWithSymbols(symbols: PikeSymbol[]): DocumentCacheEntry {
  const base = makeCachedEntry(SOURCE_TEXT);
  return { ...base, symbols };
}

function setup(symbols: PikeSymbol[]) {
  const conn = createCapturingConnection();
  const docs = createMockDocuments();
  const bridge = createMockBridge();
  const { services } = createMockServices(TEST_URI, bridge, makeEntryWithSymbols(symbols));

  const doc = TextDocument.create(TEST_URI, 'pike', 1, SOURCE_TEXT);
  docs.emitOpen(doc);

  registerCallHierarchyHandlers(
    conn.connection as Parameters<typeof registerCallHierarchyHandlers>[0],
    services,
    docs
  );

  return conn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Call Hierarchy — incomplete position info', () => {
  describe('onPrepare', () => {
    it('returns null when callable symbol has position.line undefined', async () => {
      const conn = setup([
        {
          name: 'myFunc',
          kind: 'method' as PikeSymbol['kind'],
          modifiers: [],
          position: { file: 'test.pike', line: undefined as unknown as number },
        },
      ]);

      const result = await conn.prepare({
        textDocument: { uri: TEST_URI },
        position: { line: 0, character: 5 },
      });

      assert.strictEqual(result, null);
    });

    it('returns null when callable symbol has position.column undefined', async () => {
      const conn = setup([
        {
          name: 'myFunc',
          kind: 'function' as PikeSymbol['kind'],
          modifiers: [],
          position: { file: 'test.pike', line: 1, column: undefined as unknown as number },
        },
      ]);

      const result = await conn.prepare({
        textDocument: { uri: TEST_URI },
        position: { line: 0, character: 5 },
      });

      assert.strictEqual(result, null);
    });

    it('returns null when callable symbol has position entirely missing', async () => {
      const conn = setup([
        {
          name: 'myFunc',
          kind: 'method' as PikeSymbol['kind'],
          modifiers: [],
          // position omitted
        },
      ]);

      const result = await conn.prepare({
        textDocument: { uri: TEST_URI },
        position: { line: 0, character: 5 },
      });

      assert.strictEqual(result, null);
    });

    it('returns null when callable symbol has empty position object', async () => {
      const conn = setup([
        {
          name: 'myFunc',
          kind: 'function' as PikeSymbol['kind'],
          modifiers: [],
          position: { file: '', line: undefined as unknown as number },
        } as PikeSymbol,
      ]);

      const result = await conn.prepare({
        textDocument: { uri: TEST_URI },
        position: { line: 0, character: 5 },
      });

      assert.strictEqual(result, null);
    });
  });

  describe('onIncomingCalls', () => {
    it('returns null when item has incomplete position data', async () => {
      const conn = setup([
        {
          name: 'myFunc',
          kind: 'method' as PikeSymbol['kind'],
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
        },
      ]);

      // Build an item with a degenerate range (line -1)
      const item: CallHierarchyItem = {
        name: 'myFunc',
        kind: 6, // SymbolKind.Method
        uri: TEST_URI,
        range: { start: { line: -1, character: 0 }, end: { line: -1, character: 0 } },
        selectionRange: { start: { line: -1, character: 0 }, end: { line: -1, character: 0 } },
      };

      const result = await conn.incoming({ item });

      // Should not throw; result is null or empty
      assert.ok(result === null || Array.isArray(result));
    });
  });

  describe('onOutgoingCalls', () => {
    it('returns null when item has incomplete position data', async () => {
      const conn = setup([
        {
          name: 'myFunc',
          kind: 'method' as PikeSymbol['kind'],
          modifiers: [],
          position: { file: 'test.pike', line: 1 },
        },
      ]);

      const item: CallHierarchyItem = {
        name: 'myFunc',
        kind: 6, // SymbolKind.Method
        uri: TEST_URI,
        range: { start: { line: -1, character: 0 }, end: { line: -1, character: 0 } },
        selectionRange: { start: { line: -1, character: 0 }, end: { line: -1, character: 0 } },
      };

      const result = await conn.outgoing({ item });

      // Should not throw; result is null or empty
      assert.ok(result === null || Array.isArray(result));
    });
  });
});
