import { afterEach, describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { registerInlayHintsHandler } from '../../features/advanced/inlay-hints.js';
import { registerInlineValuesHandler } from '../../features/advanced/inline-values.js';
import { registerDocumentLinksHandler } from '../../features/advanced/document-links.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('Runtime settings propagation', () => {
  it('uses latest inlay hint settings from services', async () => {
    let inlayHandler: ((params: { textDocument: { uri: string } }) => Promise<unknown>) | null =
      null;

    const connection = {
      languages: {
        inlayHint: {
          on(handler: (params: { textDocument: { uri: string } }) => Promise<unknown>) {
            inlayHandler = handler;
          },
          resolve: undefined,
        },
      },
    };

    const uri = 'file:///tmp/inlay-config-test.pike';
    const document = TextDocument.create(uri, 'pike', 1, 'foo(1);');

    const services = {
      bridge: {
        isRunning: () => true,
        tokenize: async (_text: string) => [
          { text: 'foo', line: 1, character: 0, file: 'test.pike' },
          { text: '(', line: 1, character: 3, file: 'test.pike' },
          { text: '1', line: 1, character: 4, file: 'test.pike' },
          { text: ')', line: 1, character: 5, file: 'test.pike' },
        ],
      },
      documentCache: {
        get: () => ({
          symbols: [{ name: 'foo', kind: 'method', argNames: ['value'], argTypes: ['int'] }],
        }),
      },
      globalSettings: {
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 250,
        inlayHints: { enabled: false, parameterNames: true, typeHints: false },
      },
    };

    const documents = {
      get: () => document,
    };

    registerInlayHintsHandler(connection as any, services as any, documents as any);
    expect(inlayHandler).not.toBeNull();

    const disabledResult = await inlayHandler!({ textDocument: { uri } });
    expect(disabledResult).toBeNull();

    services.globalSettings = {
      ...services.globalSettings,
      inlayHints: { enabled: true, parameterNames: true, typeHints: false },
    };

    const enabledResult = (await inlayHandler!({ textDocument: { uri } })) as Array<{
      label: string;
    }>;
    expect(enabledResult).toBeArray();
    expect(enabledResult.length).toBe(1);
    expect(enabledResult[0]?.label).toBe('value:');
  });

  it('uses latest inline value settings from services', async () => {
    let inlineHandler:
      | ((params: {
          textDocument: { uri: string };
          range: { start: { line: number }; end: { line: number } };
        }) => Promise<unknown>)
      | null = null;

    const connection = {
      languages: {
        inlineValue: {
          on(
            handler: (params: {
              textDocument: { uri: string };
              range: { start: { line: number }; end: { line: number } };
            }) => Promise<unknown>
          ) {
            inlineHandler = handler;
          },
        },
      },
    };

    const uri = 'file:///tmp/inline-config-test.pike';
    const document = TextDocument.create(uri, 'pike', 1, 'int x = 42;');

    const services = {
      bridge: {
        bridge: {
          evaluateConstant: async () => ({ success: true, value: 42, type: 'int' }),
        },
      },
      documentCache: {
        get: () => ({
          symbols: [
            {
              name: 'x',
              kind: 'variable',
              range: {
                start: { line: 1, character: 0 },
                end: { line: 1, character: 11 },
              },
              selectionRange: {
                start: { line: 1, character: 4 },
                end: { line: 1, character: 5 },
              },
              modifiers: [],
            },
          ],
        }),
      },
      globalSettings: {
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 250,
        inlineValues: { enabled: false },
      },
    };

    const documents = {
      get: () => document,
    };

    registerInlineValuesHandler(connection as any, services as any, documents as any);
    expect(inlineHandler).not.toBeNull();

    const params = {
      textDocument: { uri },
      range: { start: { line: 0 }, end: { line: 3 } },
    };

    const disabledResult = await inlineHandler!(params as any);
    expect(disabledResult).toBeNull();

    services.globalSettings = {
      ...services.globalSettings,
      inlineValues: { enabled: true },
    };

    const enabledResult = (await inlineHandler!(params as any)) as Array<{ text: string }>;
    expect(enabledResult).toBeArray();
    expect(enabledResult.length).toBe(1);
    expect(enabledResult[0]?.text).toContain('42');
  });

  it('uses latest include paths from services for document links', async () => {
    let linksHandler: ((params: { textDocument: { uri: string } }) => Promise<unknown[]>) | null =
      null;

    const connection = {
      onDocumentLinks(handler: (params: { textDocument: { uri: string } }) => Promise<unknown[]>) {
        linksHandler = handler;
      },
      onDocumentLinkResolve: () => {},
      console: {
        log: () => {},
      },
    };

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pike-lsp-links-'));
    tmpDirs.push(root);
    const includeDir = path.join(root, 'includes');
    fs.mkdirSync(includeDir, { recursive: true });
    fs.writeFileSync(path.join(includeDir, 'foo.h'), 'int x;\n', 'utf8');

    const uri = `file://${path.join(root, 'main.pike')}`;
    const document = TextDocument.create(uri, 'pike', 1, '#include "foo.h"\n');

    const services = {
      documentCache: {
        keys: () => [][Symbol.iterator](),
        get: () => ({
          symbols: [
            {
              kind: 'include',
              name: 'foo.h',
              classname: 'foo.h',
              position: { line: 1, character: 10 },
            },
          ],
        }),
      },
      includePaths: [] as string[],
    };

    const documents = {
      get: () => document,
    };

    registerDocumentLinksHandler(connection as any, services as any, documents as any);
    expect(linksHandler).not.toBeNull();

    const withoutIncludePath = await linksHandler!({ textDocument: { uri } });
    expect(withoutIncludePath).toEqual([]);

    services.includePaths = [includeDir];

    const withIncludePath = (await linksHandler!({ textDocument: { uri } })) as Array<{
      target: string;
    }>;
    expect(withIncludePath.length).toBe(1);
    expect(withIncludePath[0]?.target).toContain('foo.h');
  });
});
