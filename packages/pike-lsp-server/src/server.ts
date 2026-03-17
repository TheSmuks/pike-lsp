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
import {
  Logger,
  anonymizeSensitivePaths,
  StackTraceSanitizer,
  CatchAllScanner,
} from '@pike-lsp/core';
import { PikeSettings, defaultSettings } from './core/types.js';
import * as features from './features/index.js';
import { registerServerRuntimeHandlers } from './runtime/server-runtime.js';
import { createServiceRuntimeContext } from './runtime/service-runtime-context.js';

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
let clientSupportsWorkDoneProgress = false;

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

function toErrorSummary(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}

function sanitizeCrashText(value: string): string {
  const maxLines = 40;
  const maxLineLength = 320;
  const workspaceRoot = process.cwd();
  const strengthened = CatchAllScanner.scan(
    StackTraceSanitizer.sanitizeStackTrace(anonymizeSensitivePaths(value), workspaceRoot)
  );

  const lines = strengthened.split(/\r?\n/).filter(line => line.trim().length > 0);

  const clipped = lines
    .slice(0, maxLines)
    .map(line =>
      line.length > maxLineLength ? `${line.slice(0, maxLineLength)} ... [truncated]` : line
    );

  if (lines.length > maxLines) {
    clipped.push(`... ${lines.length - maxLines} additional lines omitted`);
  }

  return clipped.join('\n');
}

function formatCrashReport(context: string, err: unknown): string {
  const raw = err instanceof Error ? (err.stack ?? `${err.name}: ${err.message}`) : String(err);
  const stack = sanitizeCrashText(raw);
  return [
    `[FATAL] ${context}`,
    `Summary: ${sanitizeCrashText(toErrorSummary(err))}`,
    'Stack:',
    stack,
  ].join('\n');
}

let fatalExceptionSeen = false;

process.on('unhandledRejection', (reason: unknown) => {
  const report = formatCrashReport('Unhandled promise rejection', reason);
  connection.console.error(report);
  log(report);
});

process.on('uncaughtException', (err: Error) => {
  if (fatalExceptionSeen) {
    return;
  }
  fatalExceptionSeen = true;

  const report = formatCrashReport('Uncaught exception', err);
  connection.console.error(report);
  log(report);

  setTimeout(() => {
    process.exit(1);
  }, 20);
});

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
    clientSupportsWorkDoneProgress = Boolean(params.capabilities.window?.workDoneProgress);

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

    serviceRuntimeContext.update({
      bridge: bridgeManager,
      includeResolver,
    });

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
    const report = formatCrashReport(
      'Initialization failure (check Pike path and analyzer.pike availability)',
      err
    );
    connection.console.error(report);
    log(report);
    throw err;
  }
});

connection.onDidChangeConfiguration(change => {
  const settings = change.settings as { pike?: Partial<PikeSettings> } | undefined;
  globalSettings = {
    ...defaultSettings,
    ...(settings?.pike ?? {}),
  };
});

// ============================================================================
// Register Feature Handlers (BEFORE documents.listen!)
// ============================================================================

const serviceRuntimeContext = createServiceRuntimeContext(createServices());
const services = serviceRuntimeContext.services;

features.registerDiagnosticsHandlers(connection, services, documents);
features.registerNavigationHandlers(connection, services, documents);
features.registerEditingHandlers(connection, services, documents);
features.registerSymbolsHandlers(connection, services, documents);
features.registerHierarchyHandlers(connection, services, documents);
features.registerAdvancedHandlers(connection, services, documents);
// Phase 3: Register Roxen feature handlers
features.registerRoxenHandlers(connection, services, documents);
// Phase 2: Register RXML feature handlers
features.registerRXMLHandlers(connection, services, documents);
// Issue #184: Register file watcher for incremental updates
features.registerFileWatcher(connection, services, documents);

registerServerRuntimeHandlers({
  connection,
  workspaceIndex,
  workspaceScanner,
  getBridgeManager: () => bridgeManager,
  getGlobalSettings: () => globalSettings,
  getIncludePaths: () => includePaths,
  getClientSupportsWorkDoneProgress: () => clientSupportsWorkDoneProgress,
  setStdlibIndex: index => {
    stdlibIndex = index;
  },
  updateServices: patch => {
    serviceRuntimeContext.update(patch);
  },
  log,
});

// ============================================================================
// Start Listening
// ============================================================================

documents.listen(connection);
connection.listen();

connection.console.log('Pike LSP Server started');
