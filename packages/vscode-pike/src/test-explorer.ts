import * as vscode from 'vscode';

interface PikeTestExplorerOptions {
  context: vscode.ExtensionContext;
  outputChannel: vscode.OutputChannel;
  runWithPike: (uri: string, symbolName?: string, isTest?: boolean) => Promise<number>;
}

interface TestingApi {
  createTestController(
    id: string,
    label: string
  ): {
    resolveHandler?: (item: unknown) => Promise<void>;
    items: {
      add(item: unknown): void;
      delete(id: string): void;
      get(id: string): unknown;
      forEach(callback: (item: unknown) => void): void;
    };
    createRunProfile(
      label: string,
      kind: number,
      runHandler: (
        request: { include?: unknown[]; exclude?: unknown[] },
        token: vscode.CancellationToken
      ) => Promise<void>,
      isDefault?: boolean
    ): vscode.Disposable;
    createTestItem(
      id: string,
      label: string,
      uri?: vscode.Uri
    ): {
      id: string;
      label: string;
      uri?: vscode.Uri;
      range?: vscode.Range;
      canResolveChildren?: boolean;
      description?: string;
      children: {
        add(item: unknown): void;
        delete(id: string): void;
        get(id: string): unknown;
        forEach(callback: (item: unknown) => void): void;
        size: number;
      };
    };
    createTestRun(request: { include?: unknown[]; exclude?: unknown[] }): {
      enqueued(item: unknown): void;
      started(item: unknown): void;
      skipped(item: unknown): void;
      passed(item: unknown, duration?: number): void;
      failed(item: unknown, message: unknown, duration?: number): void;
      errored(item: unknown, message: unknown, duration?: number): void;
      appendOutput(output: string, location?: vscode.Location, item?: unknown): void;
      end(): void;
    };
    dispose(): void;
  };
  TestMessage: new (message: string) => unknown;
}

interface TestNode {
  id: string;
  label: string;
  uri?: vscode.Uri;
  range?: vscode.Range;
  canResolveChildren?: boolean;
  description?: string;
  children: {
    add(item: TestNode): void;
    delete(id: string): void;
    get(id: string): TestNode | undefined;
    forEach(callback: (item: TestNode) => void): void;
    size: number;
  };
}

interface TestMeta {
  uri: string;
  symbolName?: string;
}

function getTestingApi(): TestingApi {
  // vscode.tests is the stable testing API (VS Code 1.88+)
  const raw = vscode as unknown as Record<string, unknown>;
  const api = raw['tests'] as TestingApi | undefined;
  if (!api) {
    throw new Error('VS Code testing API is unavailable');
  }
  return api;
}

export function registerPikeTestExplorer(options: PikeTestExplorerOptions): vscode.Disposable {
  const { context, outputChannel, runWithPike } = options;
  const testing = getTestingApi();
  let session: vscode.Disposable | undefined;

  const start = async (): Promise<void> => {
    const enabled = vscode.workspace
      .getConfiguration('pike')
      .get<boolean>('testExplorer.enable', true);
    if (!enabled) {
      session?.dispose();
      session = undefined;
      return;
    }

    if (!session) {
      session = await createSession(context, outputChannel, runWithPike, testing);
    }
  };

  void start();

  const config = vscode.workspace.onDidChangeConfiguration(event => {
    if (!event.affectsConfiguration('pike.testExplorer.enable')) {
      return;
    }
    session?.dispose();
    session = undefined;
    void start();
  });

  return {
    dispose() {
      config.dispose();
      session?.dispose();
      session = undefined;
    },
  };
}

async function createSession(
  context: vscode.ExtensionContext,
  outputChannel: vscode.OutputChannel,
  runWithPike: (uri: string, symbolName?: string, isTest?: boolean) => Promise<number>,
  testing: TestingApi
): Promise<vscode.Disposable> {
  const controller = testing.createTestController('pike-test-explorer', 'Pike Tests');
  const metadata = new Map<string, TestMeta>();

  const refreshDocument = async (document: vscode.TextDocument): Promise<void> => {
    if (document.languageId !== 'pike') {
      return;
    }

    const fileId = document.uri.toString();
    const tests = await discoverTests(document.uri);
    if (tests.length === 0) {
      controller.items.delete(fileId);
      removeMetadata(metadata, fileId);
      return;
    }

    const fileItem =
      (controller.items.get(fileId) as TestNode | undefined) ??
      (controller.createTestItem(
        fileId,
        document.uri.path.split('/').pop() ?? fileId,
        document.uri
      ) as TestNode);

    fileItem.canResolveChildren = false;
    fileItem.description = document.uri.fsPath;

    const stale = new Set<string>();
    fileItem.children.forEach((item: TestNode) => stale.add(item.id));

    for (const test of tests) {
      const testId = `${fileId}::${test.name}`;
      const child =
        fileItem.children.get(testId) ??
        (controller.createTestItem(testId, test.name, document.uri) as TestNode);
      child.range = test.range;
      fileItem.children.add(child);
      stale.delete(testId);
      metadata.set(testId, { uri: fileId, symbolName: test.name });
    }

    for (const staleId of stale) {
      fileItem.children.delete(staleId);
      metadata.delete(staleId);
    }

    metadata.set(fileId, { uri: fileId });
    controller.items.add(fileItem);
  };

  const refreshUri = async (uri: vscode.Uri): Promise<void> => {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      await refreshDocument(document);
    } catch {
      const fileId = uri.toString();
      controller.items.delete(fileId);
      removeMetadata(metadata, fileId);
    }
  };

  controller.resolveHandler = async (item: unknown) => {
    if (!item) {
      const files = await vscode.workspace.findFiles('**/*.pike', '**/{.git,node_modules,dist}/**');
      await Promise.all(files.map(refreshUri));
      return;
    }

    const node = item as { uri?: vscode.Uri };
    if (node.uri) {
      await refreshUri(node.uri);
    }
  };

  // TestRunProfileKind.Run = 1 in VS Code's stable API.
  const TestRunProfileKind = (vscode as unknown as Record<string, unknown>)['TestRunProfileKind'] as { Run: number } | undefined;
  const profile = controller.createRunProfile(
    'Run',
    TestRunProfileKind?.Run ?? 1,
    async (request, token) => {
      const run = controller.createTestRun(request);
      const showOutput = vscode.workspace
        .getConfiguration('pike')
        .get<boolean>('testExplorer.showOutput', true);

      const targets: Array<{ item: TestNode; uri: string; symbolName?: string }> = [];
      const include = request.include ?? collectTopLevel(controller);
      const excluded = new Set((request.exclude ?? []).map(item => (item as TestNode).id));

      const collect = (item: TestNode): void => {
        if (excluded.has(item.id)) {
          return;
        }
        if (item.children.size > 0) {
          item.children.forEach(collect);
          return;
        }
        const meta = metadata.get(item.id);
        if (!meta) {
          return;
        }
        if (meta.symbolName !== undefined) {
          targets.push({ item, uri: meta.uri, symbolName: meta.symbolName });
        } else {
          targets.push({ item, uri: meta.uri });
        }
      };

      for (const item of include as TestNode[]) {
        collect(item);
      }

      try {
        for (const target of targets) {
          if (token.isCancellationRequested) {
            run.skipped(target.item);
            continue;
          }

          run.enqueued(target.item);
          run.started(target.item);
          if (showOutput) {
            run.appendOutput(`Running ${target.item.label}\r\n`, undefined, target.item);
          }

          const started = Date.now();
          try {
            const code = await runWithPike(target.uri, target.symbolName, true);
            const duration = Date.now() - started;
            if (code === 0) {
              run.passed(target.item, duration);
              if (showOutput) {
                run.appendOutput(`PASS ${target.item.label}\r\n`, undefined, target.item);
              }
            } else {
              run.failed(
                target.item,
                new testing.TestMessage(`Pike test exited with code ${code}`),
                duration
              );
              if (showOutput) {
                run.appendOutput(
                  `FAIL ${target.item.label} (exit code ${code})\r\n`,
                  undefined,
                  target.item
                );
              }
              outputChannel.show(true);
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            run.errored(target.item, new testing.TestMessage(message), Date.now() - started);
            if (showOutput) {
              run.appendOutput(
                `ERROR ${target.item.label}: ${message}\r\n`,
                undefined,
                target.item
              );
            }
            outputChannel.show(true);
          }
        }
      } finally {
        run.end();
      }
    },
    true
  );

  const open = vscode.workspace.onDidOpenTextDocument(refreshDocument);
  const save = vscode.workspace.onDidSaveTextDocument(refreshDocument);
  const change = vscode.workspace.onDidChangeTextDocument(event => {
    void refreshDocument(event.document);
  });

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.pike');
  const create = watcher.onDidCreate(uri => {
    void refreshUri(uri);
  });
  const update = watcher.onDidChange(uri => {
    void refreshUri(uri);
  });
  const del = watcher.onDidDelete(uri => {
    const fileId = uri.toString();
    controller.items.delete(fileId);
    removeMetadata(metadata, fileId);
  });

  context.subscriptions.push(controller, profile, open, save, change, watcher, create, update, del);

  return {
    dispose() {
      controller.dispose();
      profile.dispose();
      open.dispose();
      save.dispose();
      change.dispose();
      watcher.dispose();
      create.dispose();
      update.dispose();
      del.dispose();
      metadata.clear();
    },
  };
}

async function discoverTests(
  uri: vscode.Uri
): Promise<Array<{ name: string; range: vscode.Range }>> {
  const lenses =
    (await vscode.commands.executeCommand<vscode.CodeLens[]>(
      'vscode.executeCodeLensProvider',
      uri,
      200
    )) ?? [];
  const tests: Array<{ name: string; range: vscode.Range }> = [];

  for (const lens of lenses) {
    if (!lens.range || lens.command?.command !== 'pike.lsp.runTest') {
      continue;
    }

    const args = lens.command.arguments;
    if (!Array.isArray(args) || typeof args[1] !== 'string' || args[1].length === 0) {
      continue;
    }

    tests.push({ name: args[1], range: lens.range });
  }

  tests.sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    return a.name.localeCompare(b.name);
  });

  return tests;
}

function collectTopLevel(controller: ReturnType<TestingApi['createTestController']>): unknown[] {
  const items: unknown[] = [];
  controller.items.forEach(item => items.push(item));
  return items;
}

function removeMetadata(metadata: Map<string, TestMeta>, fileId: string): void {
  for (const [id, value] of metadata.entries()) {
    if (id === fileId || value.uri === fileId) {
      metadata.delete(id);
    }
  }
}
