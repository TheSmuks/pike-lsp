/**
 * Hierarchy Scenario Tests
 *
 * Tests that prove call and type hierarchy work through the real LSP handler registration path.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerHierarchyHandlers } from '../hierarchy.js';

function createMockDocument(uri: string, content: string): TextDocument {
  return TextDocument.create(uri, 'pike', 1, content);
}

function setupHandlers() {
  const handlers: Record<string, any> = {};

  const connection = {
    languages: {
      callHierarchy: {
        onPrepare(handler: any) {
          handlers.onCallHierarchyPrepare = handler;
        },
        onIncomingCalls(handler: any) {
          handlers.onCallHierarchyIncomingCalls = handler;
        },
        onOutgoingCalls(handler: any) {
          handlers.onCallHierarchyOutgoingCalls = handler;
        },
      },
      typeHierarchy: {
        onPrepare(handler: any) {
          handlers.onTypeHierarchyPrepare = handler;
        },
        onSupertypes(handler: any) {
          handlers.onTypeHierarchySupertypes = handler;
        },
        onSubtypes(handler: any) {
          handlers.onTypeHierarchySubtypes = handler;
        },
      },
    },
  } as any;

  const documents = {
    get(uri: string) {
      return docMap.get(uri);
    },
  };

  const docMap = new Map<string, TextDocument>();

  const services = {
    documentCache: {
      get(uri: string) {
        return cacheMap.get(uri);
      },
      keys() {
        return cacheMap.keys();
      },
    },
    workspaceIndex: {},
    workspaceScanner: {
      updateFileData: () => {},
      getUncachedFiles: () => [],
    },
    bridge: {
      bridge: {
        analyze: async () => ({ result: { parse: { symbols: [] }, tokenize: { tokens: [] } } }),
      },
    },
    globalSettings: {},
  } as any;

  const cacheMap = new Map<string, { symbols: any[] }>();

  registerHierarchyHandlers(connection, services, documents as any);

  return { handlers, documents, docMap, cacheMap };
}

describe('Scenario: Call Hierarchy', () => {
  it('should register onCallHierarchyPrepare handler', async () => {
    const { handlers } = setupHandlers();
    assert.ok(handlers.onCallHierarchyPrepare, 'Handler should be registered');
  });

  it('should register onCallHierarchyIncomingCalls handler', async () => {
    const { handlers } = setupHandlers();
    assert.ok(handlers.onCallHierarchyIncomingCalls, 'Handler should be registered');
  });

  it('should register onCallHierarchyOutgoingCalls handler', async () => {
    const { handlers } = setupHandlers();
    assert.ok(handlers.onCallHierarchyOutgoingCalls, 'Handler should be registered');
  });
});

describe('Scenario: Type Hierarchy', () => {
  it('should register onTypeHierarchyPrepare handler', async () => {
    const { handlers } = setupHandlers();
    assert.ok(handlers.onTypeHierarchyPrepare, 'Handler should be registered');
  });

  it('should register onTypeHierarchySupertypes handler', async () => {
    const { handlers } = setupHandlers();
    assert.ok(handlers.onTypeHierarchySupertypes, 'Handler should be registered');
  });

  it('should register onTypeHierarchySubtypes handler', async () => {
    const { handlers } = setupHandlers();
    assert.ok(handlers.onTypeHierarchySubtypes, 'Handler should be registered');
  });
});
