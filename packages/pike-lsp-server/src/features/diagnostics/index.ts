/**
 * Diagnostics Feature Handlers
 *
 * Provides document validation, diagnostics, and configuration handling.
 * Extracted from server.ts for modular feature organization.
 *
 * Refactored (Issue #136): Split into submodules for maintainability:
 * - utils.ts: Diagnostic conversion utilities
 * - symbol-index.ts: Symbol position index building
 * - change-detection.ts: Incremental change detection
 */

import type {
    Connection,
    TextDocuments,
    Diagnostic,
    DidChangeConfigurationParams,
    Range,
} from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { PikeSettings, DocumentCacheEntry } from '../../core/types.js';
import { TypeDatabase, CompiledProgramInfo } from '../../type-database.js';
import { Logger } from '@pike-lsp/core';
import { DIAGNOSTIC_DELAY_DEFAULT, DEFAULT_MAX_PROBLEMS } from '../../constants/index.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import { detectRoxenModule, provideRoxenDiagnostics } from '../roxen/index.js';

// Import from split modules
export { convertDiagnostic, isDeprecatedSymbolDiagnostic, extractDeprecatedFromSymbols } from './utils.js';
export { buildSymbolNameIndex } from './symbol-index.js';
export { buildSymbolPositionIndex, buildSymbolPositionIndexRegex, flattenSymbols } from './symbol-index.js';
export { classifyChange, stripLineComments, type ChangeClassification } from './change-detection.js';

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
    // Import functions from split modules
    const { convertDiagnostic, isDeprecatedSymbolDiagnostic, extractDeprecatedFromSymbols } = require('./utils.js');
    const { buildSymbolPositionIndex, buildSymbolNameIndex, flattenSymbols } = require('./symbol-index.js');
    const { classifyChange } = require('./change-detection.js');

    // NOTE: We access services.bridge dynamically instead of destructuring,
    // because bridge is null when handlers are registered and only initialized later in onInitialize.
    const { documentCache, typeDatabase, workspaceIndex } = services;
    const log = new Logger('diagnostics');

    // Validation timers for debouncing
    const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
    // INC-563: Track expected document version for each debounced validation
    // This prevents stale validations from overwriting fresher results after undo
    const validationVersions = new Map<string, number>();

    // INC-002: Track change ranges for incremental parsing.
    // Stores the range of the most recent change for each document URI.
    const pendingChangeRanges = new Map<string, Range | undefined>();

    // Configuration settings
    const defaultSettings: PikeSettings = {
        pikePath: 'pike',
        maxNumberOfProblems: DEFAULT_MAX_PROBLEMS,
        diagnosticDelay: DIAGNOSTIC_DELAY_DEFAULT,
    };
    let globalSettings: PikeSettings = defaultSettings;

    /**
     * Validate document with debouncing
     * INC-002: Now includes incremental change classification
     * LOG-14-01: Logs didChange events and debounce execution
     */
    function validateDocumentDebounced(document: TextDocument): void {
        const uri = document.uri;
        const version = document.version;

        // LOG-14-01: Track didChange event triggering debounce
        connection.console.log(`[DID_CHANGE] uri=${uri}, version=${version}, delay=${globalSettings.diagnosticDelay}ms`);

        // Clear existing timer
        const existingTimer = validationTimers.get(uri);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // INC-563: Store expected version for this scheduled validation
        // This prevents stale validations from overwriting fresher results after undo
        const expectedVersion = version;
        validationVersions.set(uri, expectedVersion);

        // Set new timer
        const timer = setTimeout(() => {
            validationTimers.delete(uri);
            validationVersions.delete(uri);

            // INC-563: Check if this validation is stale (a newer version was scheduled)
            const currentVersion = document.version;
            if (currentVersion !== expectedVersion) {
                connection.console.log(
                    `[DEBOUNCE] uri=${uri}, expected=${expectedVersion}, current=${currentVersion} - SKIPPING stale validation`
                );
                // Clear pending change range since we're skipping
                pendingChangeRanges.delete(uri);
                return;
            }

            // LOG-14-01: Track debounce timer execution
            connection.console.log(`[DEBOUNCE] uri=${uri}, version=${version}, executing validateDocument`);

            // INC-002: Classify change to determine if parsing is needed
            const changeRange = pendingChangeRanges.get(uri);
            const cachedEntry = documentCache.get(uri);
            const classification = classifyChange(document, changeRange, cachedEntry);

            connection.console.log(
                `[INC-002] Change classification: canSkip=${classification.canSkip}, reason=${classification.reason}`
            );

            if (classification.canSkip) {
                // Skip parsing entirely - just update cache metadata
                connection.console.log(`[INC-002] Skipping parse for ${uri} (${classification.reason})`);

                if (cachedEntry && classification.newHash) {
                    // Update hash metadata without full reparse
                    cachedEntry.contentHash = classification.newHash;
                    if (classification.newLineHashes) {
                        cachedEntry.lineHashes = classification.newLineHashes;
                    }
                    cachedEntry.version = version;
                }

                // Clear the pending change range
                pendingChangeRanges.delete(uri);
                return;
            }

            // Proceed with full validation
            const promise = validateDocument(document, classification);
            documentCache.setPending(uri, promise);
            promise.catch(err => {
                log.error('Debounced validation failed', {
                    uri,
                    error: err instanceof Error ? err.message : String(err)
                });
            });
        }, globalSettings.diagnosticDelay);

        validationTimers.set(uri, timer);
    }

    /**
     * Validate document and send diagnostics
     * INC-002: Accepts classification to reuse computed hashes
     * LOG-14-01: Logs validation start with version tracking
     */
    async function validateDocument(document: TextDocument, classification?: import('./change-detection.js').ChangeClassification): Promise<void> {
        const uri = document.uri;
        const version = document.version;

        // LOG-14-01: Track validation start before bridge operations
        connection.console.log(`[VALIDATE_START] uri=${uri}, version=${version}`);

        const bridge = services.bridge;
        if (!bridge) {
            log.warn('Bridge not available');
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

        connection.console.log(`[VALIDATE] Document version: ${version}, length: ${text.length} chars`);

        // INC-002: Compute hashes for incremental change detection
        // Use pre-computed hashes from classification if available
        const contentHash = classification?.newHash ?? computeContentHash(text);
        const lineHashes = classification?.newLineHashes ?? computeLineHashes(text);

        // Extract filename from URI and decode URL encoding
        const filename = decodeURIComponent(uri.replace(/^file:\/\//, ''));

        try {
            connection.console.log(`[VALIDATE] Calling unified analyze for: ${filename}`);
            // PERF-004: Include 'tokenize' to avoid separate findOccurrences call for symbolPositions
            // Tokens are used to build symbolPositions index without additional IPC round-trip
            // Single unified analyze call - replaces 3 separate calls (introspect, parse, analyzeUninitialized)
            // Pass document version for cache key (open docs use LSP version, no stat overhead)
            const analyzeResult = await bridge.analyze(text, ['parse', 'introspect', 'diagnostics', 'tokenize'], filename, version);

            // Log completion status
            const hasParse = !!analyzeResult.result?.parse;
            const hasIntrospect = !!analyzeResult.result?.introspect;
            const hasDiagnostics = !!analyzeResult.result?.diagnostics;
            connection.console.log(`[VALIDATE] Analyze completed - parse: ${hasParse}, introspect: ${hasIntrospect}, diagnostics: ${hasDiagnostics}`);


            // Log cache hit/miss for debugging
            if (analyzeResult._perf) {
                const cacheHit = analyzeResult._perf.cache_hit;
                connection.console.log(`[VALIDATE] Cache ${cacheHit ? 'HIT' : 'MISS'} for ${uri}`);
            }

            // Log any partial failures
            if (analyzeResult.failures && Object.keys(analyzeResult.failures).length > 0) {
                connection.console.log(`[VALIDATE] Partial failures: ${Object.keys(analyzeResult.failures).join(', ')}`);
            }

            // Extract results with fallback values for partial failures
            const parseData = analyzeResult.failures?.parse
                ? { symbols: [], diagnostics: [] }
                : analyzeResult.result?.parse ?? { symbols: [], diagnostics: [] };
            const introspectData = analyzeResult.failures?.introspect
                ? { success: 0, symbols: [], functions: [], variables: [], classes: [], inherits: [], diagnostics: [] }
                : analyzeResult.result?.introspect ?? { success: 0, symbols: [], functions: [], variables: [], classes: [], inherits: [], diagnostics: [] };
            const diagnosticsData = analyzeResult.failures?.diagnostics
                ? { diagnostics: [] }
                : analyzeResult.result?.diagnostics ?? { diagnostics: [] };
            // PERF-004: Extract tokens for symbolPositions building
            const tokenizeData = analyzeResult.result?.tokenize?.tokens;

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
            for (const pikeDiag of introspectData.diagnostics) {
                if (diagnostics.length >= globalSettings.maxNumberOfProblems) {
                    break;
                }
                // Skip module resolution errors
                if (shouldSkipDiagnostic(pikeDiag.message)) {
                    continue;
                }

                // Check if this diagnostic is about a deprecated symbol
                const isDeprecated = isDeprecatedSymbolDiagnostic(
                    pikeDiag.message,
                    introspectData.symbols
                );

                diagnostics.push(convertDiagnostic(pikeDiag, document, { deprecated: isDeprecated }));
            }

            // Update type database with introspected symbols if compilation succeeded
            if (introspectData.success && introspectData.symbols.length > 0) {
                // Convert introspected symbols to Maps
                const symbolMap = new Map(introspectData.symbols.map(s => [s.name, s]));
                const functionMap = new Map(introspectData.functions.map(s => [s.name, s]));
                const variableMap = new Map(introspectData.variables.map(s => [s.name, s]));
                const classMap = new Map(introspectData.classes.map(s => [s.name, s]));

                // Estimate size
                const sizeBytes = TypeDatabase.estimateProgramSize(symbolMap, introspectData.inherits);

                const programInfo: CompiledProgramInfo = {
                    uri,
                    version,
                    symbols: symbolMap,
                    functions: functionMap,
                    variables: variableMap,
                    classes: classMap,
                    inherits: introspectData.inherits,
                    imports: new Set(),
                    compiledAt: Date.now(),
                    sizeBytes,
                };

                typeDatabase.setProgram(programInfo);

                // Also update legacy cache for backward compatibility
                // Merge introspected symbols with parse symbols to get position info
                const legacySymbols: import('@pike-lsp/pike-bridge').PikeSymbol[] = [];

                // Log introspection results for debugging
                connection.console.log(`[VALIDATE] Introspection: success=${introspectData.success}, symbols=${introspectData.symbols.length}, functions=${introspectData.functions?.length || 0}, classes=${introspectData.classes?.length || 0}`);
                // Log first few introspected symbol names/kinds
                for (let i = 0; i < Math.min(5, introspectData.symbols.length); i++) {
                    const sym = introspectData.symbols[i];
                    if (sym) {
                        connection.console.log(`[VALIDATE]   Introspect ${i}: name="${sym.name}", kind=${sym.kind}`);
                    }
                }

                if (parseData && parseData.symbols.length > 0) {
                    // Flatten nested symbols to include class members
                    // This ensures get_n, get_e, set_random etc. are indexed
                    const flatParseSymbols = flattenSymbols(parseData.symbols);

                    connection.console.log(`[VALIDATE] Flattened ${parseData.symbols.length} symbols to ${flatParseSymbols.length} total (including class members)`);
                    // Log first few parsed symbol names/kinds
                    for (let i = 0; i < Math.min(5, flatParseSymbols.length); i++) {
                        const sym = flatParseSymbols[i];
                        if (sym) {
                            connection.console.log(`[VALIDATE]   Parsed ${i}: name="${sym.name}", kind=${sym.kind}`);
                        }
                    }

                    // Build a set of all parsed symbol names (including flattened) for faster lookup
                    const parsedSymbolNames = new Set(flatParseSymbols.map(s => s.name));

                    // For each parsed symbol (including nested), enrich with type info from introspection
                    for (const parsedSym of flatParseSymbols) {
                        // Skip symbols with null names
                        if (!parsedSym.name) continue;

                        const introspectedSym = introspectData.symbols.find(s => s.name === parsedSym.name);
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
                    // Check against flattened symbols to avoid missing class methods
                    for (const introspectedSym of introspectData.symbols) {
                        // Skip symbols with null names
                        if (!introspectedSym.name) continue;

                        const inParse = parsedSymbolNames.has(introspectedSym.name);
                        if (!inParse) {
                            connection.console.log(`[VALIDATE]   Adding introspected-only symbol: name="${introspectedSym.name}", kind=${introspectedSym.kind}`);
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
                    for (const s of introspectData.symbols) {
                        // Skip symbols with null names
                        if (!s.name) continue;

                        legacySymbols.push({
                            name: s.name,
                            kind: s.kind as import('@pike-lsp/pike-bridge').PikeSymbolKind,
                            modifiers: s.modifiers,
                            type: s.type,
                        });
                    }
                }

                // Resolve include/import dependencies for IntelliSense
                let dependencies: import('../../core/types.js').DocumentDependencies | undefined;
                if (services.includeResolver) {
                    dependencies = await services.includeResolver.resolveDependencies(uri, legacySymbols);
                }

                // P.2 FIX: Store hierarchical symbols (not flattened) so classSymbol.children works
                // Apply extractDeprecatedFromSymbols to preserve class hierarchy with deprecated flags
                const hierarchicalSymbols = parseData && parseData.symbols.length > 0
                    ? extractDeprecatedFromSymbols(parseData.symbols)
                    : legacySymbols;

                const cacheEntry: DocumentCacheEntry = {
                    version,
                    symbols: hierarchicalSymbols,  // Use hierarchical symbols with children preserved
                    diagnostics,
                    symbolPositions: await buildSymbolPositionIndex(text, legacySymbols, tokenizeData, bridge),
                    // PERF-005: Build symbol name index for O(1) hover lookups
                    symbolNames: buildSymbolNameIndex(hierarchicalSymbols),
                    // INC-002: Store hashes for incremental change detection
                    contentHash,
                    lineHashes,
                    // Store introspection for AutoDoc data including @deprecated tags
                    introspection: introspectData.success ? introspectData : undefined,
                };
                if (dependencies) {
                    cacheEntry.dependencies = dependencies;
                if (introspectData.inherits) {
                    cacheEntry.inherits = introspectData.inherits;
                }
                }

                documentCache.set(uri, cacheEntry);
                connection.console.log(`[VALIDATE] Cached document - total symbols: ${legacySymbols.length}, introspection success: ${introspectData.success}`);
            } else if (parseData && parseData.symbols.length > 0) {
                // Introspection failed, use parse results
                // P.2 FIX: Extract @deprecated tags from source even when introspection fails
                const symbolsWithDeprecated = extractDeprecatedFromSymbols(parseData.symbols);
                connection.console.log(`[VALIDATE] Using parse result with ${symbolsWithDeprecated.length} symbols (with deprecated extraction)`);
                // Log first few symbol names for debugging
                for (let i = 0; i < Math.min(5, parseData.symbols.length); i++) {
                    const sym = parseData.symbols[i];
                    if (sym) {
                        connection.console.log(`[VALIDATE]   Symbol ${i}: name="${sym.name}", kind=${sym.kind}`);
                    }
                }
                // Resolve include/import dependencies for IntelliSense
                let dependencies: import('../../core/types.js').DocumentDependencies | undefined;
                if (services.includeResolver) {
                    dependencies = await services.includeResolver.resolveDependencies(uri, symbolsWithDeprecated);
                }

                const cacheEntry: DocumentCacheEntry = {
                    version,
                    symbols: symbolsWithDeprecated,  // Use symbols with deprecated extracted from source
                    diagnostics,
                    symbolPositions: await buildSymbolPositionIndex(text, symbolsWithDeprecated, tokenizeData, bridge),
                    // PERF-005: Build symbol name index for O(1) hover lookups
                    symbolNames: buildSymbolNameIndex(symbolsWithDeprecated),
                    // INC-002: Store hashes for incremental change detection
                    contentHash,
                    lineHashes,
                };
                if (dependencies) {
                    cacheEntry.dependencies = dependencies;
                if (introspectData.inherits) {
                    cacheEntry.inherits = introspectData.inherits;
                }
                }

                documentCache.set(uri, cacheEntry);
                connection.console.log(`[VALIDATE] Cached document - symbols count: ${symbolsWithDeprecated.length}`);
            } else {
                connection.console.log(`[VALIDATE] No parse result available - features will not work`);
            }

            // Process diagnostics from unified analyze (includes syntax errors + uninitialized warnings)
            if (diagnosticsData.diagnostics && diagnosticsData.diagnostics.length > 0) {
                connection.console.log(`[VALIDATE] Found ${diagnosticsData.diagnostics.length} diagnostics from analyze`);
                for (const diag of diagnosticsData.diagnostics) {
                    if (diagnostics.length >= globalSettings.maxNumberOfProblems) {
                        break;
                    }
                    // Determine severity: 'error' = 1 (Error), 'warning' = 2 (Warning), default = Error
                    const severity = diag.severity === 'warning' ? 2 : 1;
                    // Determine source based on diagnostic type
                    const source = diag.variable ? 'pike-uninitialized' : 'pike';

                    diagnostics.push({
                        severity,
                        range: {
                            start: {
                                line: Math.max(0, (diag.position?.line ?? 1) - 1),
                                character: Math.max(0, diag.position?.character ?? 0),
                            },
                            end: {
                                line: Math.max(0, (diag.position?.line ?? 1) - 1),
                                character: Math.max(0, diag.position?.character ?? 0) + (diag.variable?.length ?? 10),
                            },
                        },
                        message: diag.message,
                        source,
                    });
                }
            }

            // --- Roxen diagnostics integration ---
            try {
                if (services.bridge?.bridge) {
                    const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
                    if (roxenInfo && roxenInfo.is_roxen_module === 1) {
                        const roxenDiags = await provideRoxenDiagnostics(uri, text, services.bridge.bridge, 0);
                        diagnostics.push(...roxenDiags);
                        connection.console.log(`[VALIDATE] Added ${roxenDiags.length} Roxen diagnostics`);
                    }
                }
            } catch (err) {
                connection.console.log(`[VALIDATE] Roxen diagnostics failed: ${err}`);
            }
            // --- End Roxen integration ---

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
        const promise = validateDocument(event.document);
        documentCache.setPending(event.document.uri, promise);
        promise.catch(err => {
            log.error('Document open validation failed', {
                uri: event.document.uri,
                error: err instanceof Error ? err.message : String(err)
            });
        });
    });

    // Handle document changes - debounced validation (errors caught in setTimeout handler)
    // INC-002: Capture change range for incremental parsing
    documents.onDidChangeContent((change) => {
        validateDocumentDebounced(change.document);
    });

    // INC-002: Listen to raw LSP change notifications to capture change ranges
    // This runs before TextDocuments processes the change, allowing us to capture the range
    connection.onDidChangeTextDocument((params) => {
        const contentChanges = params.contentChanges;
        let changeRange: Range | undefined;

        if (contentChanges.length > 0) {
            const firstChange = contentChanges[0];
            // If range is present, it's an incremental change
            // If range is absent, it's a full document replacement
            if (firstChange && 'range' in firstChange && firstChange.range) {
                changeRange = firstChange.range;
            }
        }

        // Store the change range for use in debounced validation
        pendingChangeRanges.set(params.textDocument.uri, changeRange);
    });

    // Handle document save - validate immediately without debouncing
    documents.onDidSave((event) => {
        const promise = validateDocument(event.document);
        documentCache.setPending(event.document.uri, promise);
        promise.catch(err => {
            log.error('Document save validation failed', {
                uri: event.document.uri,
                error: err instanceof Error ? err.message : String(err)
            });
        });
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
