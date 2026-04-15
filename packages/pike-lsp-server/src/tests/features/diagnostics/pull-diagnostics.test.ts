import { DocumentCache } from '../../../services/document-cache.js';
import { registerDiagnosticsHandlers } from '../../../features/diagnostics/index.js';

const { describe, expect, it } = require('bun:test');

describe('pull diagnostics handlers', () => {
  function createHarness() {
    const requestHandlers = new Map<string, (params: unknown) => Promise<unknown>>();
    const documentCache = new DocumentCache();

    const services = {
      bridge: null,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
      documentCache,
      moduleContext: null,
      typeDatabase: {
        removeProgram: () => undefined,
      },
      workspaceIndex: {
        indexDocument: async () => undefined,
        removeDocument: () => undefined,
        getAllDocumentUris: () => ['file:///workspace/closed-file.pike'],
      },
      stdlibIndex: null,
      includeResolver: null,
      globalSettings: {
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 250,
      },
      includePaths: [],
      documentSnapshots: new Map<string, string>(),
    };

    const connection = {
      onRequest: (method: string, handler: (params: unknown) => Promise<unknown>) => {
        requestHandlers.set(method, handler);
      },
      onDidChangeConfiguration: () => undefined,
      onDidChangeTextDocument: () => undefined,
      sendDiagnostics: () => undefined,
      console: {
        warn: () => undefined,
        error: () => undefined,
      },
    };

    const documents = {
      all: () => [],
      onDidOpen: () => undefined,
      onDidChangeContent: () => undefined,
      onDidSave: () => undefined,
      onDidClose: () => undefined,
      get: () => undefined,
    };

    registerDiagnosticsHandlers(connection as any, services as any, documents as any);

    return {
      documentCache,
      getHandler: (method: string) => requestHandlers.get(method),
    };
  }

  it('returns full and unchanged document diagnostic reports', async () => {
    const harness = createHarness();
    const uri = 'file:///workspace/app.pike';
    harness.documentCache.set(uri, {
      version: 3,
      symbols: [],
      diagnostics: [
        {
          severity: 1,
          message: 'example error',
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 3 },
          },
          source: 'pike',
        },
      ],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'hash-v3',
    });

    const handler = harness.getHandler('textDocument/diagnostic');
    expect(handler).toBeDefined();

    const full = (await handler!({
      textDocument: { uri },
    })) as any;

    expect(full.kind).toBe('full');
    expect(full.items).toHaveLength(1);
    expect(full.resultId).toBe('3:hash-v3');

    const unchanged = (await handler!({
      textDocument: { uri },
      previousResultId: full.resultId,
    })) as any;

    expect(unchanged).toEqual({
      kind: 'unchanged',
      resultId: full.resultId,
    });
  });

  it('returns workspace diagnostics including closed files', async () => {
    const harness = createHarness();
    const openUri = 'file:///workspace/open-file.pike';
    harness.documentCache.set(openUri, {
      version: 2,
      symbols: [],
      diagnostics: [],
      symbolPositions: new Map(),
      symbolNames: new Map(),
      contentHash: 'hash-v2',
    });

    const handler = harness.getHandler('workspace/diagnostic');
    expect(handler).toBeDefined();

    const result = (await handler!({ previousResultIds: [] })) as any;
    const items = result.items as any[];

    const openItem = items.find(item => item.uri === openUri);
    const closedItem = items.find(item => item.uri === 'file:///workspace/closed-file.pike');

    expect(openItem).toBeDefined();
    expect(openItem.kind).toBe('full');
    expect(openItem.resultId).toBe('2:hash-v2');

    expect(closedItem).toBeDefined();
    expect(closedItem.kind).toBe('full');
    expect(closedItem.items).toEqual([]);
    expect(closedItem.resultId).toBe('0:diag-0');
  });
});
