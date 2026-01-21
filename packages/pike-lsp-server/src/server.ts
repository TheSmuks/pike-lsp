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
    Diagnostic,
    DiagnosticSeverity,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { PikeBridge, PikeSymbol, PikeDiagnostic } from '@pike-lsp/pike-bridge';
import { WorkspaceIndex } from './workspace-index.js';
import { TypeDatabase, CompiledProgramInfo } from './type-database.js';
import { StdlibIndexManager } from './stdlib-index.js';
import { PatternHelpers } from './utils/regex-patterns.js';
import { BridgeManager } from './services/bridge-manager.js';
import { DocumentCache } from './services/document-cache.js';
import { Logger } from './core/logging.js';
import { PikeSettings, defaultSettings } from './core/types.js';
import * as features from './features/index.js';

// Semantic tokens legend (defined here for capabilities)
const tokenTypes = [
    'namespace', 'type', 'class', 'enum', 'interface',
    'struct', 'typeParameter', 'parameter', 'variable', 'property',
    'enumMember', 'event', 'function', 'method', 'macro',
    'keyword', 'modifier', 'comment', 'string', 'number',
    'regexp', 'operator', 'decorator'
];
const tokenModifiers = [
    'declaration', 'definition', 'readonly', 'static',
    'deprecated', 'abstract', 'async', 'modification',
    'documentation', 'defaultLibrary'
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
let stdlibIndex: StdlibIndexManager | null = null;
let bridgeManager: BridgeManager | null = null;

let globalSettings: PikeSettings = defaultSettings;
let includePaths: string[] = [];

// Validation timers
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ============================================================================
// Helper: Find analyzer.pike script
// ============================================================================

function findAnalyzerPath(): string | undefined {
    const resolvedFilename =
        typeof __filename === 'string' ? __filename : fileURLToPath(import.meta.url);
    const resolvedDirname = path.dirname(resolvedFilename);

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
// Helper: Symbol position indexing
// ============================================================================

async function buildSymbolPositionIndex(
    text: string,
    symbols: PikeSymbol[]
): Promise<Map<string, import('vscode-languageserver/node.js').Position[]>> {
    const index = new Map<string, import('vscode-languageserver/node.js').Position[]>();
    type LSPPosition = import('vscode-languageserver/node.js').Position;

    const symbolNames = new Set<string>();
    for (const symbol of symbols) {
        if (symbol.name) {
            symbolNames.add(symbol.name);
        }
    }

    // Try Pike-based tokenization first
    if (bridgeManager?.bridge?.isRunning()) {
        try {
            const result = await bridgeManager.bridge.findOccurrences(text);
            for (const occ of result.occurrences) {
                if (symbolNames.has(occ.text)) {
                    const pos: LSPPosition = {
                        line: occ.line - 1,
                        character: occ.character,
                    };
                    if (!index.has(occ.text)) {
                        index.set(occ.text, []);
                    }
                    index.get(occ.text)!.push(pos);
                }
            }
            if (index.size === symbolNames.size) {
                return index;
            }
        } catch {
            // Fall through to regex
        }
    }

    // Fallback regex-based search
    const lines = text.split('\n');
    for (const symbol of symbols) {
        if (!symbol.name) continue;
        const positions: LSPPosition[] = [];

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;

            let searchStart = 0;
            let matchIndex: number;
            while ((matchIndex = line.indexOf(symbol.name, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + symbol.name.length < line.length ?
                    line[matchIndex + symbol.name.length] : ' ';
                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    const trimmed = line.trimStart();
                    if (!PatternHelpers.isCommentLine(trimmed) &&
                        line.indexOf('//', matchIndex) < 0) {
                        positions.push({ line: lineNum, character: matchIndex });
                    }
                }
                searchStart = matchIndex + 1;
            }
        }
        if (positions.length > 0) {
            index.set(symbol.name, positions);
        }
    }

    return index;
}

// ============================================================================
// Helper: Document validation
// ============================================================================

function validateDocumentDebounced(document: TextDocument): void {
    const uri = document.uri;
    const existingTimer = validationTimers.get(uri);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        validationTimers.delete(uri);
        validateDocument(document);
    }, globalSettings.diagnosticDelay);

    validationTimers.set(uri, timer);
}

async function validateDocument(document: TextDocument): Promise<void> {
    const uri = document.uri;
    connection.console.log(`[VALIDATE] Starting validation for: ${uri}`);

    if (!bridgeManager?.bridge) {
        connection.console.warn('[VALIDATE] Bridge not available');
        return;
    }

    const bridge = bridgeManager.bridge;
    if (!bridge.isRunning()) {
        try {
            await bridge.start();
            connection.console.log('[VALIDATE] Bridge started successfully');
        } catch (err) {
            connection.console.error(`[VALIDATE] Failed to start bridge: ${err}`);
            return;
        }
    }

    const text = document.getText();
    const version = document.version;
    const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

    try {
        const introspectResult = await bridge.introspect(text, filename);
        const parseResult = await bridge.parse(text, filename);

        const diagnostics: Diagnostic[] = [];

        // Convert Pike diagnostics to LSP diagnostics
        const skipPatterns = [
            /Index .* not present in module/i,
            /Indexed module was:/i,
            /Illegal program identifier/i,
            /Not a valid program specifier/i,
            /Failed to evaluate constant expression/i,
        ];

        for (const pikeDiag of introspectResult.diagnostics) {
            if (diagnostics.length >= globalSettings.maxNumberOfProblems) break;
            if (skipPatterns.some(p => p.test(pikeDiag.message))) continue;
            diagnostics.push(convertDiagnostic(pikeDiag, document));
        }

        // Update document cache
        const flatSymbols = flattenSymbols(parseResult.symbols);
        const enrichedSymbols = flatSymbols.map(parsedSym => {
            const introspected = introspectResult.symbols.find(s => s.name === parsedSym.name);
            return introspected ? { ...parsedSym, type: introspected.type, modifiers: introspected.modifiers } : parsedSym;
        });

        documentCache.set(uri, {
            version,
            symbols: enrichedSymbols,
            diagnostics,
            symbolPositions: await buildSymbolPositionIndex(text, enrichedSymbols),
        });

        // Update type database
        if (introspectResult.success && introspectResult.symbols.length > 0) {
            const symbolMap = new Map(introspectResult.symbols.map(s => [s.name, s]));
            const functionMap = new Map(introspectResult.functions.map(s => [s.name, s]));
            const variableMap = new Map(introspectResult.variables.map(s => [s.name, s]));
            const classMap = new Map(introspectResult.classes.map(s => [s.name, s]));
            const sizeBytes = TypeDatabase.estimateProgramSize(symbolMap, introspectResult.inherits);

            const programInfo: CompiledProgramInfo = {
                uri,
                version,
                symbols: symbolMap,
                functions: functionMap,
                variables: variableMap,
                classes: classMap,
                inherits: introspectResult.inherits,
                imports: new Set(),
                compiledAt: Date.now(),
                sizeBytes,
            };
            typeDatabase.setProgram(programInfo);
        }

        // Analyze uninitialized variables
        try {
            const uninitResult = await bridge.analyzeUninitialized(text, filename);
            if (uninitResult.diagnostics) {
                for (const uninitDiag of uninitResult.diagnostics) {
                    if (diagnostics.length >= globalSettings.maxNumberOfProblems) break;
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: { line: Math.max(0, (uninitDiag.position?.line ?? 1) - 1), character: 0 },
                            end: { line: Math.max(0, (uninitDiag.position?.line ?? 1) - 1), character: 10 },
                        },
                        message: uninitDiag.message,
                        source: 'pike-uninitialized',
                    });
                }
            }
        } catch {
            // Continue on failure
        }

        connection.sendDiagnostics({ uri, diagnostics });
        connection.console.log(`[VALIDATE] Complete for ${uri}`);
    } catch (err) {
        connection.console.error(`[VALIDATE] Failed for ${uri}: ${err}`);
    }
}

function flattenSymbols(symbols: PikeSymbol[], parentName = ''): PikeSymbol[] {
    const flat: PikeSymbol[] = [];
    for (const sym of symbols) {
        flat.push(sym);
        if (sym.children && sym.children.length > 0) {
            const qualifiedPrefix = parentName ? `${parentName}.${sym.name}` : sym.name;
            for (const child of sym.children) {
                // Spread child without qualifiedName (not in PikeSymbol type)
                const { ...childCopy } = child;
                flat.push(childCopy);
                if (child.children) {
                    flat.push(...flattenSymbols(child.children, qualifiedPrefix));
                }
            }
        }
    }
    return flat;
}

function convertDiagnostic(pikeDiag: PikeDiagnostic, document: TextDocument): Diagnostic {
    const line = Math.max(0, (pikeDiag.position.line ?? 1) - 1);
    const text = document.getText();
    const lines = text.split('\n');
    const lineText = lines[line] ?? '';
    let startChar = pikeDiag.position.column ? pikeDiag.position.column - 1 : 0;
    let endChar = lineText.length;

    if (!pikeDiag.position.column) {
        const trimmedStart = lineText.search(/\S/);
        if (trimmedStart >= 0) startChar = trimmedStart;
    }

    const trimmedLine = lineText.trim();
    if (PatternHelpers.isCommentLine(trimmedLine)) {
        endChar = Math.min(startChar + 10, lineText.length);
    }

    if (endChar <= startChar) {
        endChar = Math.min(startChar + Math.max(1, lineText.trim().length), lineText.length);
    }

    const severity = pikeDiag.severity === 'warning' ? DiagnosticSeverity.Warning :
        pikeDiag.severity === 'info' ? DiagnosticSeverity.Information : DiagnosticSeverity.Error;

    return {
        severity,
        range: { start: { line, character: startChar }, end: { line, character: endChar } },
        message: pikeDiag.message,
        source: 'pike',
    };
}

// ============================================================================
// Services Bundle Factory
// ============================================================================

function createServices(): features.Services {
    return {
        bridge: bridgeManager!,
        logger,
        documentCache,
        typeDatabase,
        workspaceIndex,
        stdlibIndex,
        globalSettings,
        includePaths,
    };
}

// ============================================================================
// LSP Lifecycle Handlers
// ============================================================================

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
    connection.console.log('Pike LSP Server initializing...');

    const analyzerPath = findAnalyzerPath();
    if (analyzerPath) {
        connection.console.log(`Found analyzer.pike at: ${analyzerPath}`);
    } else {
        connection.console.warn('Could not find analyzer.pike script');
    }

    const initOptions = params.initializationOptions as { pikePath?: string; env?: NodeJS.ProcessEnv } | undefined;
    const bridgeOptions: { pikePath: string; analyzerPath?: string; env: NodeJS.ProcessEnv } = {
        pikePath: initOptions?.pikePath ?? 'pike',
        env: initOptions?.env ?? {},
    };

    includePaths = (initOptions?.env?.['PIKE_INCLUDE_PATH'] ?? '')
        .split(':')
        .map(entry => entry.trim())
        .filter(entry => entry.length > 0);

    if (analyzerPath) {
        bridgeOptions.analyzerPath = analyzerPath;
    }

    const bridge = new PikeBridge(bridgeOptions);
    bridgeManager = new BridgeManager(bridge, logger);

    try {
        const available = await bridge.checkPike();
        if (!available) {
            connection.console.warn('Pike executable not found. Some features may not work.');
        } else {
            stdlibIndex = new StdlibIndexManager(bridge);
            bridge.on('stderr', (msg: string) => connection.console.log(`[Pike] ${msg}`));
            await bridge.start();
            connection.console.log('Pike bridge started');
        }
    } catch (err) {
        connection.console.error(`Failed to start Pike bridge: ${err}`);
    }

    workspaceIndex.setBridge(bridge);
    workspaceIndex.setErrorCallback((message, uri) => {
        connection.console.warn(message + (uri ? ` (${uri})` : ''));
    });

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
                triggerCharacters: ['.', ':', '>', '-'],
            },
            signatureHelpProvider: {
                triggerCharacters: ['(', ','],
            },
            renameProvider: {
                prepareProvider: true,
            },
            callHierarchyProvider: true,
            typeHierarchyProvider: true,
            documentHighlightProvider: true,
            foldingRangeProvider: true,
            selectionRangeProvider: true,
            inlayHintProvider: true,
            semanticTokensProvider: {
                legend: { tokenTypes, tokenModifiers },
                full: true,
            },
            codeActionProvider: {
                codeActionKinds: ['quickfix', 'source.organizeImports'],
            },
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true,
            documentLinkProvider: { resolveProvider: true },
            codeLensProvider: { resolveProvider: true },
            executeCommandProvider: {
                commands: ['pike.lsp.showDiagnostics'],
            },
        },
    };
});

connection.onInitialized(async () => {
    connection.console.log('Pike LSP Server initialized');
    connection.client.register(DidChangeConfigurationNotification.type, undefined);

    // Register health check command handler
    connection.onExecuteCommand(async (params) => {
        if (params.command === 'pike.lsp.showDiagnostics') {
            const health = await bridgeManager?.getHealth();

            // Format health status as readable output
            const lines: string[] = [];
            lines.push('=== Pike LSP Server Health ===');
            lines.push('');

            if (health) {
                const uptime = Math.floor(health.serverUptime / 1000);
                const uptimeStr = uptime > 60
                    ? `${Math.floor(uptime / 60)}m ${uptime % 60}s`
                    : `${uptime}s`;

                lines.push(`Server Uptime: ${uptimeStr}`);
                lines.push(`Bridge Connected: ${health.bridgeConnected ? 'YES' : 'NO'}`);
                lines.push(`Pike PID: ${health.pikePid ?? 'N/A'}`);
                lines.push(`Pike Version: ${health.pikeVersion ?? 'Unknown'}`);

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

    if (bridgeManager?.bridge && !bridgeManager.bridge.isRunning()) {
        try {
            await bridgeManager.bridge.start();
        } catch {
            // Continue
        }
    }

    // Pre-warm stdlib cache
    if (stdlibIndex && bridgeManager?.bridge) {
        const index = stdlibIndex;
        setImmediate(async () => {
            try {
                await index.preloadCommon();
                const stats = index.getStats();
                connection.console.log(`Stdlib cache pre-warmed: ${stats.moduleCount} modules loaded`);
            } catch {
                // Continue
            }
        });
    }

    // Index workspace
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (workspaceFolders && workspaceFolders.length > 0 && bridgeManager?.bridge) {
        connection.console.log(`Indexing ${workspaceFolders.length} workspace folder(s)...`);
        setImmediate(async () => {
            let totalIndexed = 0;
            for (const folder of workspaceFolders) {
                try {
                    const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
                    const indexed = await workspaceIndex.indexDirectory(folderPath, true);
                    totalIndexed += indexed;
                    connection.console.log(`Indexed ${indexed} files from ${folder.name}`);
                } catch {
                    // Continue
                }
            }
            const stats = workspaceIndex.getStats();
            connection.console.log(`Workspace indexing complete: ${stats.documents} files, ${stats.symbols} symbols`);
        });
    }

    // Validate open documents
    const openDocs = documents.all();
    if (openDocs.length > 0) {
        connection.console.log(`Validating ${openDocs.length} already-open documents...`);
        for (const doc of openDocs) {
            await validateDocument(doc);
        }
        connection.console.log('Initial validation complete');
    }
});

connection.onDidChangeConfiguration((change) => {
    const settings = change.settings as { pike?: Partial<PikeSettings> } | undefined;
    globalSettings = {
        ...defaultSettings,
        ...(settings?.pike ?? {}),
    };
    documents.all().forEach(validateDocumentDebounced);
});

// ============================================================================
// Register Feature Handlers (BEFORE documents.listen!)
// ============================================================================

const services = createServices();

features.registerDiagnosticsHandlers(connection, services, documents);
features.registerNavigationHandlers(connection, services, documents);
features.registerEditingHandlers(connection, services, documents);
features.registerSymbolsHandlers(connection, services);
features.registerHierarchyHandlers(connection, services, documents);
features.registerAdvancedHandlers(connection, services, documents, globalSettings, includePaths);

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
