import { registerServerRuntimeHandlers } from '../../runtime/server-runtime.js';

const { describe, expect, it } = require('bun:test');

describe('server runtime indexing progress', () => {
  it('emits begin/report/end work-done progress when supported', async () => {
    let initializedHandler: (() => Promise<void>) | null = null;
    const progressEvents: Array<{ type: 'begin' | 'report' | 'done'; message?: string }> = [];

    const connection = {
      onInitialized: (handler: () => Promise<void>) => {
        initializedHandler = handler;
      },
      onShutdown: () => undefined,
      onExit: () => undefined,
      onExecuteCommand: () => undefined,
      client: {
        register: async () => undefined,
      },
      workspace: {
        onDidChangeWorkspaceFolders: () => undefined,
        getWorkspaceFolders: async () => [{ uri: 'file:///workspace/a', name: 'a' }],
      },
      window: {
        createWorkDoneProgress: async () => ({
          begin: (_title: string, _percentage: number, message: string) => {
            progressEvents.push({ type: 'begin', message });
          },
          report: (_percentage: number, message: string) => {
            progressEvents.push({ type: 'report', message });
          },
          done: () => {
            progressEvents.push({ type: 'done' });
          },
        }),
      },
      console: {
        log: () => undefined,
        warn: () => undefined,
      },
    };

    const workspaceIndex = {
      clear: () => undefined,
      indexDirectory: async (
        _path: string,
        _recursive: boolean,
        onProgress?: (progress: {
          current: number;
          total: number;
          phase: 'discovering' | 'reading' | 'parsing' | 'indexing';
          message: string;
        }) => void
      ) => {
        onProgress?.({
          current: 1,
          total: 2,
          phase: 'reading',
          message: 'Reading files 1-1 of 2',
        });
        onProgress?.({
          current: 2,
          total: 2,
          phase: 'indexing',
          message: 'Indexed 2 of 2 changed files',
        });
        return 2;
      },
      getStats: () => ({ documents: 2, symbols: 4, uniqueNames: 4 }),
    };

    const workspaceScanner = {
      removeFolder: () => undefined,
      addFolder: async () => undefined,
      initialize: async () => undefined,
      getStats: () => ({ fileCount: 2 }),
    };

    const bridgeManager = {
      bridge: { isRunning: () => true },
      checkPike: async () => false,
      engineUpdateWorkspace: async () => ({ revision: 1, snapshotId: 'snp-1' }),
      stop: async () => undefined,
    };

    registerServerRuntimeHandlers({
      connection: connection as any,
      workspaceIndex: workspaceIndex as any,
      workspaceScanner: workspaceScanner as any,
      getBridgeManager: () => bridgeManager as any,
      getGlobalSettings: () => ({ diagnosticDelay: 250 }) as any,
      getIncludePaths: () => [],
      getClientSupportsWorkDoneProgress: () => true,
      setStdlibIndex: () => undefined,
      updateServices: () => undefined,
      log: () => undefined,
    });

    expect(initializedHandler).not.toBeNull();
    await initializedHandler!();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(progressEvents.some(e => e.type === 'begin')).toBeTrue();
    expect(
      progressEvents.some(e => e.type === 'report' && e.message?.includes('Reading files'))
    ).toBeTrue();
    expect(progressEvents.some(e => e.type === 'done')).toBeTrue();
  });

  it('falls back to status messages when work-done progress is unsupported', async () => {
    let initializedHandler: (() => Promise<void>) | null = null;
    const messages: string[] = [];

    const connection = {
      onInitialized: (handler: () => Promise<void>) => {
        initializedHandler = handler;
      },
      onShutdown: () => undefined,
      onExit: () => undefined,
      onExecuteCommand: () => undefined,
      client: {
        register: async () => undefined,
      },
      workspace: {
        onDidChangeWorkspaceFolders: () => undefined,
        getWorkspaceFolders: async () => [{ uri: 'file:///workspace/a', name: 'a' }],
      },
      window: {
        createWorkDoneProgress: async () => null,
        showInformationMessage: (message: string) => {
          messages.push(message);
        },
      },
      console: {
        log: () => undefined,
        warn: () => undefined,
      },
    };

    const workspaceIndex = {
      clear: () => undefined,
      indexDirectory: async () => 1,
      getStats: () => ({ documents: 1, symbols: 2, uniqueNames: 2 }),
    };

    const workspaceScanner = {
      removeFolder: () => undefined,
      addFolder: async () => undefined,
      initialize: async () => undefined,
      getStats: () => ({ fileCount: 1 }),
    };

    const bridgeManager = {
      bridge: { isRunning: () => true },
      checkPike: async () => false,
      engineUpdateWorkspace: async () => ({ revision: 1, snapshotId: 'snp-1' }),
      stop: async () => undefined,
    };

    registerServerRuntimeHandlers({
      connection: connection as any,
      workspaceIndex: workspaceIndex as any,
      workspaceScanner: workspaceScanner as any,
      getBridgeManager: () => bridgeManager as any,
      getGlobalSettings: () => ({ diagnosticDelay: 250 }) as any,
      getIncludePaths: () => [],
      getClientSupportsWorkDoneProgress: () => false,
      setStdlibIndex: () => undefined,
      updateServices: () => undefined,
      log: () => undefined,
    });

    expect(initializedHandler).not.toBeNull();
    await initializedHandler!();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(messages).toContain('Pike LSP: Indexing workspace…');
    expect(messages).toContain('Pike LSP: Indexing complete');
  });
});
