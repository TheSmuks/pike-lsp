import { describe, expect, it } from 'bun:test';
import { registerServerRuntimeHandlers } from '../../runtime/server-runtime.js';

describe('server runtime workspace folder sync', () => {
  it('forwards workspace folder deltas to engineUpdateWorkspace after initialization', async () => {
    let initializedHandler: (() => Promise<void>) | null = null;
    let workspaceFolderChangeHandler: ((event: any) => Promise<void>) | null = null;

    const updateWorkspaceCalls: Array<{ roots: string[]; added: string[]; removed: string[] }> = [];

    const bridgeManager = {
      bridge: { isRunning: () => true },
      checkPike: async () => false,
      engineUpdateWorkspace: async (payload: {
        roots: string[];
        added: string[];
        removed: string[];
      }) => {
        updateWorkspaceCalls.push(payload);
        return { revision: 1, snapshotId: 'snp-1' };
      },
      stop: async () => undefined,
    };

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
        onDidChangeWorkspaceFolders: (handler: (event: any) => Promise<void>) => {
          workspaceFolderChangeHandler = handler;
        },
        getWorkspaceFolders: async () => [{ uri: 'file:///workspace/new', name: 'new' }],
      },
      window: {
        createWorkDoneProgress: async () => null,
      },
      console: {
        log: () => undefined,
        warn: () => undefined,
      },
    };

    const workspaceIndex = {
      clear: () => undefined,
      indexDirectory: async () => 0,
      getStats: () => ({ documents: 0, symbols: 0, uniqueNames: 0 }),
    };

    const workspaceScanner = {
      removeFolder: () => undefined,
      addFolder: async () => undefined,
      initialize: async () => undefined,
      getStats: () => ({ fileCount: 0 }),
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

    expect(workspaceFolderChangeHandler).not.toBeNull();
    await workspaceFolderChangeHandler!({
      added: [{ uri: 'file:///workspace/new', name: 'new' }],
      removed: [{ uri: 'file:///workspace/old', name: 'old' }],
    });

    const deltaCall = updateWorkspaceCalls.find(call => call.removed.length === 1);
    expect(deltaCall).toBeDefined();
    expect(deltaCall?.roots).toEqual(['file:///workspace/new']);
    expect(deltaCall?.added).toEqual(['file:///workspace/new']);
    expect(deltaCall?.removed).toEqual(['file:///workspace/old']);
  });
});
