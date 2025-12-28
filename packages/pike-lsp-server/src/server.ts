/**
 * Pike LSP Server
 * 
 * Language Server Protocol implementation for Pike.
 * Provides real-time diagnostics, document sync, and symbol extraction.
 */

import {
    createConnection,
    ProposedFeatures,
    InitializeParams,
    InitializeResult,
    TextDocumentSyncKind,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    DidChangeConfigurationNotification,
    DocumentSymbol,
    SymbolKind,
    SymbolInformation,
    Hover,
    MarkupKind,
    Position,
    Location,
    WorkspaceSymbolParams,
    CompletionItem,
    CompletionItemKind,
    CompletionItemTag,
    InsertTextFormat,

    SignatureHelp,
    SignatureInformation,
    ParameterInformation,
    TextEdit,
    Range,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    TypeHierarchyItem,
    SemanticTokensBuilder,
    SemanticTokensLegend,
    DocumentHighlight,
    DocumentHighlightKind,
    FoldingRange,
    FoldingRangeKind,
    InlayHint,
    InlayHintKind,
    SelectionRange,
    CodeAction,
    CodeActionKind,
    DocumentLink,
    CodeLens,
} from 'vscode-languageserver/node.js';

import { TextDocument } from 'vscode-languageserver-textdocument';
import * as fs from 'fs/promises';
import { PikeBridge, PikeSymbol, PikeDiagnostic, PikeFunctionType, IntrospectedSymbol } from '@pike-lsp/pike-bridge';
import { WorkspaceIndex } from './workspace-index.js';
import { TypeDatabase, CompiledProgramInfo } from './type-database.js';
import { StdlibIndexManager } from './stdlib-index.js';
import { DEFAULT_MAX_PROBLEMS, DIAGNOSTIC_DELAY_DEFAULT, LSP } from './constants/index.js';
import {
    INDENT_PATTERNS,
    IDENTIFIER_PATTERNS,
    PATH_PATTERNS,
    PatternHelpers
} from './utils/regex-patterns.js';

// Create connection using Node's IPC
const connection = createConnection(ProposedFeatures.all);

// Create document manager
const documents = new TextDocuments(TextDocument);

// Pike bridge for parsing and compilation
let bridge: PikeBridge | null = null;

// Type database for compiled programs and type inference
const typeDatabase = new TypeDatabase();

// Stdlib index manager for lazy loading
// Will be used in Phase 3 for stdlib navigation and completions
let stdlibIndex: StdlibIndexManager | null = null;

// Export for potential future use
export { stdlibIndex };

// Workspace symbol index
const workspaceIndex = new WorkspaceIndex();

// Document cache for parsed symbols
interface DocumentCache {
    version: number;
    symbols: PikeSymbol[];
    diagnostics: Diagnostic[];
    // Symbol position index for O(1) lookups: symbol_name -> positions[]
    symbolPositions: Map<string, Position[]>;
}
const documentCache = new Map<string, DocumentCache>();

// Configuration
interface PikeSettings {
    pikePath: string;
    maxNumberOfProblems: number;
    diagnosticDelay: number;
}

const defaultSettings: PikeSettings = {
    pikePath: 'pike',
    maxNumberOfProblems: DEFAULT_MAX_PROBLEMS,
    diagnosticDelay: DIAGNOSTIC_DELAY_DEFAULT,
};

let globalSettings: PikeSettings = defaultSettings;

// Debounce timers for validation
const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Semantic tokens legend for rich syntax highlighting
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
const semanticTokensLegend: SemanticTokensLegend = {
    tokenTypes,
    tokenModifiers
};

connection.onInitialize(async (params: InitializeParams): Promise<InitializeResult> => {
    connection.console.log('Pike LSP Server initializing...');

    // Initialize Pike bridge
    const initOptions = params.initializationOptions as { pikePath?: string } | undefined;
    bridge = new PikeBridge({
        pikePath: initOptions?.pikePath ?? 'pike',
    });

    // Initialize stdlib index manager
    stdlibIndex = new StdlibIndexManager(bridge);

    // Log bridge stderr
    bridge.on('stderr', (msg: string) => {
        connection.console.log(`[Pike] ${msg}`);
    });

    // Check if Pike is available
    try {
        const available = await bridge.checkPike();
        if (!available) {
            connection.console.warn('Pike executable not found. Some features may not work.');
        } else {
            await bridge.start();
            connection.console.log('Pike bridge started');
        }
    } catch (err) {
        connection.console.error(`Failed to start Pike bridge: ${err}`);
    }

    // Set up workspace index with error reporting to LSP connection
    if (bridge) {
        workspaceIndex.setBridge(bridge);
    }
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
                legend: semanticTokensLegend,
                full: true,
            },
            codeActionProvider: {
                codeActionKinds: ['quickfix', 'source.organizeImports'],
            },
            documentFormattingProvider: true,
            documentRangeFormattingProvider: true,
            documentLinkProvider: { resolveProvider: true },
            codeLensProvider: { resolveProvider: true },
        },
    };
});

connection.onInitialized(async () => {
    connection.console.log('Pike LSP Server initialized');

    // Register for configuration changes
    connection.client.register(DidChangeConfigurationNotification.type, undefined);

    // Start the Pike bridge if not already started
    if (bridge && !bridge.isRunning()) {
        try {
            await bridge.start();
            connection.console.log('Pike bridge started');

            // PERF-004: Pre-warm stdlib cache with common modules
            setImmediate(async () => {
                try {
                    if (stdlibIndex) {
                        await stdlibIndex.preloadCommon();
                        const stats = stdlibIndex.getStats();
                        connection.console.log(`Stdlib cache pre-warmed: ${stats.moduleCount} modules loaded`);
                    }
                } catch (err) {
                    connection.console.error(`Failed to pre-warm stdlib cache: ${err}`);
                }
            });
        } catch (err) {
            connection.console.error(`Failed to start Pike bridge: ${err}`);
        }
    } else if (bridge && bridge.isRunning()) {
        // Bridge already running, pre-warm stdlib cache
        setImmediate(async () => {
            try {
                if (stdlibIndex) {
                    await stdlibIndex.preloadCommon();
                    const stats = stdlibIndex.getStats();
                    connection.console.log(`Stdlib cache pre-warmed: ${stats.moduleCount} modules loaded`);
                }
            } catch (err) {
                connection.console.error(`Failed to pre-warm stdlib cache: ${err}`);
            }
        });
    }

    // Index workspace folders in background
    const workspaceFolders = await connection.workspace.getWorkspaceFolders();
    if (workspaceFolders && workspaceFolders.length > 0 && bridge) {
        connection.console.log(`Indexing ${workspaceFolders.length} workspace folder(s)...`);

        // Index in background without blocking initialization
        setImmediate(async () => {
            let totalIndexed = 0;
            for (const folder of workspaceFolders) {
                try {
                    const folderPath = decodeURIComponent(folder.uri.replace(/^file:\/\//, ''));
                    const indexed = await workspaceIndex.indexDirectory(folderPath, true);
                    totalIndexed += indexed;
                    connection.console.log(`Indexed ${indexed} files from ${folder.name}`);
                } catch (err) {
                    connection.console.error(`Failed to index ${folder.name}: ${err}`);
                }
            }
            const stats = workspaceIndex.getStats();
            connection.console.log(`Workspace indexing complete: ${stats.documents} files, ${stats.symbols} symbols`);
        });
    }

    // Validate any documents that are already open
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

    // Revalidate all open documents
    documents.all().forEach(validateDocumentDebounced);
});

// Handle document open - validate immediately without debouncing
documents.onDidOpen((event) => {
    connection.console.log(`Document opened: ${event.document.uri}`);
    validateDocument(event.document);
});

// Handle document changes
documents.onDidChangeContent((change) => {
    validateDocumentDebounced(change.document);
});

// Handle document save
documents.onDidSave((event) => {
    // Validate immediately on save
    validateDocument(event.document);
});

// Handle document close
documents.onDidClose((event) => {
    // Clear cache for closed document
    documentCache.delete(event.document.uri);

    // Clear from type database
    typeDatabase.removeProgram(event.document.uri);

    // Clear from workspace index
    workspaceIndex.removeDocument(event.document.uri);

    // Clear any pending validation timer
    const timer = validationTimers.get(event.document.uri);
    if (timer) {
        clearTimeout(timer);
        validationTimers.delete(event.document.uri);
    }

    // Clear diagnostics for closed document
    connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

/**
 * PERF-001: Build symbol position index for O(1) lookups
 * Uses Pike tokenization for accuracy and performance
 */
async function buildSymbolPositionIndex(text: string, symbols: PikeSymbol[]): Promise<Map<string, Position[]>> {
    const index = new Map<string, Position[]>();

    // Build set of symbol names we care about
    const symbolNames = new Set<string>();
    for (const symbol of symbols) {
        if (symbol.name) {
            symbolNames.add(symbol.name);
        }
    }

    // Try Pike-based tokenization first (PERF-001)
    if (bridge?.isRunning()) {
        try {
            const result = await bridge.findOccurrences(text);

            // Group occurrences by symbol name
            for (const occ of result.occurrences) {
                if (symbolNames.has(occ.text)) {
                    const pos: Position = {
                        line: occ.line - 1, // Convert 1-indexed to 0-indexed
                        character: occ.character,
                    };

                    if (!index.has(occ.text)) {
                        index.set(occ.text, []);
                    }
                    index.get(occ.text)!.push(pos);
                }
            }

            // If we found all our symbols, return early
            if (index.size === symbolNames.size) {
                return index;
            }
        } catch (err) {
            // Log error details before falling back to regex
            console.error(`[Pike LSP] Token-based symbol position finding failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // Fallback: Regex-based search (original implementation)
    return buildSymbolPositionIndexRegex(text, symbols);
}

/**
 * Fallback regex-based symbol position finding
 * Used when Pike tokenization is unavailable
 */
function buildSymbolPositionIndexRegex(text: string, symbols: PikeSymbol[]): Map<string, Position[]> {
    const index = new Map<string, Position[]>();
    const lines = text.split('\n');

    // Helper to check if position is inside comment
    const isInsideComment = (line: string, charPos: number): boolean => {
        const trimmed = line.trimStart();
        if (PatternHelpers.isCommentLine(trimmed)) {
            return true;
        }
        const lineCommentPos = line.indexOf('//');
        if (lineCommentPos >= 0 && lineCommentPos < charPos) {
            return true;
        }
        const blockOpenPos = line.lastIndexOf('/*', charPos);
        if (blockOpenPos >= 0) {
            const blockClosePos = line.indexOf('*/', blockOpenPos);
            if (blockClosePos < 0 || blockClosePos > charPos) {
                return true;
            }
        }
        return false;
    };

    // Index all symbol names and their positions
    for (const symbol of symbols) {
        // Skip symbols with null names (can occur with certain Pike constructs)
        if (!symbol.name) {
            continue;
        }

        const positions: Position[] = [];

        // Search for all occurrences of the symbol name
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;

            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(symbol.name, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + symbol.name.length < line.length ?
                    line[matchIndex + symbol.name.length] : ' ';

                // Check for word boundary
                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    // Skip comments
                    if (!isInsideComment(line, matchIndex)) {
                        positions.push({
                            line: lineNum,
                            character: matchIndex,
                        });
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

/**
 * Flatten nested symbol tree into a single-level array
 * This ensures all class members are indexed at the document level
 */
function flattenSymbols(symbols: PikeSymbol[], parentName = ''): PikeSymbol[] {
    const flat: PikeSymbol[] = [];

    for (const sym of symbols) {
        // Add the symbol itself
        flat.push(sym);

        // Recursively flatten children with qualified names
        if (sym.children && sym.children.length > 0) {
            const qualifiedPrefix = parentName ? `${parentName}.${sym.name}` : sym.name;

            for (const child of sym.children) {
                // Create a copy with qualified name for easier lookup
                const childWithQualName = {
                    ...child,
                    // Store qualified name for namespaced lookup
                    qualifiedName: `${qualifiedPrefix}.${child.name}`
                };
                flat.push(childWithQualName);

                // Recursively handle nested children
                if (child.children && child.children.length > 0) {
                    flat.push(...flattenSymbols(child.children, qualifiedPrefix));
                }
            }
        }
    }

    return flat;
}

/**
 * Validate document with debouncing
 */
function validateDocumentDebounced(document: TextDocument): void {
    const uri = document.uri;

    // Clear existing timer
    const existingTimer = validationTimers.get(uri);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
        validationTimers.delete(uri);
        validateDocument(document);
    }, globalSettings.diagnosticDelay);

    validationTimers.set(uri, timer);
}

/**
 * Validate document and send diagnostics
 */
async function validateDocument(document: TextDocument): Promise<void> {
    const uri = document.uri;
    connection.console.log(`[VALIDATE] Starting validation for: ${uri}`);

    if (!bridge) {
        connection.console.error('[VALIDATE] Bridge is null!');
        return;
    }

    if (!bridge.isRunning()) {
        connection.console.warn('[VALIDATE] Bridge not running, attempting to start...');
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

    connection.console.log(`[VALIDATE] Document version: ${version}, length: ${text.length} chars`);

    // Extract filename from URI and decode URL encoding
    const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

    try {
        connection.console.log(`[VALIDATE] Calling bridge.introspect for: ${filename}`);
        // Use introspection for compilation + type extraction
        const introspectResult = await bridge.introspect(text, filename);
        connection.console.log(`[VALIDATE] Introspection result - success: ${introspectResult.success}, symbols: ${introspectResult.symbols.length}`);

        // Always parse to get position info (needed for LSP features)
        const parseResult = await bridge.parse(text, filename);
        connection.console.log(`[VALIDATE] Parse result - symbols: ${parseResult.symbols.length}, diagnostics: ${parseResult.diagnostics.length}`);

        // Convert Pike diagnostics to LSP diagnostics
        const diagnostics: Diagnostic[] = [];

        // Patterns for module resolution errors we should skip
        const skipPatterns = [
            /Index .* not present in module/i,
            /Indexed module was:/i,
            /Illegal program identifier/i,
            /Not a valid program specifier/i,
            /Failed to evaluate constant expression/i,
        ];

        const shouldSkipDiagnostic = (msg: string): boolean => {
            return skipPatterns.some(pattern => pattern.test(msg));
        };

        // Process diagnostics from introspection
        for (const pikeDiag of introspectResult.diagnostics) {
            if (diagnostics.length >= globalSettings.maxNumberOfProblems) {
                break;
            }
            // Skip module resolution errors
            if (shouldSkipDiagnostic(pikeDiag.message)) {
                continue;
            }
            diagnostics.push(convertDiagnostic(pikeDiag, document));
        }

        // Update type database with introspected symbols if compilation succeeded
        if (introspectResult.success && introspectResult.symbols.length > 0) {
            // Convert introspected symbols to Maps
            const symbolMap = new Map(introspectResult.symbols.map(s => [s.name, s]));
            const functionMap = new Map(introspectResult.functions.map(s => [s.name, s]));
            const variableMap = new Map(introspectResult.variables.map(s => [s.name, s]));
            const classMap = new Map(introspectResult.classes.map(s => [s.name, s]));

            // Estimate size
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

            // Also update legacy cache for backward compatibility
            // Merge introspected symbols with parse symbols to get position info
            const legacySymbols: PikeSymbol[] = [];

            if (parseResult) {
                // Flatten nested symbols to include class members
                // This ensures get_n, get_e, set_random etc. are indexed
                const flatParseSymbols = flattenSymbols(parseResult.symbols);

                connection.console.log(`[VALIDATE] Flattened ${parseResult.symbols.length} symbols to ${flatParseSymbols.length} total (including class members)`);

                // For each parsed symbol (including nested), enrich with type info from introspection
                for (const parsedSym of flatParseSymbols) {
                    // Skip symbols with null names
                    if (!parsedSym.name) continue;

                    const introspectedSym = introspectResult.symbols.find(s => s.name === parsedSym.name);
                    if (introspectedSym) {
                        // Merge: position from parse, type from introspection
                        legacySymbols.push({
                            ...parsedSym,
                            type: introspectedSym.type,
                            modifiers: introspectedSym.modifiers,
                        });
                    } else {
                        // Only in parse results
                        legacySymbols.push(parsedSym);
                    }
                }

                // Add any introspected symbols not in parse results
                for (const introspectedSym of introspectResult.symbols) {
                    // Skip symbols with null names
                    if (!introspectedSym.name) continue;

                    const inParse = parseResult.symbols.some(s => s.name === introspectedSym.name);
                    if (!inParse) {
                        legacySymbols.push({
                            name: introspectedSym.name,
                            kind: introspectedSym.kind as any,
                            modifiers: introspectedSym.modifiers,
                            type: introspectedSym.type,
                        });
                    }
                }
            } else {
                // No parse results, use introspection only (no positions)
                for (const s of introspectResult.symbols) {
                    // Skip symbols with null names
                    if (!s.name) continue;

                    legacySymbols.push({
                        name: s.name,
                        kind: s.kind as any,
                        modifiers: s.modifiers,
                        type: s.type,
                    });
                }
            }

            documentCache.set(uri, {
                version,
                symbols: legacySymbols,
                diagnostics,
                symbolPositions: await buildSymbolPositionIndex(text, legacySymbols),
            });
        } else if (parseResult) {
            // Introspection failed, use parse results
            connection.console.log(`[VALIDATE] Using parse result with ${parseResult.symbols.length} symbols`);
            // Log first few symbol names for debugging
            for (let i = 0; i < Math.min(5, parseResult.symbols.length); i++) {
                const sym = parseResult.symbols[i];
                if (sym) {
                    connection.console.log(`[VALIDATE]   Symbol ${i}: name="${sym.name}", kind=${sym.kind}`);
                }
            }
            documentCache.set(uri, {
                version,
                symbols: parseResult.symbols,
                diagnostics,
                symbolPositions: await buildSymbolPositionIndex(text, parseResult.symbols),
            });
            connection.console.log(`[VALIDATE] Cached document - symbols count: ${parseResult.symbols.length}`);
        } else {
            connection.console.log(`[VALIDATE] No parse result available - features will not work`);
        }

        // Analyze for uninitialized variable usage
        try {
            const uninitResult = await bridge.analyzeUninitialized(text, filename);
            if (uninitResult.diagnostics && uninitResult.diagnostics.length > 0) {
                connection.console.log(`[VALIDATE] Found ${uninitResult.diagnostics.length} uninitialized variable warnings`);
                for (const uninitDiag of uninitResult.diagnostics) {
                    if (diagnostics.length >= globalSettings.maxNumberOfProblems) {
                        break;
                    }
                    // Convert uninitialized variable diagnostic to LSP diagnostic
                    diagnostics.push({
                        severity: DiagnosticSeverity.Warning,
                        range: {
                            start: {
                                line: Math.max(0, (uninitDiag.position?.line ?? 1) - 1),
                                character: Math.max(0, uninitDiag.position?.character ?? 0),
                            },
                            end: {
                                line: Math.max(0, (uninitDiag.position?.line ?? 1) - 1),
                                character: Math.max(0, (uninitDiag.position?.character ?? 0) + (uninitDiag.variable?.length ?? 1)),
                            },
                        },
                        message: uninitDiag.message,
                        source: 'pike-uninitialized',
                    });
                }
            }
        } catch (err) {
            connection.console.warn(`[VALIDATE] Uninitialized variable analysis failed: ${err}`);
            // Don't fail validation if this analysis fails
        }

        // Send diagnostics
        connection.sendDiagnostics({ uri, diagnostics });
        connection.console.log(`[VALIDATE] Sent ${diagnostics.length} diagnostics`);

        // Log memory stats periodically
        const stats = typeDatabase.getMemoryStats();
        if (stats.programCount % 10 === 0 && stats.programCount > 0) {
            connection.console.log(
                `Type DB: ${stats.programCount} programs, ${stats.symbolCount} symbols, ` +
                `${(stats.totalBytes / 1024 / 1024).toFixed(1)}MB (${stats.utilizationPercent.toFixed(1)}%)`
            );
        }

        connection.console.log(`[VALIDATE] ✓ Validation complete for ${uri}`);

    } catch (err) {
        connection.console.error(`[VALIDATE] ✗ Validation failed for ${uri}: ${err}`);
    }
}

/**
 * Convert Pike diagnostic to LSP diagnostic
 */
function convertDiagnostic(pikeDiag: PikeDiagnostic, document: TextDocument): Diagnostic {
    const line = Math.max(0, (pikeDiag.position.line ?? 1) - 1);

    // Get the line text to determine range
    const text = document.getText();
    const lines = text.split('\n');
    const lineText = lines[line] ?? '';

    // Find meaningful range within the line (skip whitespace and comments)
    let startChar = pikeDiag.position.column ? pikeDiag.position.column - 1 : 0;
    let endChar = lineText.length;

    // If no specific column, find the first non-whitespace character
    if (!pikeDiag.position.column) {
        const trimmedStart = lineText.search(/\S/);
        if (trimmedStart >= 0) {
            startChar = trimmedStart;
        }
    }

    // Check if the line is a comment - if so, try to find the actual error line
    const trimmedLine = lineText.trim();
    if (PatternHelpers.isCommentLine(trimmedLine)) {
        // This line is a comment, look for the next non-comment line for highlighting
        // Or just use a minimal range to avoid confusing the user
        for (let i = line + 1; i < lines.length && i < line + 5; i++) {
            const nextLine = lines[i]?.trim() ?? '';
            if (nextLine && PatternHelpers.isNotCommentLine(nextLine)) {
                // Found a code line, but don't change the position - just use minimal highlight
                break;
            }
        }
        // For comment lines, only highlight a small portion (first 10 chars after whitespace)
        endChar = Math.min(startChar + 10, lineText.length);
    }

    // Ensure endChar is reasonable (highlight at least 1 char, at most the line length)
    if (endChar <= startChar) {
        endChar = Math.min(startChar + Math.max(1, lineText.trim().length), lineText.length);
    }

    return {
        severity: convertSeverity(pikeDiag.severity),
        range: {
            start: { line, character: startChar },
            end: { line, character: endChar },
        },
        message: pikeDiag.message,
        source: 'pike',
    };
}

/**
 * Convert Pike severity to LSP severity
 */
function convertSeverity(severity: string): DiagnosticSeverity {
    switch (severity) {
        case 'error':
            return DiagnosticSeverity.Error;
        case 'warning':
            return DiagnosticSeverity.Warning;
        case 'info':
            return DiagnosticSeverity.Information;
        default:
            return DiagnosticSeverity.Error;
    }
}

/**
 * Document symbols handler
 */
connection.onDocumentSymbol((params): DocumentSymbol[] | null => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);

    if (!cached || !cached.symbols) {
        return null;
    }

    // Filter out invalid symbols and convert
    return cached.symbols
        .filter(s => s && s.name)
        .map(convertSymbol);
});

/**
 * Hover handler - show type info and documentation
 */
connection.onHover(async (params): Promise<Hover | null> => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    // Get word at cursor (including dots for module paths)
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    let wordStart = offset;
    let wordEnd = offset;
    while (wordStart > 0 && /[\w.]/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
    }
    while (wordEnd < text.length && /[\w.]/.test(text[wordEnd] ?? '')) {
        wordEnd++;
    }
    const word = text.slice(wordStart, wordEnd);

    // Check if hovering over a qualified symbol reference (e.g., "MIME.encode_base64url")
    if (word && word.includes('.') && stdlibIndex) {
        try {
            // Extract current file path for module resolution
            const currentFile = decodeURIComponent(uri.replace(/^file:\/\//, ''));

            // Try parsing as a qualified symbol reference (Module.symbol)
            const lastDotIndex = word.lastIndexOf('.');
            if (lastDotIndex > 0) {
                const modulePath = word.substring(0, lastDotIndex);
                const symbolName = word.substring(lastDotIndex + 1);

                connection.console.log(`[HOVER] Qualified symbol: module="${modulePath}", symbol="${symbolName}"`);

                // Get the module from stdlib index to verify it exists and get the path
                const module = await stdlibIndex.getModule(modulePath);
                if (module?.symbols) {
                    // Verify the symbol exists
                    const introspectedSymbol = module.symbols.get(symbolName);
                    if (introspectedSymbol) {
                        connection.console.log(`[HOVER] Found ${symbolName} in ${modulePath}`);

                        // Get the resolved path to the module file
                        const targetPath = module.resolvedPath
                            ? module.resolvedPath
                            : bridge ? await bridge.resolveModule(modulePath, currentFile) : null;

                        if (targetPath) {
                            // Clean path - remove line number suffix if present
                            const cleanPath = targetPath.split(':')[0] ?? targetPath;
                            const targetUri = `file://${cleanPath}`;

                            // Check if the target document is already open and cached
                            const targetCached = documentCache.get(targetUri);

                            let hoverSymbol: PikeSymbol | null = null;

                            if (targetCached) {
                                // Search for the symbol in the cached document's symbols (has full type info)
                                const targetSymbol = findSymbolByName(targetCached.symbols, symbolName);
                                if (targetSymbol) {
                                    connection.console.log(`[HOVER] Using cached symbol with full type info`);
                                    hoverSymbol = targetSymbol;
                                }
                            }

                            // Document not in cache - parse it to get the symbol with full type info
                            if (!hoverSymbol && bridge) {
                                try {
                                    // Read the file content
                                    const code = await fs.readFile(cleanPath, 'utf-8');
                                    const parseResult = await bridge.parse(code, cleanPath);

                                    // Search in parsed symbols
                                    const foundSymbol = findSymbolByName(parseResult.symbols, symbolName);
                                    if (foundSymbol) {
                                        connection.console.log(`[HOVER] Found symbol with full type info by parsing`);
                                        hoverSymbol = foundSymbol;
                                    }
                                } catch (parseErr) {
                                    connection.console.log(`[HOVER] Failed to parse target file: ${parseErr}`);
                                }
                            }

                            // If we found the symbol, use it for hover (has full type signature)
                            if (hoverSymbol) {
                                // Merge with introspected documentation if available
                                if (introspectedSymbol.documentation) {
                                    (hoverSymbol as unknown as Record<string, unknown>)['documentation'] = introspectedSymbol.documentation;
                                }

                                const content = buildHoverContent(hoverSymbol);
                                if (content) {
                                    return {
                                        contents: { kind: MarkupKind.Markdown, value: content }
                                    };
                                }
                            }

                            // Fallback: use introspected symbol (limited type info but better than nothing)
                            const fallbackSymbol: PikeSymbol = {
                                name: introspectedSymbol.name,
                                kind: introspectedSymbol.kind === 'function' ? 'method' : introspectedSymbol.kind,
                                modifiers: introspectedSymbol.modifiers,
                                type: introspectedSymbol.type,
                            };

                            if (introspectedSymbol.documentation) {
                                (fallbackSymbol as unknown as Record<string, unknown>)['documentation'] = introspectedSymbol.documentation;
                            }

                            const content = buildHoverContent(fallbackSymbol);
                            if (content) {
                                return {
                                    contents: { kind: MarkupKind.Markdown, value: content }
                                };
                            }
                        }
                    }
                }
            }

            // Fallback: Try treating the entire word as a module name
            const fallbackModule = await stdlibIndex.getModule(word);
            if (fallbackModule?.symbols && fallbackModule.symbols.size > 0) {
                const parts: string[] = [];
                parts.push(`**Module**: \`${word}\``);
                parts.push('');
                parts.push(`Exported symbols: ${fallbackModule.symbols.size}`);

                if (fallbackModule.resolvedPath) {
                    const pathDisplay = fallbackModule.resolvedPath.replace(/:\d+$/, '');
                    parts.push('');
                    parts.push(`*Source*: ${pathDisplay}`);
                }

                return {
                    contents: {
                        kind: MarkupKind.Markdown,
                        value: parts.join('\n'),
                    },
                };
            }
        } catch (err) {
            // Not a stdlib module or resolution failed, continue with local symbol search
            console.error(`[Pike LSP] Stdlib hover resolution failed for "${word}": ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    // NEW: Check for member access (file->method, obj.method)
    if (stdlibIndex) {
        const memberContext = detectMemberAccessContext(document, params.position, cached.symbols);
        if (memberContext?.typeName && memberContext.memberName) {
            const stdlibSymbol = await getStdlibSymbol(
                memberContext.typeName,
                memberContext.memberName,
                stdlibIndex
            );
            if (stdlibSymbol) {
                // Convert IntrospectedSymbol to PikeSymbol for buildHoverContent
                const hoverSymbol: PikeSymbol = {
                    name: stdlibSymbol.name,
                    kind: stdlibSymbol.kind === 'function' ? 'method' : stdlibSymbol.kind,
                    modifiers: stdlibSymbol.modifiers,
                    type: stdlibSymbol.type,
                };

                // Add documentation if present
                if (stdlibSymbol.documentation) {
                    (hoverSymbol as unknown as Record<string, unknown>)['documentation'] = stdlibSymbol.documentation;
                }

                const content = buildHoverContent(hoverSymbol);
                if (content) {
                    return {
                        contents: { kind: MarkupKind.Markdown, value: content }
                    };
                }
            }
        }
    }

    // Find symbol at position
    const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
    if (!symbol) {
        return null;
    }

    // Build hover content
    const content = buildHoverContent(symbol);
    if (!content) {
        return null;
    }

    return {
        contents: {
            kind: MarkupKind.Markdown,
            value: content,
        },
    };
});

/**
 * Definition handler - go to symbol definition
 * If cursor is already on a definition, returns usages of that symbol instead
 */
connection.onDefinition(async (params): Promise<Location | Location[] | null> => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    // Get the word/expression at cursor (including dots for module paths)
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // First, get the full dotted path (e.g., Crypto.Sign.RSA)
    let pathStart = offset;
    let pathEnd = offset;
    while (pathStart > 0 && /[\w.]/.test(text[pathStart - 1] ?? '')) {
        pathStart--;
    }
    while (pathEnd < text.length && /[\w.]/.test(text[pathEnd] ?? '')) {
        pathEnd++;
    }
    const fullPath = text.slice(pathStart, pathEnd);

    if (!fullPath) {
        return null;
    }

    // Now determine which specific component the cursor is on
    // For "Crypto.Sign", if cursor is on "Crypto", resolve only "Crypto"
    // If cursor is on "Sign", resolve "Crypto.Sign"
    // For ".SHA256" (local module), preserve the leading dot
    const isLocalModule = fullPath.startsWith('.');
    const components = fullPath.split('.');
    let resolvedPath = '';
    let currentPos = pathStart;

    for (const component of components) {
        const componentEnd = currentPos + component.length;
        if (offset >= currentPos && offset <= componentEnd) {
            // Cursor is on this component
            if (component === '' && isLocalModule) {
                // Empty component at start means we're on the leading dot
                // Continue to include the next component
                currentPos = componentEnd + 1;
                continue;
            }
            resolvedPath = resolvedPath ? `${resolvedPath}.${component}` : component;
            break;
        }
        resolvedPath = resolvedPath ? `${resolvedPath}.${component}` : component;
        currentPos = componentEnd + 1; // +1 for the dot
    }

    // Preserve leading dot for local modules
    let word = resolvedPath || fullPath;
    if (isLocalModule && !word.startsWith('.')) {
        word = '.' + word;
    }

    if (!word) {
        return null;
    }

    connection.console.log(`[DEFINITION] Full path: ${fullPath}, cursor on: ${word}`);
    connection.console.log(`[DEFINITION] Cached document has ${cached.symbols.length} symbols`);

    // Check if word exists in cached symbols
    const symbolNames = cached.symbols.map(s => s.name).filter(n => n);
    connection.console.log(`[DEFINITION] Symbol names: ${symbolNames.slice(0, 20).join(', ')}${symbolNames.length > 20 ? '...' : ''}`);
    const hasWord = cached.symbols.some(s => s.name === word);
    connection.console.log(`[DEFINITION] Cache contains "${word}": ${hasWord}`);

    // Helper to convert Pike path to proper file:// URI with optional line navigation
    const pikePathToUri = (pikePath: string): { uri: string; line?: number } => {
        // Pike paths can have :line_number suffix (e.g., "/path/to/file.pike:123")
        const match = pikePath.match(PATH_PATTERNS.PIKE_PATH_WITH_LINE);
        if (match && match[1] && match[2]) {
            const filePath = match[1];
            const lineStr = match[2];
            return {
                uri: `file://${filePath}`,
                line: parseInt(lineStr, 10) - 1, // Convert to 0-based
            };
        }
        return { uri: `file://${pikePath}` };
    };

    // Try Pike's native module resolution - it handles both stdlib and user modules
    if (bridge) {
        try {
            // Extract filename from URI for context-aware resolution
            const currentFile = decodeURIComponent(uri.replace(/^file:\/\//, ''));

            // Check if this is a qualified symbol reference (e.g., "MIME.encode_base64url")
            const lastDotIndex = word.lastIndexOf('.');
            if (lastDotIndex > 0 && stdlibIndex) {
                // Split into module path and symbol name
                const modulePath = word.substring(0, lastDotIndex);
                const symbolName = word.substring(lastDotIndex + 1);

                connection.console.log(`[DEFINITION] Qualified symbol: module="${modulePath}", symbol="${symbolName}"`);

                // Get the module from stdlib index to verify it exists and get the path
                const module = await stdlibIndex.getModule(modulePath);
                if (module?.symbols) {
                    // Verify the symbol exists
                    const symbol = module.symbols.get(symbolName);
                    if (symbol) {
                        connection.console.log(`[DEFINITION] Found ${symbolName} in ${modulePath}`);

                        // Get the resolved path to the module file
                        const targetPath = module.resolvedPath
                            ? module.resolvedPath
                            : await bridge.resolveModule(modulePath, currentFile);

                        if (targetPath) {
                            // Clean path - remove line number suffix if present
                            const cleanPath = targetPath.split(':')[0] ?? targetPath;
                            const targetUri = `file://${cleanPath}`;

                            // Check if the target document is already open and cached
                            const targetCached = documentCache.get(targetUri);

                            if (targetCached) {
                                // Search for the symbol in the cached document's symbols
                                const targetSymbol = findSymbolByName(targetCached.symbols, symbolName);
                                if (targetSymbol?.position) {
                                    const symbolLine = Math.max(0, targetSymbol.position.line - 1);
                                    connection.console.log(`[DEFINITION] Found ${symbolName} at line ${symbolLine + 1} in cached document`);
                                    return {
                                        uri: targetUri,
                                        range: {
                                            start: { line: symbolLine, character: 0 },
                                            end: { line: symbolLine, character: symbolName.length },
                                        },
                                    };
                                }
                            }

                            // Document not in cache - parse it to find the symbol
                            if (bridge) {
                                try {
                                    // Read the file content
                                    const code = await fs.readFile(cleanPath, 'utf-8');
                                    const parseResult = await bridge.parse(code, cleanPath);

                                    // Search in parsed symbols
                                    const foundSymbol = findSymbolByName(parseResult.symbols, symbolName);
                                    if (foundSymbol?.position) {
                                        const symbolLine = Math.max(0, foundSymbol.position.line - 1);
                                        connection.console.log(`[DEFINITION] Found ${symbolName} at line ${symbolLine + 1} by parsing`);
                                        return {
                                            uri: targetUri,
                                            range: {
                                                start: { line: symbolLine, character: 0 },
                                                end: { line: symbolLine, character: symbolName.length },
                                            },
                                        };
                                    }
                                } catch (parseErr) {
                                    connection.console.log(`[DEFINITION] Failed to parse target file: ${parseErr}`);
                                }
                            }

                            // Fallback: return the start of the file
                            const { uri, line } = pikePathToUri(targetPath);
                            const targetLine = line ?? 0;
                            return {
                                uri,
                                range: {
                                    start: { line: targetLine, character: 0 },
                                    end: { line: targetLine, character: symbolName.length },
                                },
                            };
                        }
                    } else {
                        connection.console.log(`[DEFINITION] Symbol ${symbolName} not found in module ${modulePath}`);
                    }
                }
            }

            // Pike's master()->resolv() knows best - just ask it!
            const resolved = await bridge.resolveModule(word, currentFile);
            if (resolved) {
                connection.console.log(`[DEFINITION] Pike resolved ${word} to ${resolved}`);
                const { uri, line } = pikePathToUri(resolved);
                const targetLine = line ?? 0;
                return {
                    uri,
                    range: {
                        start: { line: targetLine, character: 0 },
                        end: { line: targetLine, character: 0 },
                    },
                };
            }
        } catch (err) {
            connection.console.log(`[DEFINITION] Pike resolution failed for ${word}: ${err}`);
        }
    }

    // NEW: Check for member access (file->method, obj.method)
    if (stdlibIndex) {
        const memberContext = detectMemberAccessContext(document, params.position, cached.symbols);
        if (memberContext?.typeName && memberContext.memberName) {
            // Get the module to find its source location
            const module = await stdlibIndex.getModule(memberContext.typeName);
            if (module?.resolvedPath) {
                // Parse line number from path if present (e.g., "file.c:123")
                const [filePath, lineStr] = module.resolvedPath.split(':');
                const line = lineStr ? parseInt(lineStr, 10) - 1 : 0;

                connection.console.log(`[DEFINITION] Resolved ${memberContext.memberName} to ${memberContext.typeName} in ${filePath}:${line + 1}`);

                return {
                    uri: `file://${filePath}`,
                    range: {
                        start: { line: Math.max(0, line), character: 0 },
                        end: { line: Math.max(0, line), character: memberContext.memberName.length },
                    },
                };
            }
        }
    }

    // Check if we're on a symbol definition
    const symbolAtPosition = cached.symbols.find(s => {
        if (s.name !== word || !s.position) return false;
        const symbolLine = s.position.line - 1;
        return symbolLine === params.position.line;
    });

    // If we're on a definition, return all usages instead
    if (symbolAtPosition) {
        const usages: Location[] = [];

        // Use symbol position index for O(1) lookup in current document
        const positions = cached.symbolPositions.get(word);
        if (positions) {
            for (const pos of positions) {
                // Skip the definition itself
                const isDefinition = pos.line === params.position.line &&
                    pos.character <= params.position.character &&
                    pos.character + word.length >= params.position.character;

                if (!isDefinition) {
                    usages.push({
                        uri,
                        range: {
                            start: pos,
                            end: { line: pos.line, character: pos.character + word.length },
                        },
                    });
                }
            }
        }

        // Also search in other open documents using their indexes
        for (const [otherUri, otherCached] of documentCache) {
            if (otherUri === uri) continue;

            const otherPositions = otherCached.symbolPositions.get(word);
            if (otherPositions) {
                for (const pos of otherPositions) {
                    usages.push({
                        uri: otherUri,
                        range: {
                            start: pos,
                            end: { line: pos.line, character: pos.character + word.length },
                        },
                    });
                }
            }
        }

        // Return usages if found, otherwise null (stay on definition)
        if (usages.length > 0) {
            return usages;
        }
        return null;
    }

    // Normal case: find symbol and go to its definition
    const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
    if (!symbol || !symbol.position) {
        connection.console.log(`[DEFINITION] findSymbolAtPosition returned: ${symbol ? 'found but no position' : 'not found'}`);
        return null;
    }

    // Return location of symbol definition
    const line = Math.max(0, (symbol.position.line ?? 1) - 1);
    const result = {
        uri,
        range: {
            start: { line, character: 0 },
            end: { line, character: symbol.name.length },
        },
    };
    connection.console.log(`[DEFINITION] Returning location: ${result.uri}:${result.range.start.line}`);
    return result;
});

/**
 * Declaration handler - navigate to declaration (delegates to definition)
 */
connection.onDeclaration((params): Location | null => {
    // For Pike, declaration and definition are the same
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
    if (!symbol || !symbol.position) {
        return null;
    }

    const line = Math.max(0, (symbol.position.line ?? 1) - 1);
    return {
        uri,
        range: {
            start: { line, character: 0 },
            end: { line, character: symbol.name.length },
        },
    };
});

/**
 * Type definition handler - navigate to type definition
 */
connection.onTypeDefinition((params): Location | null => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
    if (!symbol) {
        return null;
    }

    // For classes, navigate to the class definition
    if (symbol.kind === 'class' && symbol.position) {
        const line = Math.max(0, (symbol.position.line ?? 1) - 1);
        return {
            uri,
            range: {
                start: { line, character: 0 },
                end: { line, character: symbol.name.length },
            },
        };
    }

    // For variables/methods with type info, could navigate to type
    // For now, fall back to symbol position
    if (symbol.position) {
        const line = Math.max(0, (symbol.position.line ?? 1) - 1);
        return {
            uri,
            range: {
                start: { line, character: 0 },
                end: { line, character: symbol.name.length },
            },
        };
    }

    return null;
});

/**
 * Implementation handler - find where a symbol is used (for Ctrl+Click on definitions)
 * When on a definition, shows where it's used; otherwise behaves like references
 */
connection.onImplementation((params): Location[] => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return [];
    }

    // Get the word at the current position
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find word boundaries
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return [];
    }

    // Check if we're on a definition
    const symbolAtPosition = cached.symbols.find(s => {
        if (s.name !== word || !s.position) return false;
        const symbolLine = s.position.line - 1;
        const cursorLine = params.position.line;
        return symbolLine === cursorLine;
    });

    const references: Location[] = [];

    // Search for all occurrences of the word in the current document
    const lines = text.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex: number;

        while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                // If we're on a definition, skip the definition itself
                if (symbolAtPosition && lineNum === params.position.line &&
                    matchIndex <= params.position.character &&
                    matchIndex + word.length >= params.position.character) {
                    // Skip the definition position itself
                } else {
                    references.push({
                        uri,
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + word.length },
                        },
                    });
                }
            }
            searchStart = matchIndex + 1;
        }
    }

    // Also search in other open documents
    for (const [otherUri] of documentCache) {
        if (otherUri === uri) continue;

        const otherDoc = documents.get(otherUri);
        if (!otherDoc) continue;

        const otherText = otherDoc.getText();
        const otherLines = otherText.split('\n');

        for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
            const line = otherLines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    references.push({
                        uri: otherUri,
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + word.length },
                        },
                    });
                }
                searchStart = matchIndex + 1;
            }
        }
    }

    return references;
});

/**
 * Workspace symbol handler - search symbols across workspace (Ctrl+T)
 */
connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
    const query = params.query;

    // Search the workspace index
    const results = workspaceIndex.searchSymbols(query, LSP.MAX_WORKSPACE_SYMBOLS);

    // If workspace index is empty, search open documents
    if (results.length === 0) {
        const allSymbols: SymbolInformation[] = [];
        const queryLower = query?.toLowerCase() ?? '';

        for (const [uri, cached] of documentCache) {
            for (const symbol of cached.symbols) {
                // Skip symbols with null names
                if (!symbol.name) continue;

                if (!query || symbol.name.toLowerCase().includes(queryLower)) {
                    const line = Math.max(0, (symbol.position?.line ?? 1) - 1);
                    allSymbols.push({
                        name: symbol.name,
                        kind: convertSymbolKind(symbol.kind),
                        location: {
                            uri,
                            range: {
                                start: { line, character: 0 },
                                end: { line, character: symbol.name.length },
                            },
                        },
                    });

                    if (allSymbols.length >= LSP.MAX_WORKSPACE_SYMBOLS) {
                        return allSymbols;
                    }
                }
            }
        }

        return allSymbols;
    }

    return results;
});

/**
 * References handler - find all references to a symbol (Find References / Show Usages)
 */
connection.onReferences((params): Location[] => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return [];
    }

    // Get the word at the current position
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find word boundaries
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return [];
    }

    const references: Location[] = [];

    // Search for all occurrences of the word in the current document
    const lines = text.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex: number;

        // Find all occurrences on this line
        while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
            // Check that it's a word boundary (not part of a larger identifier)
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                references.push({
                    uri,
                    range: {
                        start: { line: lineNum, character: matchIndex },
                        end: { line: lineNum, character: matchIndex + word.length },
                    },
                });
            }
            searchStart = matchIndex + 1;
        }
    }

    // Also search in other open documents (for cross-file references)
    for (const [otherUri] of documentCache) {
        if (otherUri === uri) continue;

        const otherDoc = documents.get(otherUri);
        if (!otherDoc) continue;

        const otherText = otherDoc.getText();
        const otherLines = otherText.split('\n');

        for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
            const line = otherLines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    references.push({
                        uri: otherUri,
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + word.length },
                        },
                    });
                }
                searchStart = matchIndex + 1;
            }
        }
    }

    return references;
});

/**
 * Completion handler - provide auto-completion suggestions
 */
connection.onCompletion(async (params): Promise<CompletionItem[]> => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const cached = documentCache.get(uri);

    if (!document) {
        connection.console.log(`[COMPLETION] No document found for ${uri}`);
        return [];
    }

    if (!cached) {
        connection.console.log(`[COMPLETION] No cached document for ${uri}`);
        return [];
    }

    connection.console.log(`[COMPLETION] Cached document has ${cached.symbols.length} symbols`);

    const completions: CompletionItem[] = [];
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Get the text before cursor to determine context
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.slice(lineStart, offset);

    // Determine if we're in a type context or expression context
    // This affects whether class completions show constructor snippets
    const completionContext = getCompletionContext(lineText);
    connection.console.log(`[COMPLETION] Context: ${completionContext}, lineText: "${lineText.slice(-50)}"`);

    // Check for scope operator (::) for special cases like this_program::, this::
    // Note: We use regex here only for these specific Pike keywords
    // For general member access (obj->meth, Module.sub), we use Pike's tokenizer below
    const scopeMatch = lineText.match(IDENTIFIER_PATTERNS.SCOPED_ACCESS);

    if (scopeMatch) {
        // Pike scope operator: this_program::, this::, ParentClass::, etc.
        const scopeName = scopeMatch[1] ?? '';
        const prefix = scopeMatch[2] ?? '';

        connection.console.log(`[COMPLETION] Scope access: ${scopeName}::, prefix: ${prefix}`);

        if ((scopeName === 'this_program' || scopeName === 'this') && cached) {
            // this_program:: or this:: - show local class members
            for (const symbol of cached.symbols) {
                if (symbol.kind === 'method' || symbol.kind === 'variable') {
                    // Skip symbols with null names
                    if (!symbol.name) continue;

                    if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                        completions.push(buildCompletionItem(symbol.name, symbol, 'Local member', cached.symbols, completionContext));
                    }
                }
            }


            // Also add inherited members
            const inherits = cached.symbols.filter(s => s.kind === 'inherit');
            if (stdlibIndex) {
                for (const inheritSymbol of inherits) {
                    const parentName = (inheritSymbol as any).classname ?? inheritSymbol.name;
                    if (parentName) {
                        try {
                            const parentModule = await stdlibIndex.getModule(parentName);
                            if (parentModule?.symbols) {
                                for (const [name, symbol] of parentModule.symbols) {
                                    if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                                        completions.push(buildCompletionItem(name, symbol, `Inherited from ${parentName}`, undefined, completionContext));
                                    }
                                }

                            }
                        } catch (err) {
                            connection.console.log(`[COMPLETION] Failed to get inherited members: ${err}`);
                        }
                    }
                }
            }
            return completions;
        } else if (stdlibIndex) {
            // ParentClass:: - show members of that specific parent class
            try {
                const parentModule = await stdlibIndex.getModule(scopeName);
                if (parentModule?.symbols) {
                    connection.console.log(`[COMPLETION] Found ${parentModule.symbols.size} members for ${scopeName}::`);
                    for (const [name, symbol] of parentModule.symbols) {
                        if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                            completions.push(buildCompletionItem(name, symbol, `From ${scopeName}`, undefined, completionContext));
                        }
                    }

                    return completions;
                }
            } catch (err) {
                connection.console.log(`[COMPLETION] Failed to resolve ${scopeName}:: : ${err}`);
            }
        }
    }

    // Use Pike's tokenizer to get accurate completion context
    // This replaces regex-based heuristics with Pike's native understanding
    let pikeContext: import('@pike-lsp/pike-bridge').CompletionContext | null = null;
    if (bridge) {
        try {
            pikeContext = await bridge.getCompletionContext(text, params.position.line + 1, params.position.character);
            connection.console.log(`[COMPLETION] Pike context: ${JSON.stringify(pikeContext)}`);
        } catch (err) {
            connection.console.log(`[COMPLETION] Failed to get Pike context: ${err}`);
        }
    }

    // Handle member access (obj->meth, Module.sub, this::member)
    if (pikeContext?.context === 'member_access' || pikeContext?.context === 'scope_access') {
        const objectRef = pikeContext.objectName;
        const prefix = pikeContext.prefix.trim(); // Remove whitespace like \n
        const operator = pikeContext.operator;

        connection.console.log(`[COMPLETION] Member/scope access on: ${objectRef}, operator: ${operator}, prefix: ${prefix}`);

        // Determine the type name to look up using a multi-strategy approach
        let typeName: string | null = null;

        // Strategy 1: If it looks like a fully qualified module (e.g., "Stdio.File"), use directly
        if (objectRef.includes('.')) {
            typeName = objectRef;
            connection.console.log(`[COMPLETION] Using fully qualified name: ${typeName}`);
        }
        // Strategy 2: Try to resolve as a top-level stdlib module (e.g., "Stdio" for "Stdio.")
        else if (stdlibIndex) {
            try {
                const testModule = await stdlibIndex.getModule(objectRef);
                if (testModule?.symbols && testModule.symbols.size > 0) {
                    typeName = objectRef;
                    connection.console.log(`[COMPLETION] Resolved ${objectRef} as stdlib module with ${testModule.symbols.size} symbols`);
                }
            } catch (err) {
                connection.console.log(`[COMPLETION] ${objectRef} is not a stdlib module: ${err}`);
            }
        }

        // Strategy 3: Look up local symbol to get its type
        if (!typeName && cached) {
            const localSymbol = cached.symbols.find(s => s.name === objectRef);
            if (localSymbol?.type) {
                typeName = extractTypeName(localSymbol.type);
                connection.console.log(`[COMPLETION] Extracted type: ${typeName} from local symbol ${objectRef}`);
            }
        }

        // Use resolved type to get members
        if (typeName && stdlibIndex) {
            // First try to resolve from stdlib
            try {
                const module = await stdlibIndex.getModule(typeName);
                if (module?.symbols) {
                    connection.console.log(`[COMPLETION] Found ${module.symbols.size} members for ${typeName}`);
                    for (const [name, symbol] of module.symbols) {
                        if (!prefix || name.toLowerCase().startsWith(prefix.toLowerCase())) {
                            completions.push(buildCompletionItem(name, symbol, `From ${typeName}`, undefined, completionContext));
                        }
                    }

                    return completions;
                }
            } catch (err) {
                connection.console.log(`[COMPLETION] ${typeName} not found in stdlib: ${err}`);
            }

            // If not in stdlib, try to find it in workspace documents
            connection.console.log(`[COMPLETION] Looking for ${typeName} in workspace documents`);
            for (const [docUri, doc] of documentCache) {
                const classSymbol = doc.symbols.find(s => s.kind === 'class' && s.name === typeName);
                if (classSymbol) {
                    connection.console.log(`[COMPLETION] Found class ${typeName} in ${docUri}`);

                    // Get members from the class symbol's children
                    const members = classSymbol.children || [];
                    connection.console.log(`[COMPLETION] Class ${typeName} has ${members.length} members`);

                    for (const member of members) {
                        if (!prefix || member.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                            completions.push(buildCompletionItem(
                                member.name,
                                member,
                                `Member of ${typeName}`,
                                undefined,
                                completionContext
                            ));
                        }
                    }

                    return completions;
                }
            }
        }

        // If we couldn't resolve the type, return empty completions
        // Don't show random local symbols - that's confusing and wrong
        connection.console.log(`[COMPLETION] Could not resolve type for ${objectRef}, returning empty`);
        return [];
    }

    // General completion - suggest all symbols from current document
    else {
        const prefix = getWordAtPosition(text, offset);

        // Add workspace symbols
        if (cached) {
            for (const symbol of cached.symbols) {
                // Skip symbols with null names
                if (!symbol.name) continue;

                if (!prefix || symbol.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                    const item = buildCompletionItem(symbol.name, symbol, 'Local symbol', cached.symbols, completionContext);
                    item.data = { uri, name: symbol.name };
                    completions.push(item);
                }
            }
        }

        // Add Pike built-in types and common functions
        const pikeBuiltins = [
                { name: 'int', kind: CompletionItemKind.Keyword },
                { name: 'string', kind: CompletionItemKind.Keyword },
                { name: 'float', kind: CompletionItemKind.Keyword },
                { name: 'array', kind: CompletionItemKind.Keyword },
                { name: 'mapping', kind: CompletionItemKind.Keyword },
                { name: 'multiset', kind: CompletionItemKind.Keyword },
                { name: 'object', kind: CompletionItemKind.Keyword },
                { name: 'function', kind: CompletionItemKind.Keyword },
                { name: 'program', kind: CompletionItemKind.Keyword },
                { name: 'mixed', kind: CompletionItemKind.Keyword },
                { name: 'void', kind: CompletionItemKind.Keyword },
                { name: 'class', kind: CompletionItemKind.Keyword },
                { name: 'inherit', kind: CompletionItemKind.Keyword },
                { name: 'import', kind: CompletionItemKind.Keyword },
                { name: 'constant', kind: CompletionItemKind.Keyword },
                { name: 'if', kind: CompletionItemKind.Keyword },
                { name: 'else', kind: CompletionItemKind.Keyword },
                { name: 'for', kind: CompletionItemKind.Keyword },
                { name: 'foreach', kind: CompletionItemKind.Keyword },
                { name: 'while', kind: CompletionItemKind.Keyword },
                { name: 'do', kind: CompletionItemKind.Keyword },
                { name: 'switch', kind: CompletionItemKind.Keyword },
                { name: 'case', kind: CompletionItemKind.Keyword },
                { name: 'default', kind: CompletionItemKind.Keyword },
                { name: 'break', kind: CompletionItemKind.Keyword },
                { name: 'continue', kind: CompletionItemKind.Keyword },
                { name: 'return', kind: CompletionItemKind.Keyword },
                { name: 'public', kind: CompletionItemKind.Keyword },
                { name: 'private', kind: CompletionItemKind.Keyword },
                { name: 'protected', kind: CompletionItemKind.Keyword },
                { name: 'static', kind: CompletionItemKind.Keyword },
                { name: 'final', kind: CompletionItemKind.Keyword },
                { name: 'local', kind: CompletionItemKind.Keyword },
                { name: 'sizeof', kind: CompletionItemKind.Function },
                { name: 'typeof', kind: CompletionItemKind.Function },
                // Note: write, werror, sprintf, sscanf are now loaded from __auto_include__ with proper type info
                { name: 'Stdio', kind: CompletionItemKind.Module },
                { name: 'Array', kind: CompletionItemKind.Module },
                { name: 'String', kind: CompletionItemKind.Module },
                { name: 'Mapping', kind: CompletionItemKind.Module },
                { name: 'Math', kind: CompletionItemKind.Module },
            ];

            for (const builtin of pikeBuiltins) {
                if (!prefix || builtin.name.toLowerCase().startsWith(prefix.toLowerCase())) {
                    completions.push({
                        label: builtin.name,
                        kind: builtin.kind,
                    });
                }
            }
    }

    return completions;
});

/**
 * Completion item resolve - add documentation for the selected item
 */
connection.onCompletionResolve((item): CompletionItem => {
    const data = item.data as { uri?: string; name?: string } | undefined;
    if (data?.uri && data?.name) {
        const cached = documentCache.get(data.uri);
        if (cached) {
            const symbol = cached.symbols.find(s => s.name === data.name);
            if (symbol) {
                item.documentation = {
                    kind: MarkupKind.Markdown,
                    value: buildHoverContent(symbol) ?? '',
                };
            }
        }
    }
    return item;
});

/**
 * Signature help handler - show function parameters
 */
connection.onSignatureHelp(async (params): Promise<SignatureHelp | null> => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const cached = documentCache.get(uri);

    if (!document || !cached) {
        return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find the function call context
    // Look backwards for opening paren
    let parenDepth = 0;
    let funcStart = offset;
    let paramIndex = 0;

    for (let i = offset - 1; i >= 0; i--) {
        const char = text[i];
        if (char === ')') {
            parenDepth++;
        } else if (char === '(') {
            if (parenDepth === 0) {
                funcStart = i;
                break;
            }
            parenDepth--;
        } else if (char === ',' && parenDepth === 0) {
            paramIndex++;
        } else if (char === ';' || char === '{' || char === '}') {
            // Not in a function call
            return null;
        }
    }

    // Get the function name before the paren (support both Module.func and func)
    const textBefore = text.slice(0, funcStart);

    // Try to match qualified name first (e.g., MIME.encode_base64url)
    const qualifiedMatch = textBefore.match(/([\w.]+)\s*$/);
    if (!qualifiedMatch) {
        return null;
    }

    const funcName = qualifiedMatch[1]!;
    let funcSymbol: PikeSymbol | null = null;

    // Check if this is a qualified stdlib symbol
    if (funcName.includes('.') && stdlibIndex) {
        const lastDotIndex = funcName.lastIndexOf('.');
        const modulePath = funcName.substring(0, lastDotIndex);
        const symbolName = funcName.substring(lastDotIndex + 1);

        connection.console.log(`SignatureHelp: Qualified symbol: module="${modulePath}", symbol="${symbolName}"`);

        try {
            const currentFile = decodeURIComponent(uri.replace(new RegExp('^file://', ''), ''));
            const module = await stdlibIndex.getModule(modulePath);

            if (module?.symbols && module.symbols.has(symbolName)) {
                // Get the resolved path
                const targetPath = module.resolvedPath
                    ? module.resolvedPath
                    : bridge ? await bridge.resolveModule(modulePath, currentFile) : null;

                if (targetPath) {
                    const cleanPath = targetPath.split(':')[0] ?? targetPath;
                    const targetUri = `file://${cleanPath}`;

                    // Check cache first
                    const targetCached = documentCache.get(targetUri);
                    if (targetCached) {
                        funcSymbol = findSymbolByName(targetCached.symbols, symbolName) ?? null;
                        connection.console.log(`SignatureHelp: Found in cached document`);
                    }

                    // Parse if not in cache
                    if (!funcSymbol && bridge) {
                        try {
                            const code = await fs.readFile(cleanPath, 'utf-8');
                            const parseResult = await bridge.parse(code, cleanPath);
                            funcSymbol = findSymbolByName(parseResult.symbols, symbolName) ?? null;
                            connection.console.log(`SignatureHelp: Found by parsing`);
                        } catch (parseErr) {
                            connection.console.log(`SignatureHelp: Failed to parse: ${parseErr}`);
                        }
                    }
                }
            }
        } catch (err) {
            connection.console.log(`SignatureHelp: Error resolving stdlib symbol: ${err}`);
        }
    }

    // Fallback: search in current document
    if (!funcSymbol) {
        funcSymbol = cached.symbols.find(s => s.name === funcName && s.kind === 'method') ?? null;
    }

    if (!funcSymbol) {
        return null;
    }

    // Build signature
    const params_list: ParameterInformation[] = [];
    const symbolAny = funcSymbol as any;
    const argNames: string[] = symbolAny.argNames ?? [];
    const argTypes: unknown[] = symbolAny.argTypes ?? [];

    const returnType = formatPikeType(symbolAny.returnType);
    let signatureLabel = `${returnType} ${funcName}(`;

    for (let i = 0; i < argNames.length; i++) {
        const typeName = formatPikeType(argTypes[i]);
        const paramStr = `${typeName} ${argNames[i]}`;

        const startOffset = signatureLabel.length;
        signatureLabel += paramStr;
        const endOffset = signatureLabel.length;

        params_list.push({
            label: [startOffset, endOffset],
        });

        if (i < argNames.length - 1) {
            signatureLabel += ', ';
        }
    }
    signatureLabel += ')';

    const signature: SignatureInformation = {
        label: signatureLabel,
        parameters: params_list,
    };

    // Debug logging to help diagnose parameter highlighting issues
    connection.console.log(`SignatureHelp: func=${funcName}, paramIndex=${paramIndex}, paramsCount=${params_list.length}, activeParam=${Math.min(paramIndex, params_list.length - 1)}`);

    return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: Math.min(paramIndex, params_list.length - 1),
    };
});

/**
 * Prepare rename handler - check if rename is allowed
 */
connection.onPrepareRename((params): Range | null => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find word boundaries
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    if (start === end) {
        return null;
    }

    return {
        start: document.positionAt(start),
        end: document.positionAt(end),
    };
});

/**
 * Rename handler - rename symbol across files
 */
connection.onRenameRequest((params): { changes: { [uri: string]: TextEdit[] } } | null => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find the word to rename
    let start = offset;
    let end = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const oldName = text.slice(start, end);
    if (!oldName) {
        return null;
    }

    const newName = params.newName;
    const changes: { [uri: string]: TextEdit[] } = {};

    // Replace all occurrences in current document
    const edits: TextEdit[] = [];
    const lines = text.split('\n');
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex: number;

        while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                edits.push({
                    range: {
                        start: { line: lineNum, character: matchIndex },
                        end: { line: lineNum, character: matchIndex + oldName.length },
                    },
                    newText: newName,
                });
            }
            searchStart = matchIndex + 1;
        }
    }

    if (edits.length > 0) {
        changes[uri] = edits;
    }

    // Also rename in other open documents
    for (const [otherUri] of documentCache) {
        if (otherUri === uri) continue;

        const otherDoc = documents.get(otherUri);
        if (!otherDoc) continue;

        const otherText = otherDoc.getText();
        const otherEdits: TextEdit[] = [];
        const otherLines = otherText.split('\n');

        for (let lineNum = 0; lineNum < otherLines.length; lineNum++) {
            const line = otherLines[lineNum];
            if (!line) continue;
            let searchStart = 0;
            let matchIndex: number;

            while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                    otherEdits.push({
                        range: {
                            start: { line: lineNum, character: matchIndex },
                            end: { line: lineNum, character: matchIndex + oldName.length },
                        },
                        newText: newName,
                    });
                }
                searchStart = matchIndex + 1;
            }
        }

        if (otherEdits.length > 0) {
            changes[otherUri] = otherEdits;
        }
    }

    // Also search workspace index for files not currently open
    const workspaceUris = workspaceIndex.getAllDocumentUris();
    for (const wsUri of workspaceUris) {
        // Skip if already processed (in documentCache)
        if (documentCache.has(wsUri)) continue;

        try {
            // Read file from disk
            const filePath = decodeURIComponent(wsUri.replace(/^file:\/\//, ''));
            const fileContent = require('fs').readFileSync(filePath, 'utf-8');
            const fileEdits: TextEdit[] = [];
            const fileLines = fileContent.split('\n');

            for (let lineNum = 0; lineNum < fileLines.length; lineNum++) {
                const line = fileLines[lineNum];
                if (!line) continue;
                let searchStart = 0;
                let matchIndex: number;

                while ((matchIndex = line.indexOf(oldName, searchStart)) !== -1) {
                    const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
                    const afterChar = matchIndex + oldName.length < line.length ? line[matchIndex + oldName.length] : ' ';

                    if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                        fileEdits.push({
                            range: {
                                start: { line: lineNum, character: matchIndex },
                                end: { line: lineNum, character: matchIndex + oldName.length },
                            },
                            newText: newName,
                        });
                    }
                    searchStart = matchIndex + 1;
                }
            }

            if (fileEdits.length > 0) {
                changes[wsUri] = fileEdits;
            }
        } catch (err) {
            // Skip files we can't read
            connection.console.warn(`Failed to read ${wsUri} for rename: ${err}`);
        }
    }

    return { changes };
});

// ============= CALL HIERARCHY =============

/**
 * Prepare call hierarchy - get call hierarchy item at position
 */
connection.languages.callHierarchy.onPrepare((params) => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    // Find method at position
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    let wordStart = offset;
    let wordEnd = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
    }
    while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
        wordEnd++;
    }
    const word = text.slice(wordStart, wordEnd);

    if (!word) return null;

    // Find method symbol
    const methodSymbol = cached.symbols.find(s =>
        s.name === word && s.kind === 'method' && s.position
    );

    if (!methodSymbol || !methodSymbol.position) {
        return null;
    }

    const line = Math.max(0, (methodSymbol.position.line ?? 1) - 1);

    return [{
        name: methodSymbol.name,
        kind: SymbolKind.Method,
        uri,
        range: {
            start: { line, character: 0 },
            end: { line, character: methodSymbol.name.length },
        },
        selectionRange: {
            start: { line, character: 0 },
            end: { line, character: methodSymbol.name.length },
        },
    }];
});

/**
 * Incoming calls - who calls this function?
 */
connection.languages.callHierarchy.onIncomingCalls((params) => {
    const results: CallHierarchyIncomingCall[] = [];
    const targetName = params.item.name;
    // params.item.uri available if needed for cross-file filtering

    // Helper function to search for calls in a document
    const searchDocument = (docUri: string, text: string, symbols: PikeSymbol[]) => {
        const lines = text.split('\n');

        // Find all methods in this document
        for (const symbol of symbols) {
            if (symbol.kind !== 'method' || !symbol.position) continue;

            const methodStartLine = (symbol.position.line ?? 1) - 1;

            // Search for calls to targetName in this method's body
            // Simple heuristic: search from method line until next method or end
            const nextMethodLine = symbols
                .filter(s => s.kind === 'method' && s.position && (s.position.line ?? 0) > (symbol.position?.line ?? 0))
                .map(s => (s.position?.line ?? 0) - 1)
                .sort((a, b) => a - b)[0] ?? lines.length;

            const ranges: Range[] = [];
            for (let lineNum = methodStartLine; lineNum < nextMethodLine && lineNum < lines.length; lineNum++) {
                const line = lines[lineNum];
                if (!line) continue;

                // Find function calls: targetName(
                const regex = PatternHelpers.functionCallPattern(targetName);
                let match;
                while ((match = regex.exec(line)) !== null) {
                    ranges.push({
                        start: { line: lineNum, character: match.index },
                        end: { line: lineNum, character: match.index + targetName.length },
                    });
                }
            }

            if (ranges.length > 0) {
                results.push({
                    from: {
                        name: symbol.name,
                        kind: SymbolKind.Method,
                        uri: docUri,
                        range: {
                            start: { line: methodStartLine, character: 0 },
                            end: { line: methodStartLine, character: symbol.name.length },
                        },
                        selectionRange: {
                            start: { line: methodStartLine, character: 0 },
                            end: { line: methodStartLine, character: symbol.name.length },
                        },
                    },
                    fromRanges: ranges,
                });
            }
        }
    };

    // Search all open/cached documents
    for (const [docUri, cached] of documentCache) {
        const doc = documents.get(docUri);
        if (!doc) continue;
        searchDocument(docUri, doc.getText(), cached.symbols);
    }

    // Also search workspace index for files not currently open
    const workspaceUris = workspaceIndex.getAllDocumentUris();
    for (const wsUri of workspaceUris) {
        if (documentCache.has(wsUri)) continue; // Skip already searched

        try {
            const filePath = decodeURIComponent(wsUri.replace(/^file:\/\//, ''));
            const fileContent = require('fs').readFileSync(filePath, 'utf-8');
            const wsSymbols = workspaceIndex.getDocumentSymbols(wsUri);
            searchDocument(wsUri, fileContent, wsSymbols);
        } catch (err) {
            // Skip files we can't read
        }
    }

    return results;
});

/**
 * Outgoing calls - what does this function call?
 */
connection.languages.callHierarchy.onOutgoingCalls((params) => {
    const results: CallHierarchyOutgoingCall[] = [];
    const sourceUri = params.item.uri;
    const sourceLine = params.item.range.start.line;

    const cached = documentCache.get(sourceUri);
    const doc = documents.get(sourceUri);
    if (!cached || !doc) return results;

    const text = doc.getText();
    const lines = text.split('\n');

    // Find this method and its end
    const sourceSymbol = cached.symbols.find(s =>
        s.kind === 'method' &&
        s.position &&
        Math.max(0, (s.position.line ?? 1) - 1) === sourceLine
    );

    if (!sourceSymbol) return results;

    const methodStartLine = sourceLine;
    const nextMethodLine = cached.symbols
        .filter(s => s.kind === 'method' && s.position && (s.position.line ?? 0) - 1 > sourceLine)
        .map(s => (s.position?.line ?? 0) - 1)
        .sort((a, b) => a - b)[0] ?? lines.length;

    // Find all function calls in this method
    const calledFunctions = new Map<string, Range[]>();

    for (let lineNum = methodStartLine; lineNum < nextMethodLine && lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;

        // Match function calls: identifier(
        const regex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
        let match;
        while ((match = regex.exec(line)) !== null) {
            const funcName = match[1];
            if (!funcName || funcName === sourceSymbol.name) continue; // Skip self-recursion tracking

            const range: Range = {
                start: { line: lineNum, character: match.index },
                end: { line: lineNum, character: match.index + funcName.length },
            };

            const existing = calledFunctions.get(funcName) ?? [];
            existing.push(range);
            calledFunctions.set(funcName, existing);
        }
    }

    // Build results for each called function
    for (const [funcName, ranges] of calledFunctions) {
        // Try to find the function definition
        let targetUri = sourceUri;
        let targetLine = 0;

        const targetSymbol = cached.symbols.find(s => s.name === funcName && s.kind === 'method');
        if (targetSymbol?.position) {
            targetLine = Math.max(0, (targetSymbol.position.line ?? 1) - 1);
        }

        results.push({
            to: {
                name: funcName,
                kind: SymbolKind.Method,
                uri: targetUri,
                range: {
                    start: { line: targetLine, character: 0 },
                    end: { line: targetLine, character: funcName.length },
                },
                selectionRange: {
                    start: { line: targetLine, character: 0 },
                    end: { line: targetLine, character: funcName.length },
                },
            },
            fromRanges: ranges,
        });
    }

    return results;
});

// ============= TYPE HIERARCHY =============

/**
 * Prepare type hierarchy - get type hierarchy item at position
 */
connection.languages.typeHierarchy.onPrepare((params) => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    // Find class at position
    const text = document.getText();
    const offset = document.offsetAt(params.position);

    let wordStart = offset;
    let wordEnd = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
    }
    while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
        wordEnd++;
    }
    const word = text.slice(wordStart, wordEnd);

    if (!word) return null;

    // Find class symbol
    const classSymbol = cached.symbols.find(s =>
        s.name === word && s.kind === 'class' && s.position
    );

    if (!classSymbol || !classSymbol.position) {
        return null;
    }

    const line = Math.max(0, (classSymbol.position.line ?? 1) - 1);

    return [{
        name: classSymbol.name,
        kind: SymbolKind.Class,
        uri,
        range: {
            start: { line, character: 0 },
            end: { line, character: classSymbol.name.length },
        },
        selectionRange: {
            start: { line, character: 0 },
            end: { line, character: classSymbol.name.length },
        },
    }];
});

/**
 * Supertypes - what does this class inherit from?
 */
connection.languages.typeHierarchy.onSupertypes((params) => {
    const results: TypeHierarchyItem[] = [];
    // params.item.name and uri available for cross-checking
    const classUri = params.item.uri;

    const cached = documentCache.get(classUri);
    if (!cached) return results;

    // Find inherit symbols that belong to this class
    // Look for inherit declarations near the class position
    const classLine = params.item.range.start.line;

    for (const symbol of cached.symbols) {
        if (symbol.kind !== 'inherit') continue;

        // Get the inherited class name
        const inheritedName = (symbol as any).classname ?? symbol.name;
        if (!inheritedName) continue;

        const inheritLine = symbol.position ? Math.max(0, (symbol.position.line ?? 1) - 1) : classLine + 1;

        // Heuristic: inherit should be after class declaration
        if (inheritLine > classLine) {
            results.push({
                name: inheritedName,
                kind: SymbolKind.Class,
                uri: classUri,
                range: {
                    start: { line: inheritLine, character: 0 },
                    end: { line: inheritLine, character: inheritedName.length },
                },
                selectionRange: {
                    start: { line: inheritLine, character: 0 },
                    end: { line: inheritLine, character: inheritedName.length },
                },
            });
        }
    }

    return results;
});

/**
 * Subtypes - what classes inherit from this?
 */
connection.languages.typeHierarchy.onSubtypes((params) => {
    const results: TypeHierarchyItem[] = [];
    const className = params.item.name;

    // Search all documents for classes that inherit from this class
    for (const [docUri, cached] of documentCache) {
        for (const symbol of cached.symbols) {
            if (symbol.kind !== 'inherit') continue;

            const inheritedName = (symbol as any).classname ?? symbol.name;
            if (inheritedName !== className) continue;

            // Find the class that contains this inherit
            const inheritLine = symbol.position ? Math.max(0, (symbol.position.line ?? 1) - 1) : 0;

            // Find the class that declared this inherit (closest class before inherit line)
            const containingClass = cached.symbols
                .filter(s => s.kind === 'class' && s.position && (s.position.line ?? 0) - 1 < inheritLine)
                .sort((a, b) => ((b.position?.line ?? 0) - (a.position?.line ?? 0)))[0];

            if (containingClass) {
                const classLine = Math.max(0, (containingClass.position?.line ?? 1) - 1);
                results.push({
                    name: containingClass.name,
                    kind: SymbolKind.Class,
                    uri: docUri,
                    range: {
                        start: { line: classLine, character: 0 },
                        end: { line: classLine, character: containingClass.name.length },
                    },
                    selectionRange: {
                        start: { line: classLine, character: 0 },
                        end: { line: classLine, character: containingClass.name.length },
                    },
                });
            }
        }
    }

    return results;
});

/**
 * Helper: Get word at position
 */
function getWordAtPosition(text: string, offset: number): string {
    let start = offset;
    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    let end = offset;
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }
    return text.slice(start, end);
}


/**
 * Build a snippet string for method completion with parameter placeholders
 * E.g., "read(${1:buffer})" with cursor inside parentheses and real arg names
 * 
 * @param name - The function/method name
 * @param typeObj - Type information object (may contain 'arguments' array)
 * @param argNames - Optional array of real argument names from parsed source
 * @param argTypes - Optional array of argument types for display
 */
function buildMethodSnippet(
    name: string,
    typeObj: unknown,
    argNames?: (string | null)[],
    argTypes?: unknown[]
): { snippet: string; isSnippet: boolean } {
    // Priority 1: Use argNames from parsed source if available (has real parameter names)
    if (argNames && argNames.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < argNames.length; i++) {
            const argName = argNames[i] ?? `arg${i + 1}`;
            // Escape special snippet characters in arg names
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    // Priority 2: Check type object for function info
    if (!typeObj || typeof typeObj !== 'object') {
        return { snippet: name, isSnippet: false };
    }

    const t = typeObj as Record<string, unknown>;

    // Check for function kind
    if (t['kind'] !== 'function') {
        return { snippet: name, isSnippet: false };
    }

    // Priority 3: Use 'arguments' from introspection
    const args = t['arguments'] as unknown[] | undefined;
    if (args && args.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < args.length; i++) {
            const arg = args[i] as Record<string, unknown> | undefined;
            const argName = arg?.['name'] as string | undefined ?? `arg${i + 1}`;
            // Escape special snippet characters
            const safeName = argName.replace(/[$}\\]/g, '\\$&');
            placeholders.push(`\${${i + 1}:${safeName}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }

    // Priority 4: Use argTypes from parameter (from parsed symbol) or from type info
    const effectiveArgTypes = argTypes ?? (t['argTypes'] as unknown[] | undefined);
    if (effectiveArgTypes && effectiveArgTypes.length > 0) {
        const placeholders: string[] = [];
        for (let i = 0; i < effectiveArgTypes.length; i++) {
            // Use generic arg names since we don't have real names at this point
            placeholders.push(`\${${i + 1}:arg${i + 1}}`);
        }
        return {
            snippet: `${name}(${placeholders.join(', ')})`,
            isSnippet: true
        };
    }


    // For functions without known arguments, place cursor inside parentheses
    // This allows user to start typing arguments right away
    return {
        snippet: `${name}(\${1})`,
        isSnippet: true
    };
}

/**
 * Determine completion context from the text before the cursor
 * Returns 'type' for type declaration context (no constructor/function call snippets)
 * Returns 'expression' for expression context (use constructor/function call snippets)
 */
function getCompletionContext(lineText: string): 'type' | 'expression' {
    // Trim trailing whitespace and the partial word being typed
    const trimmed = lineText.replace(/\w*$/, '').trimEnd();

    // Type context indicators:
    // - Start of line (type declaration)
    // - After modifiers: public, private, protected, static, local, final, constant
    // - After opening brace { (could be class body, function body start - often type decl)
    // - After semicolon ; (new statement, often type decl)
    // - After : in inherit MyClass (type context)
    // - After ( in function parameter list: void foo(MyC... 
    // - After , in function parameter list: void foo(int x, MyC...
    // - After | in union types: int|MyC...

    // Expression context indicators:
    // - After = (assignment)
    // - After return keyword
    // - After ( that's not in function signature (function call args)
    // - After , in function call
    // - After [ (array index or literal)
    // - After operators: + - * / % && || ! < > == != <= >= 
    // - After ? : (ternary)

    if (trimmed.length === 0) {
        // Start of line - typically type declaration context
        return 'type';
    }

    // Check for expression context indicators (assignment, return, operators)

    // Special check for return keyword (common expression context)
    if (/\breturn\s*$/.test(trimmed)) {
        return 'expression';
    }

    const expressionPatterns = [
        /=\s*$/,           // After assignment
        /\[\s*$/,          // After [ (array access or literal)
        /\(\s*$/,          // After ( - need to distinguish function call from signature
        /,\s*$/,           // After , - need context
        /[+\-*/%]\s*$/,    // After arithmetic operators
        /[<>]=?\s*$/,      // After comparison operators
        /[!=]=\s*$/,       // After equality operators
        /&&\s*$/,          // After logical AND
        /\|\|\s*$/,        // After logical OR
        /!\s*$/,           // After logical NOT
        /\?\s*$/,          // After ternary ?
        /:\s*$/,           // After ternary : (but not inherit:)
        /=>\s*$/,          // After arrow (lambda)
    ];

    // Type context indicators (modifiers, start of declarations)
    const typePatterns = [
        /^\s*$/,                           // Start of line (empty before word)
        /;\s*$/,                           // After semicolon
        /\{\s*$/,                          // After opening brace
        /\b(public|private|protected|static|local|final|constant|optional)\s+$/i,  // After modifiers
        /\bclass\s+\w+\s*$/,               // After class name (for inherit context, though not typical)
        /\binherit\s+$/,                   // After inherit keyword
        /\|$/,                             // After union type |
    ];

    // Check expression patterns first (they're more specific)
    for (const pattern of expressionPatterns) {
        if (pattern.test(trimmed)) {
            // Special case: comma could be in type context (function params) or expression context
            if (/,\s*$/.test(trimmed)) {
                // Look further back to determine context
                // Function signature: "type name(params," - we're inside an unclosed paren
                // Function call: "foo(args," - same, but check what's before the paren

                const beforeComma = trimmed.replace(/,\s*$/, '');
                const lastOpenParen = beforeComma.lastIndexOf('(');
                const lastCloseParen = beforeComma.lastIndexOf(')');

                // Check if we're inside an unclosed paren (signature or call params)
                if (lastOpenParen > lastCloseParen) {
                    // We're inside an unclosed paren - check what's before it
                    const beforeParen = beforeComma.slice(0, lastOpenParen).trimEnd();

                    // Function signature pattern: "type name" before the paren
                    // E.g., "void foo", "int|string bar", "MyClass create"
                    if (/\b\w+\s+\w+\s*$/.test(beforeParen)) {
                        // Pattern like "void foo" before ( - function parameter signature
                        return 'type';
                    }

                    // Just "name(" without type before - function call argument
                    return 'expression';
                }

                // If we see ")  {" we're inside a function body
                if (/\)\s*\{/.test(trimmed)) {
                    return 'expression';
                }

                // Default: expression for commas
                return 'expression';
            }

            // Special case: ( could be function signature or function call
            if (/\(\s*$/.test(trimmed)) {
                // If preceded by "type name(" it's function signature - type context
                // If preceded by "name(" without type, it's function call - expression context
                if (/\b\w+\s+\w+\s*\(\s*$/.test(trimmed)) {
                    // Pattern: "void foo(" - function signature
                    return 'type';
                }
                // Pattern: just "foo(" - function call
                return 'expression';
            }

            // Special case: : could be ternary or inherit
            if (/:\s*$/.test(trimmed) && /\binherit\s+\w+\s*:\s*$/.test(trimmed)) {
                return 'type';
            }

            return 'expression';
        }
    }

    // Check type patterns
    for (const pattern of typePatterns) {
        if (pattern.test(trimmed)) {
            return 'type';
        }
    }

    // Default: if we can't determine, assume type context (safer - no unwanted snippets)
    return 'type';
}


/**
 * Build a completion item with optional snippet support for methods and classes
 * 
 * Symbol may contain:
 * - argNames: (string | null)[] - Real parameter names from parsed source
 * - argTypes: unknown[] - Parameter types from parsing
 * - type: { kind: 'function', arguments?: [...], argTypes?: [...] } - Type info from introspection
 * 
 * For classes, looks up the 'create' constructor method to get argument names
 * 
 * @param context - 'type' for type declarations (no constructor snippets), 'expression' for instantiation
 */
function buildCompletionItem(
    name: string,
    symbol: { kind?: string; type?: unknown; argNames?: (string | null)[]; argTypes?: unknown[] },
    source: string,
    allSymbols?: Array<{ name: string; kind?: string; argNames?: (string | null)[]; argTypes?: unknown[] }>,
    context: 'type' | 'expression' = 'type'
): CompletionItem {
    const isFunction = symbol.kind === 'function' || symbol.kind === 'method';
    const isClass = symbol.kind === 'class';
    const typeObj = symbol.type as Record<string, unknown> | undefined;
    const symbolAny = symbol as Record<string, unknown>;

    // For classes, try to find the 'create' constructor to get argument info
    // The 'create' method should be scoped to this class (appears after class, before next class)
    let constructorArgNames: (string | null)[] | undefined;
    let constructorArgTypes: unknown[] | undefined;
    if (isClass && allSymbols) {
        const classSymbol = symbol as Record<string, unknown>;
        const classLine = (classSymbol['position'] as { line?: number } | undefined)?.line ?? 0;

        // Find all class definitions to determine scope boundaries
        const classPositions = allSymbols
            .filter(s => s.kind === 'class')
            .map(s => {
                const pos = (s as Record<string, unknown>)['position'] as { line?: number } | undefined;
                return pos?.line ?? 0;
            })
            .sort((a, b) => a - b);

        // Find the next class after this one
        const nextClassLine = classPositions.find(line => line > classLine) ?? Infinity;

        // Find the 'create' method that belongs to this class (between classLine and nextClassLine)
        const createMethod = allSymbols.find(s => {
            if (s.name !== 'create' || s.kind !== 'method') return false;
            const pos = (s as Record<string, unknown>)['position'] as { line?: number } | undefined;
            const createLine = pos?.line ?? 0;
            return createLine > classLine && createLine < nextClassLine;
        });

        if (createMethod) {
            const createMethodAny = createMethod as Record<string, unknown>;
            constructorArgNames = createMethodAny['argNames'] as (string | null)[] | undefined;
            constructorArgTypes = createMethodAny['argTypes'] as unknown[] | undefined;
        }
    }

    // Build detail string - show the full signature if available
    let detail = formatPikeType(symbol.type);
    if (isFunction) {
        if (typeObj?.['signature']) {
            // Use the full signature if available from introspection
            detail = typeObj['signature'] as string;
        } else if (symbolAny['argNames'] && symbolAny['argTypes']) {
            // Build signature from parsed info
            const argNames = symbolAny['argNames'] as (string | null)[];
            const argTypes = symbolAny['argTypes'] as unknown[];
            const returnType = formatPikeType(symbolAny['returnType']);
            const params: string[] = [];
            for (let i = 0; i < argNames.length; i++) {
                const typeName = formatPikeType(argTypes[i]);
                const argName = argNames[i] ?? `arg${i + 1}`;
                params.push(`${typeName} ${argName}`);
            }
            detail = `${returnType} ${name}(${params.join(', ')})`;
        }
    } else if (isClass && constructorArgNames && constructorArgTypes) {
        // Show constructor signature for classes
        const params: string[] = [];
        for (let i = 0; i < constructorArgNames.length; i++) {
            const typeName = formatPikeType(constructorArgTypes[i]);
            const argName = constructorArgNames[i] ?? `arg${i + 1}`;
            params.push(`${typeName} ${argName}`);
        }
        detail = `class ${name}(${params.join(', ')})`;
    }

    // Determine the appropriate CompletionItemKind
    let itemKind: typeof CompletionItemKind[keyof typeof CompletionItemKind] = CompletionItemKind.Property;
    if (isFunction) {
        itemKind = CompletionItemKind.Method;
    } else if (isClass) {
        itemKind = CompletionItemKind.Class;
    } else if (symbol.kind === 'variable') {
        itemKind = CompletionItemKind.Variable;
    } else if (symbol.kind === 'constant') {
        itemKind = CompletionItemKind.Constant;
    }

    const item: CompletionItem = {
        label: name,
        kind: itemKind,
        detail: detail,
        documentation: source,
    };

    // Add snippet for functions with command to trigger signature help
    if (isFunction) {
        // Extract argNames from the symbol if available (parsed from source)
        const argNames = symbolAny['argNames'] as (string | null)[] | undefined;
        const argTypes = symbolAny['argTypes'] as unknown[] | undefined;

        const { snippet, isSnippet } = buildMethodSnippet(name, symbol.type, argNames, argTypes);

        item.insertText = snippet;
        if (isSnippet) {
            item.insertTextFormat = InsertTextFormat.Snippet;
        }

        // Trigger signature help after accepting the completion
        item.command = {
            title: 'Trigger Signature Help',
            command: 'editor.action.triggerParameterHints',
        };

        // Debug log
        connection.console.log(`[COMPLETION] Function ${name}: insertText="${snippet}", isSnippet=${isSnippet}, hasArgNames=${!!argNames}`);
    } else if (isClass && context === 'expression') {
        // Add snippet for class constructors ONLY in expression context (e.g., after '=')
        // In type context (e.g., 'MyClass foo;'), don't add constructor snippet
        const { snippet, isSnippet } = buildMethodSnippet(name, null, constructorArgNames, constructorArgTypes);

        item.insertText = snippet;
        if (isSnippet) {
            item.insertTextFormat = InsertTextFormat.Snippet;
        }

        // Trigger signature help after accepting the completion
        item.command = {
            title: 'Trigger Signature Help',
            command: 'editor.action.triggerParameterHints',
        };

        // Debug log
        connection.console.log(`[COMPLETION] Class ${name} (expression): insertText="${snippet}", isSnippet=${isSnippet}, hasConstructorArgs=${!!constructorArgNames}`);
    } else if (isClass) {
        // Type context - just insert the class name without constructor snippet
        connection.console.log(`[COMPLETION] Class ${name} (type): no constructor snippet`);
    }

    // Check if symbol is deprecated and add tag for visual indicator
    const docInfo = symbolAny['documentation'] as { deprecated?: string } | undefined;
    if (docInfo?.deprecated) {
        item.tags = [CompletionItemTag.Deprecated];
        // Also update detail to show deprecation warning
        item.detail = `[DEPRECATED] ${item.detail || name}`;
    }

    return item;
}




/**
 * Find symbol by name in an array of symbols (searches flattened symbols)
 */
function findSymbolByName(symbols: PikeSymbol[], name: string): PikeSymbol | null {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
    }
    return null;
}


/**
 * Find symbol at given position in document
 */
function findSymbolAtPosition(
    symbols: PikeSymbol[],
    position: Position,
    document: TextDocument
): PikeSymbol | null {
    // Get the word at the current position
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Find word boundaries
    let start = offset;
    let end = offset;

    while (start > 0 && /\w/.test(text[start - 1] ?? '')) {
        start--;
    }
    while (end < text.length && /\w/.test(text[end] ?? '')) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return null;
    }

    // Find symbol with matching name
    // For now, simple name matching - could be enhanced with scope analysis
    for (const symbol of symbols) {
        if (symbol.name === word) {
            return symbol;
        }
    }

    return null;
}

/**
 * Format a Pike type for display
 * Handles complex types like OrType (unions), ObjectType, ArrayType etc.
 */
function formatPikeType(typeObj: unknown): string {
    if (!typeObj || typeof typeObj !== 'object') {
        // Handle string type directly (from introspection returnType/argType)
        if (typeof typeObj === 'string') {
            return typeObj;
        }
        return 'mixed';
    }

    const t = typeObj as Record<string, unknown>;
    // Support both 'name' (from parse) and 'kind' (from introspection)
    const name = (t['name'] ?? t['kind']) as string | undefined;

    if (!name) {
        return 'mixed';
    }

    // Handle function types: name="function", returnType, argTypes
    if (name === 'function') {
        const returnType = t['returnType'] ? formatPikeType(t['returnType']) : 'mixed';
        const argTypes = t['argTypes'] as unknown[] | undefined;

        if (argTypes && argTypes.length > 0) {
            const params = argTypes.map((arg) => {
                const typeStr = formatPikeType(arg);
                // Check if this is a varargs parameter (type contains "..." or kind is "varargs")
                const isVarargs = typeStr.includes('...') ||
                    (typeof arg === 'object' && (arg as Record<string, unknown>)['kind'] === 'varargs');
                return isVarargs ? `${typeStr}` : typeStr;
            });
            return `function(${params.join(', ')}:${returnType})`;
        }
        return `function(:${returnType})`;
    }

    // Handle union types (OrType): name="or", types=[...]
    if (name === 'or' && Array.isArray(t['types'])) {
        const parts = (t['types'] as unknown[]).map(sub => formatPikeType(sub));
        return parts.join('|');
    }

    // Handle object types: name="object", className="Gmp.mpz"
    if (name === 'object' && t['className']) {
        return t['className'] as string;
    }

    // Handle program types: name="program", className="..."
    if (name === 'program' && t['className']) {
        return `program(${t['className']})`;
    }

    // Handle array types: name="array", valueType={...}
    if (name === 'array' && t['valueType']) {
        return `array(${formatPikeType(t['valueType'])})`;
    }

    // Handle mapping types: name="mapping", indexType, valueType
    if (name === 'mapping') {
        const key = t['indexType'] ? formatPikeType(t['indexType']) : 'mixed';
        const val = t['valueType'] ? formatPikeType(t['valueType']) : 'mixed';
        return `mapping(${key}:${val})`;
    }

    // Handle varargs: name contains "..."
    if (name === 'varargs' && t['type']) {
        return `${formatPikeType(t['type'])}...`;
    }

    // Simple types: int, string, float, void, mixed, zero
    return name;
}

/**
 * Extract a class/module name from a Pike type object
 * Used for autocomplete to determine what members to suggest
 */
function extractTypeName(typeObj: unknown): string | null {
    if (!typeObj || typeof typeObj !== 'object') {
        return null;
    }

    const t = typeObj as Record<string, unknown>;

    // Direct className (e.g., from Stdio.File variable)
    if (t['className'] && typeof t['className'] === 'string') {
        return t['className'];
    }

    // Object type with embedded class
    if (t['kind'] === 'object' && t['className']) {
        return t['className'] as string;
    }

    // Program type (compiled class)
    if (t['kind'] === 'program' && t['className']) {
        return t['className'] as string;
    }

    // Named type that looks like a module (e.g., "Stdio.File")
    const name = t['name'] as string | undefined;
    if (name && name.includes('.')) {
        return name;
    }

    // Function return type - extract from returnType
    if (t['kind'] === 'function' && t['returnType']) {
        return extractTypeName(t['returnType']);
    }

    // Object with name that's a class reference
    if (name === 'object' && t['className']) {
        return t['className'] as string;
    }

    return null;
}

/**
 * Context for member access expressions (e.g., file->write, obj.method)
 */
interface MemberAccessContext {
    /** Object reference name (e.g., "file" from "file->write") */
    objectName: string;
    /** Member name being accessed (e.g., "write") */
    memberName: string;
    /** Resolved type name (e.g., "Stdio.File") or null if unresolvable */
    typeName: string | null;
    /** Access operator used */
    accessOperator: '->' | '.' | '::';
}

/**
 * Detect if cursor is on a member access expression and resolve the object's type
 * Reuses the same logic as the completion handler for consistency
 */
function detectMemberAccessContext(
    document: TextDocument,
    position: Position,
    cachedSymbols: PikeSymbol[]
): MemberAccessContext | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    // Get the line up to the cursor
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineText = text.slice(lineStart, offset);

    // Check for member access (. or ->) or scope operator (::)
    const memberMatch = lineText.match(IDENTIFIER_PATTERNS.MEMBER_ACCESS);
    const scopeMatch = lineText.match(IDENTIFIER_PATTERNS.SCOPED_ACCESS);

    if (memberMatch) {
        const objectRef = memberMatch[1] ?? '';
        const memberName = memberMatch[2] ?? ''; // May be empty if cursor is at `obj->|`

        // Determine the type name to look up
        let typeName: string | null = null;

        // If it looks like a module reference (e.g., "Stdio.File"), use directly
        if (objectRef.includes('.')) {
            typeName = objectRef;
        } else {
            // Look up local symbol to get its type
            const localSymbol = cachedSymbols.find(s => s.name === objectRef);
            if (localSymbol?.type) {
                typeName = extractTypeName(localSymbol.type);
            }
        }

        return {
            objectName: objectRef,
            memberName,
            typeName,
            accessOperator: lineText.includes('->') ? '->' : '.'
        };
    }

    if (scopeMatch) {
        const objectRef = scopeMatch[1] ?? '';
        const memberName = scopeMatch[2] ?? '';

        // For scope access (ParentClass::), the objectRef is the type name directly
        return {
            objectName: objectRef,
            memberName,
            typeName: objectRef,
            accessOperator: '::'
        };
    }

    return null;
}

/**
 * Get stdlib symbol from a type's member
 * Returns the symbol with documentation if available
 */
async function getStdlibSymbol(
    typeName: string,
    memberName: string,
    stdlibIndexMgr: StdlibIndexManager
): Promise<IntrospectedSymbol | null> {
    if (!memberName) {
        return null;
    }

    try {
        const module = await stdlibIndexMgr.getModule(typeName);
        if (module?.symbols) {
            return module.symbols.get(memberName) ?? null;
        }
    } catch (err) {
        connection.console.log(`[getStdlibSymbol] Failed to get ${memberName} from ${typeName}: ${err}`);
    }

    return null;
}

/**
 * Build markdown content for hover
 */
function buildHoverContent(symbol: PikeSymbol): string | null {
    const sym = symbol as unknown as Record<string, unknown>;
    const parts: string[] = [];

    // Symbol kind badge
    const kindLabel = symbol.kind.charAt(0).toUpperCase() + symbol.kind.slice(1);

    // Build type signature using introspected type info if available
    if (symbol.kind === 'method') {
        // Try introspected type first
        if (symbol.type && symbol.type.kind === 'function') {
            const funcType = symbol.type as PikeFunctionType;
            const returnType = funcType.returnType ? formatPikeType(funcType.returnType) : 'void';

            let argList = '';
            // Handle both 'argTypes' (from types.ts interface) and 'arguments' (from introspection)
            const funcTypeRaw = symbol.type as unknown as Record<string, unknown>;
            const args = (funcType.argTypes ?? funcTypeRaw['arguments']) as unknown[] | undefined;
            if (args && args.length > 0) {
                argList = args.map((arg, i) => {
                    // Handle introspection format: {type: "string", name: "arg1"}
                    // or argTypes format: PikeType object
                    if (typeof arg === 'object' && arg !== null) {
                        const argObj = arg as Record<string, unknown>;
                        const type = formatPikeType(argObj['type'] ?? arg);
                        const name = (argObj['name'] as string) ?? `arg${i}`;
                        return `${type} ${name}`;
                    }
                    return `${formatPikeType(arg)} arg${i}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        } else {
            // Fallback to old parse format
            const returnType = formatPikeType(sym['returnType']);
            const argNames = sym['argNames'] as string[] | undefined;
            const argTypes = sym['argTypes'] as unknown[] | undefined;

            let argList = '';
            if (argTypes && argNames) {
                argList = argTypes.map((t, i) => {
                    const type = formatPikeType(t);
                    const name = argNames[i] ?? `arg${i}`;
                    return `${type} ${name}`;
                }).join(', ');
            }

            parts.push('```pike');
            parts.push(`${returnType} ${symbol.name}(${argList})`);
            parts.push('```');
        }
    } else if (symbol.kind === 'variable' || symbol.kind === 'constant') {
        // Try introspected type first
        const type = symbol.type
            ? formatPikeType(symbol.type)
            : (sym['type'] as { name?: string })?.name ?? 'mixed';

        parts.push('```pike');
        const modifier = symbol.kind === 'constant' ? 'constant ' : '';
        parts.push(`${modifier}${type} ${symbol.name}`);
        parts.push('```');
    } else if (symbol.kind === 'class') {
        parts.push('```pike');
        parts.push(`class ${symbol.name}`);
        parts.push('```');
    } else {
        parts.push(`**${kindLabel}**: \`${symbol.name}\``);
    }

    // Add modifiers if present
    if (symbol.modifiers && symbol.modifiers.length > 0) {
        parts.push(`\n*Modifiers*: ${symbol.modifiers.join(', ')}`);
    }

    // Add documentation if present
    const doc = sym['documentation'] as {
        text?: string;
        params?: Record<string, string>;
        returns?: string;
        throws?: string;
        notes?: string[];
        bugs?: string[];
        deprecated?: string;
        examples?: string[];
        seealso?: string[];
        members?: Record<string, string>;
        items?: Array<{ label: string; text: string }>;
    } | undefined;

    if (doc) {
        // Add separator between signature and documentation
        parts.push('\n---\n');

        // Deprecation warning (show first if present) - use prominent styling
        // VS Code hover doesn't support GitHub alerts or colors, so use clear formatting
        if (doc.deprecated) {
            parts.push('**DEPRECATED**');
            parts.push('');
            parts.push(`> ${doc.deprecated}`);
            parts.push('');
        }

        // Main description text
        if (doc.text) {
            parts.push(doc.text);
            parts.push('');
        }

        // Parameters
        if (doc.params && Object.keys(doc.params).length > 0) {
            parts.push('**Parameters:**');
            for (const [paramName, paramDesc] of Object.entries(doc.params)) {
                // Check if paramDesc contains newlines (markdown formatting from Pike)
                if (paramDesc.includes('\n')) {
                    // Multi-line markdown - indent as nested content under the parameter
                    parts.push(`- \`${paramName}\`:`);
                    // Indent each line with 2 spaces to make it a child of the parameter item
                    const lines = paramDesc.split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            parts.push(`  ${line}`);
                        }
                    }
                } else {
                    // Single line - use inline format
                    parts.push(`- \`${paramName}\`: ${paramDesc}`);
                }
            }
            parts.push('');
        }

        // Return value
        if (doc.returns) {
            parts.push(`**Returns:** ${doc.returns}`);
            parts.push('');
        }

        // Throws
        if (doc.throws) {
            parts.push(`**Throws:** ${doc.throws}`);
            parts.push('');
        }

        // Members (for mapping documentation)
        if (doc.members && Object.keys(doc.members).length > 0) {
            parts.push('**Members:**');
            for (const [memberName, memberDesc] of Object.entries(doc.members)) {
                parts.push(`- \`${memberName}\`: ${memberDesc}`);
            }
            parts.push('');
        }

        // Items (for list/dl documentation)
        if (doc.items && doc.items.length > 0) {
            for (const item of doc.items) {
                parts.push(`- **${item.label}**: ${item.text}`);
            }
            parts.push('');
        }

        // Notes - each note as a separate callout/paragraph
        if (doc.notes && doc.notes.length > 0) {
            for (const note of doc.notes) {
                // Use separate paragraph with bold prefix for each note
                parts.push(`**Note:** ${note}`);
                parts.push('');  // Blank line to separate notes
            }
        }

        // Bugs
        if (doc.bugs && doc.bugs.length > 0) {
            for (const bug of doc.bugs) {
                parts.push(`**Bug:** ${bug}`);
                parts.push('');
            }
        }


        // Examples
        if (doc.examples && doc.examples.length > 0) {
            parts.push('**Example:**');
            for (const example of doc.examples) {
                parts.push('```pike');
                parts.push(example);
                parts.push('```');
            }
            parts.push('');
        }

        // See also references - don't wrap in backticks if already formatted
        if (doc.seealso && doc.seealso.length > 0) {
            // The seealso entries may already have backticks from Pike parser
            const refs = doc.seealso.map(s => {
                // If already starts with backtick, don't add more
                if (s.startsWith('`')) return s;
                return `\`${s}\``;
            }).join(', ');
            parts.push(`**See also:** ${refs}`);
        }

    }

    return parts.join('\n');
}

/**
 * Convert Pike symbol to LSP DocumentSymbol
 */
function convertSymbol(pikeSymbol: PikeSymbol): DocumentSymbol {
    const line = Math.max(0, (pikeSymbol.position?.line ?? 1) - 1);
    const name = pikeSymbol.name || 'unknown';

    const detail = getSymbolDetail(pikeSymbol);

    const result: DocumentSymbol = {
        name,
        kind: convertSymbolKind(pikeSymbol.kind),
        range: {
            start: { line, character: 0 },
            end: { line, character: 1000 }, // Full line range
        },
        selectionRange: {
            start: { line, character: 0 },
            end: { line, character: name.length },
        },
    };

    if (detail) {
        result.detail = detail;
    }

    return result;
}

/**
 * Convert Pike symbol kind to LSP SymbolKind
 */
function convertSymbolKind(kind: string): SymbolKind {
    switch (kind) {
        case 'class':
            return SymbolKind.Class;
        case 'method':
            return SymbolKind.Method;
        case 'variable':
            return SymbolKind.Variable;
        case 'constant':
            return SymbolKind.Constant;
        case 'typedef':
            return SymbolKind.TypeParameter;
        case 'enum':
            return SymbolKind.Enum;
        case 'enum_constant':
            return SymbolKind.EnumMember;
        case 'inherit':
            return SymbolKind.Class;
        case 'import':
            return SymbolKind.Module;
        case 'module':
            return SymbolKind.Module;
        default:
            return SymbolKind.Variable;
    }
}

/**
 * Get detail string for symbol (type info)
 */
function getSymbolDetail(symbol: PikeSymbol): string | undefined {
    // Type info is in various fields depending on symbol kind
    const sym = symbol as unknown as Record<string, unknown>;

    if (sym['returnType']) {
        const returnType = sym['returnType'] as { name?: string };
        const argTypes = sym['argTypes'] as Array<{ name?: string }> | undefined;
        const args = argTypes?.map(t => t?.name ?? 'mixed').join(', ') ?? '';
        return `${returnType.name ?? 'mixed'}(${args})`;
    }

    if (sym['type']) {
        const type = sym['type'] as { name?: string };
        return type.name;
    }

    return undefined;
}

// ============================================================================
// PHASE 7: Enhanced Features
// ============================================================================

/**
 * Document Highlight - highlight all occurrences of symbol at cursor
 */
connection.onDocumentHighlight((params): DocumentHighlight[] | null => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(params.position);

    // Find word at cursor
    let wordStart = offset;
    let wordEnd = offset;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
        wordStart--;
    }
    while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
        wordEnd++;
    }
    const word = text.slice(wordStart, wordEnd);

    if (!word || word.length < 2) {
        return null;
    }

    const highlights: DocumentHighlight[] = [];
    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;
        let searchStart = 0;
        let matchIndex: number;

        while ((matchIndex = line.indexOf(word, searchStart)) !== -1) {
            const beforeChar = matchIndex > 0 ? line[matchIndex - 1] : ' ';
            const afterChar = matchIndex + word.length < line.length ? line[matchIndex + word.length] : ' ';

            if (!/\w/.test(beforeChar ?? '') && !/\w/.test(afterChar ?? '')) {
                highlights.push({
                    range: {
                        start: { line: lineNum, character: matchIndex },
                        end: { line: lineNum, character: matchIndex + word.length },
                    },
                    kind: DocumentHighlightKind.Text,
                });
            }
            searchStart = matchIndex + 1;
        }
    }

    return highlights.length > 0 ? highlights : null;
});

/**
 * Folding Range - provide collapsible regions
 */
connection.onFoldingRanges((params): FoldingRange[] | null => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return null;
    }

    const text = document.getText();
    const lines = text.split('\n');
    const foldingRanges: FoldingRange[] = [];

    // Track brace-based regions
    const braceStack: { line: number; kind: FoldingRangeKind | undefined }[] = [];

    // Track comment regions
    let commentStart: number | null = null;
    let inBlockComment = false;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum] ?? '';
        const trimmed = line.trim();

        // Handle block comments
        if (!inBlockComment && trimmed.startsWith('/*')) {
            commentStart = lineNum;
            inBlockComment = true;
        }
        if (inBlockComment && trimmed.includes('*/')) {
            if (commentStart !== null && lineNum > commentStart) {
                foldingRanges.push({
                    startLine: commentStart,
                    endLine: lineNum,
                    kind: FoldingRangeKind.Comment,
                });
            }
            inBlockComment = false;
            commentStart = null;
        }

        // Handle autodoc comment blocks (//! lines)
        if (trimmed.startsWith('//!')) {
            if (commentStart === null) {
                commentStart = lineNum;
            }
        } else if (commentStart !== null && !trimmed.startsWith('//!') && !inBlockComment) {
            if (lineNum - 1 > commentStart) {
                foldingRanges.push({
                    startLine: commentStart,
                    endLine: lineNum - 1,
                    kind: FoldingRangeKind.Comment,
                });
            }
            commentStart = null;
        }

        // Handle braces for code folding
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '{') {
                // Determine kind based on context
                let kind: FoldingRangeKind | undefined;
                if (trimmed.startsWith('class ') || trimmed.startsWith('inherit ')) {
                    kind = FoldingRangeKind.Region;
                }
                braceStack.push({ line: lineNum, kind });
            } else if (char === '}') {
                const start = braceStack.pop();
                if (start && lineNum > start.line) {
                    const range: FoldingRange = {
                        startLine: start.line,
                        endLine: lineNum,
                    };
                    if (start.kind) {
                        range.kind = start.kind;
                    }
                    foldingRanges.push(range);
                }
            }
        }
    }

    return foldingRanges.length > 0 ? foldingRanges : null;
});

/**
 * Semantic Tokens - provide rich syntax highlighting
 */
connection.languages.semanticTokens.on((params) => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return { data: [] };
    }

    const builder = new SemanticTokensBuilder();
    const text = document.getText();
    const lines = text.split('\n');

    // Helper to check if position is inside a comment
    const isInsideComment = (line: string, charPos: number): boolean => {
        const trimmed = line.trimStart();
        if (PatternHelpers.isCommentLine(trimmed)) {
            return true;
        }
        const lineCommentPos = line.indexOf('//');
        if (lineCommentPos >= 0 && lineCommentPos < charPos) {
            return true;
        }
        const blockOpenPos = line.lastIndexOf('/*', charPos);
        if (blockOpenPos >= 0) {
            const blockClosePos = line.indexOf('*/', blockOpenPos);
            if (blockClosePos < 0 || blockClosePos > charPos) {
                return true;
            }
        }
        return false;
    };

    // Helper to check if position is inside a string
    const isInsideString = (line: string, charPos: number): boolean => {
        let inString = false;
        let escaped = false;
        for (let i = 0; i < charPos; i++) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (line[i] === '\\') {
                escaped = true;
                continue;
            }
            if (line[i] === '"') {
                inString = !inString;
            }
        }
        return inString;
    };

    // Get modifier bits
    const declarationBit = 1 << tokenModifiers.indexOf('declaration');
    const readonlyBit = 1 << tokenModifiers.indexOf('readonly');
    const staticBit = 1 << tokenModifiers.indexOf('static');

    // Add semantic tokens for each symbol declaration and all their usages
    for (const symbol of cached.symbols) {
        if (!symbol.name) continue;

        // Determine token type and modifiers based on symbol kind
        let tokenType = tokenTypes.indexOf('variable');
        let declModifiers = declarationBit;

        // Check if symbol has static modifier
        const isStatic = symbol.modifiers && symbol.modifiers.includes('static');
        if (isStatic) {
            declModifiers |= staticBit;
        }

        switch (symbol.kind) {
            case 'class':
                tokenType = tokenTypes.indexOf('class');
                break;
            case 'method':
                tokenType = tokenTypes.indexOf('method');
                break;
            case 'variable':
                tokenType = tokenTypes.indexOf('variable');
                break;
            case 'constant':
                tokenType = tokenTypes.indexOf('property');
                declModifiers |= readonlyBit;
                break;
            case 'enum':
                tokenType = tokenTypes.indexOf('enum');
                break;
            case 'enum_constant':
                tokenType = tokenTypes.indexOf('enumMember');
                declModifiers |= readonlyBit;
                break;
            case 'typedef':
                tokenType = tokenTypes.indexOf('type');
                break;
            default:
                continue;
        }

        // Find all occurrences of this symbol in the document
        const symbolRegex = PatternHelpers.wholeWordPattern(symbol.name);

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum];
            if (!line) continue;

            let match: RegExpExecArray | null;
            while ((match = symbolRegex.exec(line)) !== null) {
                const matchIndex = match.index;

                // Skip if inside comment or string
                if (isInsideComment(line, matchIndex) || isInsideString(line, matchIndex)) {
                    continue;
                }

                // Check if this is the declaration line
                const isDeclaration = symbol.position &&
                    (symbol.position.line - 1) === lineNum;

                const modifiers = isDeclaration ? declModifiers : 0;

                builder.push(lineNum, matchIndex, symbol.name.length, tokenType, modifiers);
            }
        }
    }

    return builder.build();
});

/**
 * Inlay Hints - show parameter names and type hints
 */
connection.languages.inlayHint.on((params): InlayHint[] | null => {
    const uri = params.textDocument.uri;
    const cached = documentCache.get(uri);
    const document = documents.get(uri);

    if (!cached || !document) {
        return null;
    }

    const hints: InlayHint[] = [];
    const text = document.getText();

    // Find function calls and add parameter hints
    // Look for method symbols to get their parameter info
    const methods = cached.symbols.filter(s => s.kind === 'method');

    // For each method definition, when it's called elsewhere, show param hints
    for (const method of methods) {
        const methodRec = method as unknown as Record<string, unknown>;
        const argNames = methodRec['argNames'] as string[] | undefined;
        if (!argNames || argNames.length === 0) continue;

        // Find calls to this method in the document
        const callPattern = PatternHelpers.functionCallPattern(method.name);
        let match;

        while ((match = callPattern.exec(text)) !== null) {
            const callStart = match.index + match[0].length;

            // Parse the function call to find argument positions
            let parenDepth = 1;
            let argIndex = 0;
            let currentArgStart = callStart;

            for (let i = callStart; i < text.length && parenDepth > 0; i++) {
                const char = text[i];

                if (char === '(') {
                    parenDepth++;
                } else if (char === ')') {
                    parenDepth--;
                    if (parenDepth === 0) {
                        // End of function call - add hint for last argument if not empty
                        const argText = text.slice(currentArgStart, i).trim();
                        if (argText && argIndex < argNames.length) {
                            const argPos = document.positionAt(currentArgStart);
                            hints.push({
                                position: argPos,
                                label: `${argNames[argIndex]}:`,
                                kind: InlayHintKind.Parameter,
                                paddingRight: true,
                            });
                        }
                    }
                } else if (char === ',' && parenDepth === 1) {
                    // Found a comma at the top level - this separates arguments
                    const argText = text.slice(currentArgStart, i).trim();
                    if (argText && argIndex < argNames.length) {
                        const argPos = document.positionAt(currentArgStart);
                        hints.push({
                            position: argPos,
                            label: `${argNames[argIndex]}:`,
                            kind: InlayHintKind.Parameter,
                            paddingRight: true,
                        });
                    }
                    argIndex++;
                    currentArgStart = i + 1;
                }
            }
        }
    }

    return hints.length > 0 ? hints : null;
});

/**
 * Selection Range - smart selection expansion
 */
connection.onSelectionRanges((params): SelectionRange[] | null => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return null;
    }

    const text = document.getText();
    const results: SelectionRange[] = [];

    for (const position of params.positions) {
        const offset = document.offsetAt(position);

        // Find word at position
        let wordStart = offset;
        let wordEnd = offset;
        while (wordStart > 0 && /\w/.test(text[wordStart - 1] ?? '')) {
            wordStart--;
        }
        while (wordEnd < text.length && /\w/.test(text[wordEnd] ?? '')) {
            wordEnd++;
        }

        // Find line range
        let lineStart = offset;
        while (lineStart > 0 && text[lineStart - 1] !== '\n') {
            lineStart--;
        }
        let lineEnd = offset;
        while (lineEnd < text.length && text[lineEnd] !== '\n') {
            lineEnd++;
        }

        // Build selection range hierarchy: word -> line -> document
        const wordRange: SelectionRange = {
            range: {
                start: document.positionAt(wordStart),
                end: document.positionAt(wordEnd),
            },
        };

        const lineRange: SelectionRange = {
            range: {
                start: document.positionAt(lineStart),
                end: document.positionAt(lineEnd),
            },
            parent: wordRange,
        };

        const docRange: SelectionRange = {
            range: {
                start: { line: 0, character: 0 },
                end: document.positionAt(text.length),
            },
            parent: lineRange,
        };

        // Return innermost (word) which has parent chain to outer ranges
        wordRange.parent = lineRange;
        lineRange.parent = docRange;

        results.push(wordRange);
    }

    return results.length > 0 ? results : null;
});

// Handle shutdown
/**
 * Code Action handler - provide quick fixes and refactorings
 */
connection.onCodeAction((params): CodeAction[] => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);
    const cached = documentCache.get(uri);

    if (!document || !cached) {
        return [];
    }

    const actions: CodeAction[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Check if we're on an inherit or import statement for "organize imports"
    const startLine = params.range.start.line;
    const lineText = lines[startLine] ?? '';
    const trimmed = lineText.trim();

    // Organize Imports action - available when cursor is near imports
    if (trimmed.startsWith('inherit') || trimmed.startsWith('import') ||
        trimmed.startsWith('#include')) {

        // Find all import-like statements
        const importLines: { line: number; text: string; type: string }[] = [];
        for (let i = 0; i < lines.length; i++) {
            const lt = (lines[i] ?? '').trim();
            if (lt.startsWith('inherit ')) {
                importLines.push({ line: i, text: lines[i] ?? '', type: 'inherit' });
            } else if (lt.startsWith('import ')) {
                importLines.push({ line: i, text: lines[i] ?? '', type: 'import' });
            } else if (lt.startsWith('#include ')) {
                importLines.push({ line: i, text: lines[i] ?? '', type: 'include' });
            }
        }

        if (importLines.length > 1) {
            // Sort imports: #include first, then import, then inherit
            const sorted = [...importLines].sort((a, b) => {
                const typeOrder = { include: 0, import: 1, inherit: 2 };
                const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 3;
                const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 3;
                if (typeA !== typeB) return typeA - typeB;
                return a.text.localeCompare(b.text);
            });

            // Check if already sorted
            const needsSort = importLines.some((item, i) => item.text !== sorted[i]?.text);

            if (needsSort) {
                const edits: TextEdit[] = [];
                for (let i = 0; i < importLines.length; i++) {
                    const original = importLines[i];
                    const replacement = sorted[i];
                    if (original && replacement && original.text !== replacement.text) {
                        edits.push({
                            range: {
                                start: { line: original.line, character: 0 },
                                end: { line: original.line, character: original.text.length }
                            },
                            newText: replacement.text
                        });
                    }
                }

                if (edits.length > 0) {
                    actions.push({
                        title: 'Organize Imports',
                        kind: CodeActionKind.SourceOrganizeImports,
                        edit: {
                            changes: {
                                [uri]: edits
                            }
                        }
                    });
                }
            }
        }
    }

    // Quick fix for diagnostics on this line
    for (const diag of params.context.diagnostics) {
        // Suggest adding semicolon for syntax errors
        if (diag.message.includes('syntax error') || diag.message.includes('expected')) {
            const diagLine = lines[diag.range.start.line] ?? '';
            if (!diagLine.trim().endsWith(';') && !diagLine.trim().endsWith('{') &&
                !diagLine.trim().endsWith('}')) {
                actions.push({
                    title: 'Add missing semicolon',
                    kind: CodeActionKind.QuickFix,
                    diagnostics: [diag],
                    edit: {
                        changes: {
                            [uri]: [{
                                range: {
                                    start: { line: diag.range.start.line, character: diagLine.length },
                                    end: { line: diag.range.start.line, character: diagLine.length }
                                },
                                newText: ';'
                            }]
                        }
                    }
                });
            }
        }
    }

    return actions;
});

/**
 * Document Formatting handler - format entire document
 */
connection.onDocumentFormatting((params): TextEdit[] => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return [];
    }

    const text = document.getText();
    const options = params.options;
    const tabSize = options.tabSize ?? 4;
    const insertSpaces = options.insertSpaces ?? true;
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    return formatPikeCode(text, indent);
});

/**
 * Range Formatting handler - format selected range
 */
connection.onDocumentRangeFormatting((params): TextEdit[] => {
    const uri = params.textDocument.uri;
    const document = documents.get(uri);

    if (!document) {
        return [];
    }

    const text = document.getText();
    const options = params.options;
    const tabSize = options.tabSize ?? 4;
    const insertSpaces = options.insertSpaces ?? true;
    const indent = insertSpaces ? ' '.repeat(tabSize) : '\t';

    // Get full lines containing the range
    const lines = text.split('\n');
    const startLine = params.range.start.line;
    const endLine = params.range.end.line;

    // Format only the selected lines
    const rangeText = lines.slice(startLine, endLine + 1).join('\n');
    const formattedEdits = formatPikeCode(rangeText, indent, startLine);

    return formattedEdits;
});

/**
 * Format Pike code with Pike-style indentation
 * Pike style: 2-space indent, K&R braces, brace-less control flow supported
 */
function formatPikeCode(text: string, indent: string, startLine: number = 0): TextEdit[] {
    const lines = text.split('\n');
    const edits: TextEdit[] = [];
    let indentLevel = 0;
    let pendingIndent = false; // For brace-less control flow

    // Track context for proper indentation
    let inMultilineComment = false;

    // Control flow keywords that can have brace-less bodies
    const controlKeywords = ['if', 'else', 'while', 'for', 'foreach', 'do'];

    for (let i = 0; i < lines.length; i++) {
        const originalLine = lines[i] ?? '';
        const trimmed = originalLine.trim();

        // Skip empty lines but reset pending indent
        if (trimmed.length === 0) {
            if (pendingIndent) {
                pendingIndent = false;
            }
            continue;
        }

        // Track multiline comments
        if (trimmed.startsWith('/*')) {
            inMultilineComment = true;
        }
        if (trimmed.endsWith('*/') || trimmed.includes('*/')) {
            inMultilineComment = false;
        }

        // Skip comment-only lines (preserve their indentation relative to context)
        if (inMultilineComment || trimmed.startsWith('//') || trimmed.startsWith('*')) {
            const expectedIndent = indent.repeat(indentLevel + (pendingIndent ? 1 : 0));
            const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

            // Only fix if indentation is wrong (but preserve //! autodoc)
            if (currentIndent !== expectedIndent && !trimmed.startsWith('//!')) {
                edits.push({
                    range: {
                        start: { line: startLine + i, character: 0 },
                        end: { line: startLine + i, character: currentIndent.length }
                    },
                    newText: expectedIndent
                });
            }
            continue;
        }

        // Handle pending indent from previous brace-less control flow
        let extraIndent = 0;
        if (pendingIndent) {
            extraIndent = 1;
            pendingIndent = false; // Only applies to one line
        }

        // Decrease indent for closing braces BEFORE applying indent
        if (trimmed.startsWith('}') || trimmed.startsWith(')')) {
            indentLevel = Math.max(0, indentLevel - 1);
        }

        // Calculate expected indentation
        const expectedIndent = indent.repeat(indentLevel + extraIndent);
        const currentIndent = originalLine.match(INDENT_PATTERNS.LEADING_WHITESPACE)?.[1] ?? '';

        // Only create edit if indentation differs
        if (currentIndent !== expectedIndent) {
            edits.push({
                range: {
                    start: { line: startLine + i, character: 0 },
                    end: { line: startLine + i, character: currentIndent.length }
                },
                newText: expectedIndent
            });
        }

        // Increase indent for opening braces
        if (trimmed.endsWith('{')) {
            indentLevel++;
        } else if (trimmed.endsWith('(')) {
            // Multi-line function calls/definitions
            indentLevel++;
        }

        // Check for brace-less control flow
        // Pattern: if/else/while/for/foreach ending with ) but not {
        const isBracelessControl = controlKeywords.some(keyword => {
            // Match: "if (...)", "else if (...)", "while (...)", etc.
            const pattern = new RegExp(`^(}\\s*)?${keyword}\\b.*\\)$`);
            return pattern.test(trimmed) && !trimmed.endsWith('{');
        });

        // Also handle "else" alone on a line
        if (isBracelessControl || (trimmed === 'else' || trimmed === '} else')) {
            pendingIndent = true;
        }

        // Handle single-line blocks like "if (...) { ... }"
        const openBraces = (trimmed.match(INDENT_PATTERNS.OPEN_BRACE) ?? []).length;
        const closeBraces = (trimmed.match(INDENT_PATTERNS.CLOSE_BRACE) ?? []).length;
        const netBraces = openBraces - closeBraces;

        // Adjust for inline blocks
        if (netBraces < 0 && !trimmed.startsWith('}')) {
            indentLevel = Math.max(0, indentLevel + netBraces);
        }
    }

    return edits;
}

// ============================================================================
// FEAT-002: Document Links Provider
// Makes file paths in #include, inherit, and comments clickable
// ============================================================================

/**
 * Document Links handler - find clickable file paths
 * FEAT-002: Support for clickable module paths in inherit and include statements
 */
connection.onDocumentLinks((params): DocumentLink[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) {
        return [];
    }

    const links: DocumentLink[] = [];
    const text = document.getText();
    const lines = text.split('\n');
    const documentDir = getDocumentDirectory(params.textDocument.uri);

    // Pattern 1: inherit Module.SubModule.Class
    const inheritRegex = /inherit\s+([A-Z][\w.]*)/g;
    // Pattern 2: #include "path/to/file"
    const includeRegex = /#include\s+"([^"]+)"/g;
    // Pattern 3: //! @file path/to/file or similar documentation links
    const docLinkRegex = /\/\/[!/]?\s*@(?:file|see|link):\s*([^\s]+)/g;

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum] ?? '';

        // Find inherit statements
        let inheritMatch: RegExpExecArray | null;
        while ((inheritMatch = inheritRegex.exec(line)) !== null) {
            const index = inheritMatch.index;
            const modulePath = inheritMatch[1];
            if (index !== undefined && modulePath) {
                const link = resolveModulePath(modulePath, documentDir);
                if (link) {
                    links.push({
                        range: {
                            start: { line: lineNum, character: index },
                            end: { line: lineNum, character: index + modulePath.length }
                        },
                        target: link.target,
                        tooltip: link.tooltip
                    });
                }
            }
        }

        // Reset regex state for next pattern
        inheritRegex.lastIndex = 0;

        // Find #include statements
        let includeMatch: RegExpExecArray | null;
        while ((includeMatch = includeRegex.exec(line)) !== null) {
            const index = includeMatch.index;
            const filePath = includeMatch[1];
            if (index !== undefined && filePath) {
                const link = resolveIncludePath(filePath, documentDir);
                if (link) {
                    links.push({
                        range: {
                            start: { line: lineNum, character: index },
                            end: { line: lineNum, character: index + filePath.length + 2 } // Include quotes
                        },
                        target: link.target,
                        tooltip: link.tooltip
                    });
                }
            }
        }

        // Reset regex state for next pattern
        includeRegex.lastIndex = 0;

        // Find documentation links
        let docMatch: RegExpExecArray | null;
        while ((docMatch = docLinkRegex.exec(line)) !== null) {
            const index = docMatch.index;
            const filePath = docMatch[1];
            if (index !== undefined && filePath) {
                // Check if it looks like a file path
                if (filePath.includes('/') || filePath.includes('.')) {
                    const link = resolveIncludePath(filePath, documentDir);
                    if (link) {
                        links.push({
                            range: {
                                start: { line: lineNum, character: index },
                                end: { line: lineNum, character: index + filePath.length }
                            },
                            target: link.target,
                            tooltip: link.tooltip
                        });
                    }
                }
            }
        }

        docLinkRegex.lastIndex = 0;
    }

    connection.console.log(`[DOC_LINKS] Found ${links.length} links`);
    return links;
});

/**
 * Resolve a module path from inherit statement to a file URI
 */
function resolveModulePath(modulePath: string, documentDir: string): { target: string; tooltip: string } | null {
    // Try to find the module in the workspace
    // This is a simplified version - full implementation would search stdlib too

    // Convert Module.SubModule to file path: Module.pmod/SubModule.pike
    // Search in workspace index first
    const workspaceUris = Array.from(documentCache.keys());
    for (const uri of workspaceUris) {
        if (uri.includes(modulePath) || uri.endsWith(modulePath + '.pike') || uri.endsWith(modulePath + '.pmod')) {
            return {
                target: uri,
                tooltip: `Navigate to ${modulePath}`
            };
        }
    }

    // Try stdlib paths (async, handled silently for now)
    if (bridge) {
        void bridge.resolveModule(modulePath, documentDir).catch(() => {
            // Silently ignore resolution failures
        });
    }

    return null;
}

/**
 * Resolve an include path to a file URI
 */
function resolveIncludePath(filePath: string, documentDir: string): { target: string; tooltip: string } | null {
    // Absolute path
    if (filePath.startsWith('/')) {
        return {
            target: `file://${filePath}`,
            tooltip: filePath
        };
    }

    // Relative path
    const resolvedPath = `${documentDir}/${filePath}`;

    // Check if file exists (simplified - in production we'd use fs.existsSync)
    // For now, just return the resolved path
    return {
        target: `file://${resolvedPath}`,
        tooltip: filePath
    };
}

/**
 * Get the directory path from a file URI
 */
function getDocumentDirectory(uri: string): string {
    // Remove file:// prefix and get directory
    const path = uri.replace(/^file:\/\/\/?/, '');
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash) : path;
}

// ============================================================================
// FEAT-001: Code Lens Provider
// Shows reference counts and quick actions above functions/classes
// ============================================================================

/**
 * Code Lens handler - provide inline annotations
 * FEAT-001: Show reference counts above functions, classes, and methods
 */
connection.onCodeLens((params): CodeLens[] => {
    const uri = params.textDocument.uri;
    const cache = documentCache.get(uri);

    if (!cache) {
        return [];
    }

    const lenses: CodeLens[] = [];

    for (const symbol of cache.symbols) {
        // Only add lenses for certain symbol kinds
        if (symbol.kind === 'method' || symbol.kind === 'class') {
            const line = (symbol.position?.line ?? 1) - 1;
            const char = symbol.position?.column ?? 0;
            const symbolName = symbol.name ?? '';

            lenses.push({
                range: {
                    start: { line, character: char },
                    end: { line, character: char + symbolName.length }
                },
                data: {
                    uri,
                    symbolName,
                    kind: symbol.kind,
                    range: { line, character: char }
                }
            });
        }
    }

    connection.console.log(`[CODE_LENS] Generated ${lenses.length} lenses`);
    return lenses;
});

/**
 * Code Lens resolve handler - compute reference counts
 */
connection.onCodeLensResolve((lens): CodeLens => {
    const data = lens.data as { uri: string; symbolName: string; kind: string; range: Range };

    if (!data) {
        return lens;
    }

    // Count references to this symbol across workspace
    let refCount = 0;

    // Count in current document
    const currentCache = documentCache.get(data.uri);
    if (currentCache && currentCache.symbolPositions) {
        const positions = currentCache.symbolPositions.get(data.symbolName);
        refCount = positions?.length ?? 0;
    }

    // Add reference counts from other documents
    for (const [uri, cache] of documentCache) {
        if (uri !== data.uri && cache.symbolPositions) {
            const positions = cache.symbolPositions.get(data.symbolName);
            if (positions) {
                refCount += positions.length;
            }
        }
    }

    lens.command = {
        title: `${refCount} reference${refCount !== 1 ? 's' : ''}`,
        command: 'editor.action.findReferences',
        arguments: [data.uri, data.range]
    };

    connection.console.log(`[CODE_LENS] Resolved lens for "${data.symbolName}": ${refCount} refs`);
    return lens;
});

connection.onShutdown(async () => {
    connection.console.log('Pike LSP Server shutting down...');
    if (bridge) {
        await bridge.stop();
    }
});

// Listen for document events
documents.listen(connection);

// Start listening
connection.listen();

connection.console.log('Pike LSP Server started');
