/**
 * Diagnostics Feature Handlers
 *
 * Provides document validation, diagnostics, and configuration handling.
 * Extracted from server.ts for modular feature organization.
 */

import type {
    Connection,
    TextDocuments,
    Diagnostic,
    DiagnosticSeverity,
    DidChangeConfigurationParams,
} from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeDiagnostic } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import type { PikeSettings, DocumentCacheEntry, Position } from '../core/types.js';
import { PatternHelpers } from '../utils/regex-patterns.js';
import { TypeDatabase, CompiledProgramInfo } from '../type-database.js';
import { DIAGNOSTIC_DELAY_DEFAULT, DEFAULT_MAX_PROBLEMS } from '../constants/index.js';

/**
 * Register diagnostics handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager
 */
export function registerDiagnosticsHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { bridge, logger, documentCache, typeDatabase, workspaceIndex } = services;
    const log = logger.child('diagnostics');

    // Validation timers for debouncing
    const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();

    // Configuration settings
    const defaultSettings: PikeSettings = {
        pikePath: 'pike',
        maxNumberOfProblems: DEFAULT_MAX_PROBLEMS,
        diagnosticDelay: DIAGNOSTIC_DELAY_DEFAULT,
    };
    let globalSettings: PikeSettings = defaultSettings;

    /**
     * Convert Pike severity to LSP severity
     */
    function convertSeverity(severity: string): DiagnosticSeverity {
        switch (severity) {
            case 'error':
                return 1; // DiagnosticSeverity.Error
            case 'warning':
                return 2; // DiagnosticSeverity.Warning
            case 'info':
                return 3; // DiagnosticSeverity.Information
            default:
                return 1; // DiagnosticSeverity.Error
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
     * Build symbol position index for O(1) lookups
     * PERF-001: Uses Pike tokenization for accuracy and performance
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
        const bridgeManager = bridge;
        if (bridgeManager?.isRunning()) {
            try {
                const result = await bridgeManager.findOccurrences(text);

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
            void validateDocument(document);
        }, globalSettings.diagnosticDelay);

        validationTimers.set(uri, timer);
    }

    /**
     * Validate document and send diagnostics
     */
    async function validateDocument(document: TextDocument): Promise<void> {
        const uri = document.uri;
        connection.console.log(`[VALIDATE] Starting validation for: ${uri}`);

        const bridgeManager = bridge;
        if (!bridgeManager) {
            log.warn('Bridge not available');
            return;
        }

        if (!bridgeManager.isRunning()) {
            connection.console.warn('[VALIDATE] Bridge not running, attempting to start...');
            try {
                await bridgeManager.start();
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
            const introspectResult = await bridgeManager.introspect(text, filename);
            connection.console.log(`[VALIDATE] Introspection result - success: ${introspectResult.success}, symbols: ${introspectResult.symbols.length}`);

            // Always parse to get position info (needed for LSP features)
            const parseResult = await bridgeManager.parse(text, filename);
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
                const uninitResult = await bridgeManager.analyzeUninitialized(text, filename);
                if (uninitResult.diagnostics && uninitResult.diagnostics.length > 0) {
                    connection.console.log(`[VALIDATE] Found ${uninitResult.diagnostics.length} uninitialized variable warnings`);
                    for (const uninitDiag of uninitResult.diagnostics) {
                        if (diagnostics.length >= globalSettings.maxNumberOfProblems) {
                            break;
                        }
                        // Convert uninitialized variable diagnostic to LSP diagnostic
                        diagnostics.push({
                            severity: 2, // DiagnosticSeverity.Warning
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

    // Configuration change handler
    connection.onDidChangeConfiguration((change: DidChangeConfigurationParams) => {
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
        try {
            void validateDocument(event.document);
        } catch (err) {
            log.error('Document open validation failed', {
                error: err instanceof Error ? err.message : String(err)
            });
        }
    });

    // Handle document changes
    documents.onDidChangeContent((change) => {
        try {
            validateDocumentDebounced(change.document);
        } catch (err) {
            log.error('Document change validation failed', {
                error: err instanceof Error ? err.message : String(err)
            });
        }
    });

    // Handle document save
    documents.onDidSave((event) => {
        try {
            void validateDocument(event.document);
        } catch (err) {
            log.error('Document save validation failed', {
                error: err instanceof Error ? err.message : String(err)
            });
        }
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
}
