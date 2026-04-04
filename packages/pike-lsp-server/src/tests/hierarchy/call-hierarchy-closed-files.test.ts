import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerHierarchyHandlers } from '../../features/hierarchy.js';
import {
  createMockDocuments,
  createMockServices,
  makeCacheEntry,
  sym,
  createMockWorkspaceScanner,
} from '../helpers/mock-services.js';

const { describe, it } = require('bun:test');

describe('call hierarchy across closed workspace files', () => {
  it('resolves outgoing callees from closed files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pike-call-hierarchy-closed-'));
    const file1Path = join(dir, 'file1.pike');
    const file2Path = join(dir, 'file2.pike');
    await writeFile(file1Path, 'void caller() {\n helper();\n}\n', 'utf-8');
    await writeFile(file2Path, 'void helper() {}\n', 'utf-8');

    const file1Uri = `file://${file1Path}`;
    const file2Uri = `file://${file2Path}`;
    const file1 = TextDocument.create(file1Uri, 'pike', 1, 'void caller() {\n helper();\n}\n');

    const documents = createMockDocuments(new Map([[file1Uri, file1]]));
    const cacheEntries = new Map([
      [
        file1Uri,
        makeCacheEntry({
          symbols: [
            sym('caller', 'method', { position: { file: 'file1.pike', line: 1, column: 1 } }),
          ],
          symbolPositions: new Map([['helper', [{ line: 1, character: 1 }]]]),
          callPositions: new Map([['helper', [{ line: 1, character: 1 }]]]),
        }),
      ],
    ]);

    const workspaceScanner = createMockWorkspaceScanner([
      { uri: file2Uri, content: 'void helper() {}\n' },
    ]);
    const bridge = {
      bridge: {
        analyze: async (_code: string, _features: string[], filePath: string) => {
          if (filePath.endsWith('file2.pike')) {
            return {
              result: {
                parse: {
                  symbols: [
                    {
                      name: 'helper',
                      kind: 'method',
                      modifiers: [],
                      position: { line: 1, column: 1 },
                    },
                  ],
                },
                tokenize: { tokens: [{ text: 'helper', type: 'identifier', line: 1, column: 6 }] },
              },
            };
          }
          return { result: { parse: { symbols: [] }, tokenize: { tokens: [] } } };
        },
      },
    };

    const services = createMockServices({ cacheEntries, workspaceScanner, bridge });

    let prepareHandler: any = null;
    let outgoingHandler: any = null;
    const connection = {
      languages: {
        callHierarchy: {
          onPrepare: (handler: any) => {
            prepareHandler = handler;
          },
          onOutgoingCalls: (handler: any) => {
            outgoingHandler = handler;
          },
          onIncomingCalls: () => undefined,
        },
        typeHierarchy: {
          onPrepare: () => undefined,
          onSupertypes: () => undefined,
          onSubtypes: () => undefined,
        },
      },
      console: { log: () => undefined },
      sendDiagnostics: () => undefined,
    };

    try {
      registerHierarchyHandlers(connection as any, services as any, documents as any);

      const prepared = await prepareHandler({
        textDocument: { uri: file1Uri },
        position: { line: 0, character: 6 },
      });
      const outgoing = await outgoingHandler({ item: prepared[0] });

      assert.equal(outgoing.length, 1);
      assert.equal(outgoing[0].to.name, 'helper');
      assert.equal(outgoing[0].to.uri, file2Uri);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('finds incoming callers from closed files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pike-call-hierarchy-incoming-'));
    const targetPath = join(dir, 'target.pike');
    const closedCallerPath = join(dir, 'closed-caller.pike');
    await writeFile(targetPath, 'void helper() {}\n', 'utf-8');
    await writeFile(
      closedCallerPath,
      'extern void helper();\nvoid caller() {\n helper();\n}\n',
      'utf-8'
    );

    const targetUri = `file://${targetPath}`;
    const closedCallerUri = `file://${closedCallerPath}`;
    const targetDoc = TextDocument.create(targetUri, 'pike', 1, 'void helper() {}\n');
    const documents = createMockDocuments(new Map([[targetUri, targetDoc]]));

    const cacheEntries = new Map([
      [
        targetUri,
        makeCacheEntry({
          symbols: [
            sym('helper', 'method', { position: { file: 'target.pike', line: 1, column: 1 } }),
          ],
          symbolPositions: new Map([['helper', [{ line: 0, character: 5 }]]]),
          callPositions: new Map(),
        }),
      ],
    ]);

    const workspaceScanner = createMockWorkspaceScanner([
      { uri: closedCallerUri, content: 'void caller() {\n helper();\n}\n' },
    ]);

    const bridge = {
      bridge: {
        analyze: async (_code: string, _features: string[], filePath: string) => {
          if (filePath.endsWith('closed-caller.pike')) {
            return {
              result: {
                parse: {
                  symbols: [
                    {
                      name: 'helper',
                      kind: 'method',
                      modifiers: [],
                      position: { line: 1, column: 1 },
                    },
                    {
                      name: 'caller',
                      kind: 'method',
                      modifiers: [],
                      position: { line: 2, column: 1 },
                    },
                  ],
                },
                tokenize: {
                  tokens: [
                    { text: 'helper', type: 'identifier', line: 1, column: 12 },
                    { text: 'caller', type: 'identifier', line: 2, column: 6 },
                    { text: 'helper', type: 'identifier', line: 3, column: 4 },
                    { text: '(', type: 'punctuation', line: 3, column: 10 },
                    { text: ')', type: 'punctuation', line: 3, column: 11 },
                  ],
                },
              },
            };
          }
          return { result: { parse: { symbols: [] }, tokenize: { tokens: [] } } };
        },
      },
    };

    const services = createMockServices({ cacheEntries, workspaceScanner, bridge });

    let prepareHandler: any = null;
    let incomingHandler: any = null;
    const connection = {
      languages: {
        callHierarchy: {
          onPrepare: (handler: any) => {
            prepareHandler = handler;
          },
          onOutgoingCalls: () => undefined,
          onIncomingCalls: (handler: any) => {
            incomingHandler = handler;
          },
        },
        typeHierarchy: {
          onPrepare: () => undefined,
          onSupertypes: () => undefined,
          onSubtypes: () => undefined,
        },
      },
      console: { log: () => undefined },
      sendDiagnostics: () => undefined,
    };

    try {
      registerHierarchyHandlers(connection as any, services as any, documents as any);

      const prepared = await prepareHandler({
        textDocument: { uri: targetUri },
        position: { line: 0, character: 6 },
      });
      const incoming = await incomingHandler({ item: prepared[0] });

      assert.equal(incoming.length, 1);
      assert.equal(incoming[0].from.name, 'caller');
      assert.equal(incoming[0].from.uri, closedCallerUri);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
