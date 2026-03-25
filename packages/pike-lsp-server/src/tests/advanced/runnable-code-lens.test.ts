import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerCodeLensHandlers } from '../../features/advanced/code-lens.js';

const { describe, expect, it } = require('bun:test');

describe('runnable code lens', () => {
  function setup(showCodeLens = true) {
    let onCodeLensHandler: ((params: any) => any) | null = null;
    let onCodeLensResolveHandler: ((lens: any) => any) | null = null;

    const uri = 'file:///workspace/test.pike';
    const doc = TextDocument.create(
      uri,
      'pike',
      1,
      'int main() { return 0; }\nvoid test_example() {}\n'
    );

    const cache = {
      version: 1,
      symbols: [
        {
          name: 'main',
          kind: 'method',
          position: { line: 1, column: 5 },
        },
        {
          name: 'test_example',
          kind: 'method',
          position: { line: 2, column: 6 },
        },
      ],
      symbolPositions: new Map<string, Array<{ line: number; character: number }>>([
        ['main', [{ line: 0, character: 4 }]],
        ['test_example', [{ line: 1, character: 5 }]],
      ]),
    };

    const connection = {
      onCodeLens: (handler: (params: any) => any) => {
        onCodeLensHandler = handler;
      },
      onCodeLensResolve: (handler: (lens: any) => any) => {
        onCodeLensResolveHandler = handler;
      },
      console: {
        log: () => undefined,
      },
    };

    const services = {
      documentCache: {
        get: (targetUri: string) => (targetUri === uri ? cache : undefined),
        entries: () => [[uri, cache]][Symbol.iterator](),
      },
      globalSettings: {
        pikePath: 'pike',
        maxNumberOfProblems: 100,
        diagnosticDelay: 250,
        runnable: {
          showCodeLens,
          testPattern: '^test_',
        },
      },
    };

    const documents = {
      get: (targetUri: string) => (targetUri === uri ? doc : undefined),
    };

    registerCodeLensHandlers(connection as any, services as any, documents as any);

    return {
      uri,
      onCodeLensHandler,
      onCodeLensResolveHandler,
    };
  }

  it('adds runnable lenses for main and test functions', () => {
    const harness = setup(true);
    expect(harness.onCodeLensHandler).toBeTruthy();

    const lenses = harness.onCodeLensHandler!({ textDocument: { uri: harness.uri } }) as any[];
    const runnableKinds = lenses
      .map(lens => lens.data?.lensType)
      .filter((value: unknown) => value === 'run-file' || value === 'run-test');

    expect(runnableKinds).toContain('run-file');
    expect(runnableKinds).toContain('run-test');
  });

  it('resolves runnable commands to run file and run test', () => {
    const harness = setup(true);
    expect(harness.onCodeLensResolveHandler).toBeTruthy();

    const runFileResolved = harness.onCodeLensResolveHandler!({
      data: {
        uri: harness.uri,
        symbolName: 'main',
        kind: 'method',
        position: { line: 0, character: 4 },
        lensType: 'run-file',
      },
    });

    const runTestResolved = harness.onCodeLensResolveHandler!({
      data: {
        uri: harness.uri,
        symbolName: 'test_example',
        kind: 'method',
        position: { line: 1, character: 5 },
        lensType: 'run-test',
      },
    });

    expect(runFileResolved.command?.command).toBe('pike.lsp.runFile');
    expect(runFileResolved.command?.title).toBe('▶ Run');
    expect(runTestResolved.command?.command).toBe('pike.lsp.runTest');
    expect(runTestResolved.command?.title).toBe('▶ Run Test');
  });

  it('does not add runnable lenses when disabled by configuration', () => {
    const harness = setup(false);
    const lenses = harness.onCodeLensHandler!({ textDocument: { uri: harness.uri } }) as any[];
    const runnableKinds = lenses
      .map(lens => lens.data?.lensType)
      .filter((value: unknown) => value === 'run-file' || value === 'run-test');

    expect(runnableKinds).toEqual([]);
  });
});
