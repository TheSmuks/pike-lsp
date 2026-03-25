import type { Connection } from 'vscode-languageserver/node.js';
import { DidChangeConfigurationNotification } from 'vscode-languageserver/node.js';
import { StdlibIndexManager } from '../stdlib-index.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { PikeSettings } from '../core/types.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { WorkspaceScanner } from '../services/workspace-scanner.js';
import {
  formatProtocolVersion,
  isProtocolCompatible,
  QUERY_ENGINE_MAJOR_VERSION,
  QUERY_ENGINE_PROTOCOL,
} from '../query-engine/contracts.js';

interface RuntimeServicePatch {
  stdlibIndex?: StdlibIndexManager | null;
}

interface RegisterServerRuntimeHandlersArgs {
  connection: Connection;
  workspaceIndex: WorkspaceIndex;
  workspaceScanner: WorkspaceScanner;
  getBridgeManager: () => BridgeManager | null;
  getGlobalSettings: () => PikeSettings;
  getIncludePaths: () => string[];
  getClientSupportsWorkDoneProgress: () => boolean;
  setStdlibIndex: (stdlibIndex: StdlibIndexManager | null) => void;
  updateServices: (patch: RuntimeServicePatch) => void;
  log: (message: string) => void;
}

export function registerServerRuntimeHandlers(args: RegisterServerRuntimeHandlersArgs): void {
  const {
    connection,
    workspaceIndex,
    workspaceScanner,
    getBridgeManager,
    getGlobalSettings,
    getIncludePaths,
    getClientSupportsWorkDoneProgress,
    setStdlibIndex,
    updateServices,
    log,
  } = args;

  connection.onInitialized(async () => {
    connection.console.log('Pike LSP Server initialized');
    connection.client.register(DidChangeConfigurationNotification.type, undefined);

    connection.onExecuteCommand(async params => {
      if (params.command !== 'pike.lsp.serverHealth') {
        return null;
      }

      const health = await getBridgeManager()?.getHealth();
      const lines: string[] = [];
      lines.push('=== Pike LSP Server Health ===');
      lines.push('');

      if (health) {
        const uptime = Math.floor(health.serverUptime / 1000);
        const uptimeStr = uptime > 60 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${uptime}s`;

        lines.push(`Server Uptime: ${uptimeStr}`);
        lines.push(`Bridge Connected: ${health.bridgeConnected ? 'YES' : 'NO'}`);
        lines.push(`Pike PID: ${health.pikePid ?? 'N/A'}`);
        lines.push(
          `Pike Version: ${health.pikeVersion?.version ?? 'Unknown'} (${health.pikeVersion?.display ?? 'N/A'})`
        );
        lines.push(`Pike Path: ${health.pikeVersion?.pikePath ?? 'Unknown'}`);

        if (health.recentErrors.length > 0) {
          lines.push('');
          lines.push('Recent Errors:');
          for (const err of health.recentErrors) {
            lines.push(`  - ${err}`);
          }
        } else {
          lines.push('');
          lines.push('No recent errors');
        }
      } else {
        lines.push('Health status unavailable');
      }

      lines.push('');
      lines.push('============================');

      return lines.join('\n');
    });

    if (typeof connection.workspace.onDidChangeWorkspaceFolders === 'function') {
      connection.workspace.onDidChangeWorkspaceFolders(async event => {
        const added = event.added ?? [];
        const removed = event.removed ?? [];

        if (added.length === 0 && removed.length === 0) {
          return;
        }

        connection.console.log(`Workspace folders changed (+${added.length}, -${removed.length})`);

        for (const folder of removed) {
          const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
          workspaceScanner.removeFolder(folderPath);
        }

        for (const folder of added) {
          const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
          try {
            await workspaceScanner.addFolder(folderPath);
          } catch (err) {
            connection.console.warn(`Failed to scan added folder ${folder.name}: ${err}`);
          }
        }

        workspaceIndex.clear();
        const currentFolders = await connection.workspace.getWorkspaceFolders();

        const bridgeForWorkspaceChange = getBridgeManager();
        if (bridgeForWorkspaceChange?.bridge) {
          try {
            const roots = (currentFolders ?? []).map(folder => folder.uri);
            const workspaceAck = await bridgeForWorkspaceChange.engineUpdateWorkspace({
              roots,
              added: added.map(folder => folder.uri),
              removed: removed.map(folder => folder.uri),
            });
            log(
              `Engine workspace delta ack revision=${workspaceAck.revision} snapshot=${workspaceAck.snapshotId}`
            );
          } catch (err) {
            connection.console.warn(`Failed to update engine workspace delta: ${err}`);
            log(`Engine workspace delta update failed: ${err}`);
          }
        }

        if (!currentFolders || currentFolders.length === 0) {
          return;
        }

        for (const folder of currentFolders) {
          try {
            const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
            await workspaceIndex.indexDirectory(folderPath, true);
          } catch (err) {
            connection.console.warn(`Failed to re-index folder ${folder.name}: ${err}`);
          }
        }
      });
    }

    const bridgeManager = getBridgeManager();
    if (bridgeManager?.bridge) {
      try {
        log('Checking Pike availability after initialize handshake');
        const available = await bridgeManager.checkPike();

        if (!available) {
          connection.console.warn('Pike executable not found. Some features may not work.');
          log('Pike executable not found');
        } else {
          const stdlibIndex = new StdlibIndexManager(bridgeManager.bridge);
          setStdlibIndex(stdlibIndex);
          updateServices({ stdlibIndex });

          bridgeManager.on('stderr', (msg: unknown) => {
            log(`[Pike STDERR] ${String(msg)}`);
          });

          if (!bridgeManager.bridge.isRunning()) {
            log('Starting bridge after initialize handshake...');
            await bridgeManager.bridge.start();
          }

          connection.console.log(
            `Pike bridge started (diagnosticDelay: ${getGlobalSettings().diagnosticDelay}ms)`
          );

          const protocolInfo = await bridgeManager.getProtocolInfo();
          if (!protocolInfo) {
            connection.console.warn('Pike analyzer did not provide protocol handshake info');
            log('Protocol handshake unavailable from Pike analyzer');
          } else {
            const protocolSummary = formatProtocolVersion(protocolInfo);
            connection.console.log(`Pike protocol handshake: ${protocolSummary}`);
            log(`Protocol handshake: ${protocolSummary}`);

            if (!isProtocolCompatible(protocolInfo)) {
              connection.console.warn(
                `Unexpected Pike protocol handshake: ${protocolSummary} (expected ${QUERY_ENGINE_PROTOCOL}@${QUERY_ENGINE_MAJOR_VERSION}.x)`
              );
              log(`Protocol compatibility warning: ${protocolSummary}`);
            }
          }

          const configAck = await bridgeManager.engineUpdateConfig({
            settings: {
              diagnosticDelay: getGlobalSettings().diagnosticDelay,
              includePaths: getIncludePaths(),
            },
          });
          log(`Engine config ack revision=${configAck.revision} snapshot=${configAck.snapshotId}`);
        }
      } catch (err) {
        connection.console.warn(`Failed to start bridge: ${err}`);
        log(`Bridge start error: ${err}`);
      }
    }

    connection.console.log('Stdlib preloading skipped - modules will load on-demand');

    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    const bridgeForWorkspace = getBridgeManager();
    if (workspaceFolders && workspaceFolders.length > 0 && bridgeForWorkspace?.bridge) {
      const workspaceAck = await bridgeForWorkspace.engineUpdateWorkspace({
        roots: workspaceFolders.map(folder => folder.uri),
        added: workspaceFolders.map(folder => folder.uri),
        removed: [],
      });
      log(
        `Engine workspace ack revision=${workspaceAck.revision} snapshot=${workspaceAck.snapshotId}`
      );

      connection.console.log(`Indexing ${workspaceFolders.length} workspace folder(s)...`);
      setImmediate(async () => {
        const progress = getClientSupportsWorkDoneProgress()
          ? await connection.window.createWorkDoneProgress().catch(() => null)
          : null;

        if (progress) {
          progress.begin('Pike: indexing workspace', 0, 'Scanning project folders', false);
        }

        const folderPaths: string[] = [];
        for (let i = 0; i < workspaceFolders.length; i += 1) {
          const folder = workspaceFolders[i]!;
          try {
            if (progress) {
              const percentage = Math.floor((i / workspaceFolders.length) * 90);
              progress.report(percentage, `Indexing ${folder.name}`);
            }

            const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
            folderPaths.push(folderPath);
            const indexed = await workspaceIndex.indexDirectory(folderPath, true);
            connection.console.log(`Indexed ${indexed} files from ${folder.name}`);
          } catch (err) {
            connection.console.warn(`Failed to index folder ${folder.name}: ${err}`);
            log(`Indexing error for folder ${folder.name}: ${err}`);
          }
        }

        const stats = workspaceIndex.getStats();
        connection.console.log(
          `Workspace indexing complete: ${stats.documents} files, ${stats.symbols} symbols`
        );

        try {
          if (progress) {
            progress.report(95, 'Building workspace scanner index');
          }

          await workspaceScanner.initialize(folderPaths);
          const scannerStats = workspaceScanner.getStats();
          connection.console.log(
            `Workspace scanner initialized: ${scannerStats.fileCount} Pike files found`
          );
        } catch (err) {
          connection.console.warn(`Failed to initialize workspace scanner: ${err}`);
        } finally {
          if (progress) {
            progress.report(100, 'Workspace ready');
            progress.done();
          }
        }
      });
    }
  });

  connection.onShutdown(async () => {
    connection.console.log('Pike LSP Server shutting down...');
    await getBridgeManager()?.stop();
  });

  connection.onExit(() => {
    getBridgeManager()?.stop().catch(() => undefined);
  });
}
