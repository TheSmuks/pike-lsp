/**
 * Pike LSP Server
 *
 * Language Server Protocol implementation for Pike.
 * Provides real-time diagnostics, document sync, and symbol extraction.
 *
 * This is a wiring-only file - all handler logic is in feature modules.
 */

import {
  createConnection,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  TextDocuments,
  DidChangeConfigurationNotification,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import { WorkspaceIndex } from './workspace-index.js';
import { TypeDatabase } from './type-database.js';
import { StdlibIndexManager } from './stdlib-index.js';
import { BridgeManager } from './services/bridge-manager.js';
import { DocumentCache } from './services/document-cache.js';
import { IncludeResolver } from './services/include-resolver.js';
import { ModuleContext } from './services/module-context.js';
import { WorkspaceScanner } from './services/workspace-scanner.js';
import { Logger } from '@pike-lsp/core';
import { PikeSettings, defaultSettings } from './core/types.js';
import * as features from './features/index.js';

// Semantic tokens legend (defined here for capabilities)
const tokenTypes = [
  'namespace',
  'type',
  'class',
  'enum',
  'interface',
  'struct',
  'typeParameter',
  'parameter',
  'variable',
  'property',
  'enumMember',
  'event',
  'function',
  'method',
  'macro',
  'keyword',
  'modifier',
  'comment',
  'string',
  'number',
  'regexp',
  'operator',
  'decorator',
];
const tokenModifiers = [
  'declaration',
  'definition',
  'readonly',
  'static',
  'deprecated',
  'abstract',
  'async',
  'modification',
  'documentation',
  'defaultLibrary',
];

// ============================================================================
// Connection and Documents
// ============================================================================

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ============================================================================
// Services
// ============================================================================

const logger = new Logger('PikeLSPServer');
const documentCache = new DocumentCache();
const typeDatabase = new TypeDatabase();
const workspaceIndex = new WorkspaceIndex();
const workspaceScanner = new WorkspaceScanner(logger, () => globalSettings);
const moduleContext = new ModuleContext();
let stdlibIndex: StdlibIndexManager | null = null;
let includeResolver: IncludeResolver | null = null;
let bridgeManager: BridgeManager | null = null;

let globalSettings: PikeSettings = defaultSettings;
let includePaths: string[] = [];

// ============================================================================
// Helper: Find analyzer.pike script
// ============================================================================

function findAnalyzerPath(): string | undefined {
  // Determine the current module's directory
  // Handle both ESM (import.meta.url) and CJS (__filename) cases
  let resolvedDirname: string;

  // Check if running in CJS mode (bundled with esbuild)
  // __filename and __dirname are available in CJS but not in strict ESM

  if (typeof __filename !== 'undefined') {
    resolvedDirname = path.dirname(__filename as string);
  } else {
    // ESM mode
    const modulePath = fileURLToPath(import.meta.url);
    resolvedDirname = path.dirname(modulePath);
  }

  const possiblePaths = [
    path.resolve(resolvedDirname, 'pike-scripts', 'analyzer.pike'),
    path.resolve(resolvedDirname, '..', '..', '..', 'pike-scripts', 'analyzer.pike'),
    path.resolve(resolvedDirname, '..', 'pike-scripts', 'analyzer.pike'),
  ];

  for (const p of possiblePaths) {
    if (fsSync.existsSync(p)) {
      return p;
    }
  }

  return undefined;
}

// NOTE: Document validation is handled by features/diagnostics.ts
// The registerDiagnosticsHandlers function sets up all document event handlers

// ============================================================================
// Services Bundle Factory
// ============================================================================

function createServices(): features.Services {
  return {
    bridge: bridgeManager, // Will be null initially, updated after onInitialize
    logger,
    documentCache,
    moduleContext,
    typeDatabase,
    workspaceIndex,
    stdlibIndex,
    includeResolver, // Will be null initially, updated after onInitialize
    workspaceScanner,
    globalSettings,
    includePaths,
  };
}

// ============================================================================
// Debug Logging
// ============================================================================

const logFile = '/tmp/pike-lsp-debug.log';
const log = (msg: string) => {
  try {
    fsSync.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // Silently ignore logging failures to prevent cascading errors
  }
};

// ============================================================================
// LSP Lifecycle Handlers
// ============================================================================

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
  try {
    log('onInitialize started');

    // Do NOT override connection.console methods as it causes issues with 'this' context
    connection.console.log('Pike LSP Server initializing...');
    log('Pike LSP Server initializing...');

    const analyzerPath = findAnalyzerPath();
    if (analyzerPath) {
      connection.console.log(`Found analyzer.pike at: ${analyzerPath}`);
      log(`Found analyzer.pike at: ${analyzerPath}`);
    } else {
      connection.console.warn('Could not find analyzer.pike script');
      log('Could not find analyzer.pike script');
    }

    const initOptions = params.initializationOptions as
      | {
          pikePath?: string;
          diagnosticDelay?: number;
          analyzerPath?: string;
          env?: NodeJS.ProcessEnv;
        }
      | undefined;

    log(`Init options: ${JSON.stringify(initOptions)}`);

    const bridgeOptions: { pikePath: string; analyzerPath?: string; env: NodeJS.ProcessEnv } = {
      pikePath: initOptions?.pikePath ?? 'pike',
      env: initOptions?.env ?? {},
    };

    // Update global settings with initialization options
    if (initOptions?.diagnosticDelay !== undefined) {
      globalSettings = {
        ...globalSettings,
        diagnosticDelay: initOptions.diagnosticDelay,
      };
    }

    includePaths = (initOptions?.env?.['PIKE_INCLUDE_PATH'] ?? '')
      .split(':')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0);

    // Use analyzer path from init options if provided, otherwise use findAnalyzerPath()
    if (initOptions?.analyzerPath) {
      bridgeOptions.analyzerPath = initOptions.analyzerPath;
      log(`Using analyzer path from init options: ${initOptions.analyzerPath}`);
    } else if (analyzerPath) {
      bridgeOptions.analyzerPath = analyzerPath;
      log(`Using analyzer path from findAnalyzerPath: ${analyzerPath}`);
    } else {
      log('WARNING: No analyzer path found, Pike bridge will try to auto-detect');
    }

    log(`Initializing PikeBridge with options: ${JSON.stringify(bridgeOptions)}`);
    const bridge = new PikeBridge(bridgeOptions);
    bridgeManager = new BridgeManager(bridge, logger);
    includeResolver = new IncludeResolver(bridgeManager, logger);

    // Update services.bridge now that bridgeManager is initialized
    (services as features.Services).bridge = bridgeManager;
    (services as features.Services).includeResolver = includeResolver;

    workspaceIndex.setBridge(bridge);
    workspaceIndex.setErrorCallback((message, uri) => {
      connection.console.warn(message + (uri ? ` (${uri})` : ''));
      log(`[WorkspaceIndex Error] ${message} (${uri})`);
    });

    log('onInitialize completing');

    return {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        documentSymbolProvider: true,
        workspaceSymbolProvider: true,
        hoverProvider: true,
        definitionProvider: true,
        declarationProvider: true,
        typeDefinitionProvider: true,
        referencesProvider: true,
        implementationProvider: true,
        completionProvider: {
          resolveProvider: true,
          triggerCharacters: ['.', ':', '>', '-', '!'],
        },
        executeCommandProvider: {
          commands: ['pike.lsp.serverHealth'],
        },
        signatureHelpProvider: {
          triggerCharacters: ['(', ','],
        },
        renameProvider: {
          prepareProvider: true,
          // renameProvider is missing in capabilities interface for some reason, check version?
          // Wait, renameProvider can be boolean or RenameOptions.
        },
        callHierarchyProvider: true,
        typeHierarchyProvider: true,
        documentHighlightProvider: true,
        foldingRangeProvider: true,
        selectionRangeProvider: true,
        inlayHintProvider: true,
        semanticTokensProvider: {
          legend: { tokenTypes, tokenModifiers },
          full: { delta: true },
        },
        codeActionProvider: {
          codeActionKinds: [
            'quickfix',
            'source.organizeImports',
            'refactor',
            'refactor.extract',
            'refactor.rewrite',
          ],
        },
        documentFormattingProvider: true,
        documentRangeFormattingProvider: true,
        documentOnTypeFormattingProvider: {
          firstTriggerCharacter: ';',
          moreTriggerCharacter: ['}', '\n'],
        },
        documentLinkProvider: { resolveProvider: true },
        codeLensProvider: { resolveProvider: true },
        linkedEditingRangeProvider: true,
        inlineValueProvider: true,
        monikerProvider: true,
        workspace: {
          workspaceFolders: {
            supported: true,
            changeNotifications: true,
          },
        },
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.stack : String(err);
    connection.console.error(
      `CRITICAL ERROR in onInitialize: ${errMsg}. This error occurred during LSP server initialization. Check that Pike is installed correctly and the analyzer.pike script exists.`
    );
    log(`CRITICAL ERROR in onInitialize: ${errMsg}`);
    throw err;
  }
});

connection.onInitialized(async () => {
  connection.console.log('Pike LSP Server initialized');
  connection.client.register(DidChangeConfigurationNotification.type, undefined);

  // Register health check command handler
  connection.onExecuteCommand(async params => {
    if (params.command === 'pike.lsp.serverHealth') {
      const health = await bridgeManager?.getHealth();

      // Format health status as readable output
      const lines: string[] = [];
      lines.push('=== Pike LSP Server Health ===');
      lines.push('');

      if (health) {
        const uptime = Math.floor(health.serverUptime / 1000);
        const uptimeStr =
          uptime > 60 ? `${Math.floor(uptime / 60)}m ${uptime % 60}s` : `${uptime}s`;

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
    }

    return null;
  });

  // Keep workspace indices/scanner in sync when folders are added/removed.
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

      // Rebuild workspace index from currently active folders.
      workspaceIndex.clear();
      const currentFolders = await connection.workspace.getWorkspaceFolders();
      if (currentFolders && currentFolders.length > 0) {
        for (const folder of currentFolders) {
          try {
            const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
            await workspaceIndex.indexDirectory(folderPath, true);
          } catch (err) {
            connection.console.warn(`Failed to re-index folder ${folder.name}: ${err}`);
          }
        }
      }
    });
  }

  if (bridgeManager?.bridge) {
    try {
      log('Checking Pike availability after initialize handshake');
      const available = await bridgeManager.checkPike();

      if (!available) {
        connection.console.warn('Pike executable not found. Some features may not work.');
        log('Pike executable not found');
      } else {
        stdlibIndex = new StdlibIndexManager(bridgeManager.bridge);
        (services as features.Services).stdlibIndex = stdlibIndex;

        bridgeManager.on('stderr', (msg: unknown) => {
          log(`[Pike STDERR] ${String(msg)}`);
        });

        if (!bridgeManager.bridge.isRunning()) {
          log('Starting bridge after initialize handshake...');
          await bridgeManager.bridge.start();
        }

        connection.console.log(
          `Pike bridge started (diagnosticDelay: ${globalSettings.diagnosticDelay}ms)`
        );
      }
    } catch (err) {
      connection.console.warn(`Failed to start bridge: ${err}`);
      log(`Bridge start error: ${err}`);
    }
  }

  // NOTE: Stdlib preloading disabled due to Pike subprocess crash when introspecting bootstrap modules (Stdio, String, Array, Mapping).
  // These modules are used internally by the resolver and cannot be safely introspected.
  // Modules will be loaded lazily on-demand instead.
  connection.console.log('Stdlib preloading skipped - modules will load on-demand');

  // Index workspace
  const workspaceFolders = await connection.workspace.getWorkspaceFolders();
  if (workspaceFolders && workspaceFolders.length > 0 && bridgeManager?.bridge) {
    connection.console.log(`Indexing ${workspaceFolders.length} workspace folder(s)...`);
    setImmediate(async () => {
      let _totalIndexed = 0;
      const folderPaths: string[] = [];
      for (const folder of workspaceFolders) {
        try {
          const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
          folderPaths.push(folderPath);
          const indexed = await workspaceIndex.indexDirectory(folderPath, true);
          _totalIndexed += indexed;
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

      // Initialize workspace scanner for workspace-wide references
      try {
        await workspaceScanner.initialize(folderPaths);
        const scannerStats = workspaceScanner.getStats();
        connection.console.log(
          `Workspace scanner initialized: ${scannerStats.fileCount} Pike files found`
        );
      } catch (err) {
        connection.console.warn(`Failed to initialize workspace scanner: ${err}`);
      }
    });
  }

  // NOTE: Open documents will be validated by diagnostics.ts onDidOpen handlers
  // which are triggered when documents.listen(connection) starts
});

connection.onDidChangeConfiguration(change => {
  const settings = change.settings as { pike?: Partial<PikeSettings> } | undefined;
  globalSettings = {
    ...defaultSettings,
    ...(settings?.pike ?? {}),
  };
  // NOTE: Document revalidation is handled by diagnostics.ts onDidChangeConfiguration
});

// ============================================================================
// Register Feature Handlers (BEFORE documents.listen!)
// ============================================================================

const services = createServices();

features.registerDiagnosticsHandlers(connection, services, documents);
features.registerNavigationHandlers(connection, services, documents);
features.registerEditingHandlers(connection, services, documents);
features.registerSymbolsHandlers(connection, services, documents);
features.registerHierarchyHandlers(connection, services, documents);
features.registerAdvancedHandlers(connection, services, documents, globalSettings, includePaths);
// Phase 3: Register Roxen feature handlers
features.registerRoxenHandlers(connection, services, documents);
// Phase 2: Register RXML feature handlers
features.registerRXMLHandlers(connection, services, documents);
// Issue #184: Register file watcher for incremental updates
features.registerFileWatcher(connection, services, documents);

// ============================================================================
// Shutdown Handlers
// ============================================================================

connection.onShutdown(async () => {
  connection.console.log('Pike LSP Server shutting down...');
  await bridgeManager?.stop();
});

connection.onExit(() => {
  bridgeManager?.stop().catch(() => {
    // Ignore errors during exit
  });
});

// ============================================================================
// Start Listening
// ============================================================================

documents.listen(connection);
connection.listen();

connection.console.log('Pike LSP Server started');
