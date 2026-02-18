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
    DidChangeConfigurationParams,
    Position,
    Range,
} from 'vscode-languageserver/node.js';
import { DiagnosticTag } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol, PikeDiagnostic } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import type { PikeSettings } from '../core/types.js';
import { PatternHelpers } from '../utils/regex-patterns.js';
import { TypeDatabase, CompiledProgramInfo } from '../type-database.js';
import { Logger } from '@pike-lsp/core';
import { DIAGNOSTIC_DELAY_DEFAULT, DEFAULT_MAX_PROBLEMS } from '../constants/index.js';
import { computeContentHash, computeLineHashes } from '../services/document-cache.js';
import { detectRoxenModule, provideRoxenDiagnostics } from '../features/roxen/index.js';
import { buildSymbolNameIndex } from './diagnostics/symbol-index.js';
import { extractDeprecatedFromSymbols, convertSeverity } from './diagnostics/utils.js';

/**
 * Convert Pike diagnostic to LSP diagnostic
 * Exported for testing
 *
 * Adds Diagnostic.code and Diagnostic.tags:
 * - code: Error code identifier (e.g., "uninitialized-var", "syntax-error")
 * - tags: DiagnosticTag.Deprecated for deprecated symbol usage
 */
export function convertDiagnostic(
    pikeDiag: PikeDiagnostic,
    document: TextDocument,
    options?: { deprecated?: boolean; code?: string }
): Diagnostic {
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

    // Build diagnostic
    const diagnostic: Diagnostic = {
        severity: convertSeverity(pikeDiag.severity),
        range: {
            start: { line, character: startChar },
            end: { line, character: endChar },
        },
        message: pikeDiag.message,
        source: 'pike',
    };

    // Add diagnostic code if provided
    if (options?.code) {
        diagnostic.code = options.code;
    } else {
        // Infer code from message with improved matching
        const msgLower = pikeDiag.message.toLowerCase();
        if (msgLower.includes('uninitialized') || msgLower.includes('used before') || msgLower.includes('may be uninitialized')) {
            diagnostic.code = 'uninitialized-var';
        } else if (msgLower.includes('syntax') || msgLower.includes('parse') || msgLower.includes('unexpected token') || msgLower.includes('bracket mismatch')) {
            diagnostic.code = 'syntax-error';
        } else if (msgLower.includes('type') || msgLower.includes('mismatch') || msgLower.includes('illegal')) {
            diagnostic.code = 'type-mismatch';
        } else if (msgLower.includes('unknown') || msgLower.includes('illegal')) {
            diagnostic.code = 'unknown-symbol';
        }
    }

    // Improve message display: add line:column if not already present
    if (!pikeDiag.message.includes(`line ${pikeDiag.position.line}`) && pikeDiag.position.line > 0) {
        const lineNum = pikeDiag.position.line;
        const colNum = pikeDiag.position.column ?? 1;
        // Prepend location info for errors
        if (pikeDiag.severity === 'error') {
            diagnostic.message = `[Line ${lineNum}:${colNum}] ${pikeDiag.message}`;
        }
    }

    // Add tags for deprecated symbols
    if (options?.deprecated) {
        diagnostic.tags = [DiagnosticTag.Deprecated];
    }

    return diagnostic;
}

/**
 * Check if a diagnostic message relates to a deprecated symbol.
 *
 * @param message - The diagnostic message to check
 * @param introspectSymbols - Symbols from introspection data
 * @returns true if the message mentions a deprecated symbol
 */
export function isDeprecatedSymbolDiagnostic(
    message: string,
    introspectSymbols: readonly { name: string; deprecated?: boolean | number }[]
): boolean {
    const deprecatedNames = new Set<string>();
    for (const sym of introspectSymbols) {
        if (sym.deprecated === true || sym.deprecated === 1) {
            deprecatedNames.add(sym.name);
        }
    }

    for (const name of deprecatedNames) {
        if (message.includes(name)) {
            return true;
        }
    }

    return false;
}

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
    // NOTE: We access services.bridge dynamically instead of destructuring,
    // because bridge is null when handlers are registered and only initialized later in onInitialize.
    const { documentCache, typeDatabase, workspaceIndex } = services;
    const log = new Logger('diagnostics');

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
     * Build symbol position index for O(1) lookups
     * PERF-001: Uses Pike tokenization for accuracy and performance
     * PERF-004: Reuses tokens from analyze() to avoid separate findOccurrences() IPC call
     */
    async function buildSymbolPositionIndex(
        text: string,
        symbols: PikeSymbol[],
        tokens?: import('@pike-lsp/pike-bridge').PikeToken[]
    ): Promise<Map<string, Position[]>> {
        const index = new Map<string, Position[]>();

        // Build set of symbol names we care about AND map to definition lines
        const symbolNames = new Set<string>();
        const definitionLines = new Map<string, number>(); // symbol name -> definition line

        for (const symbol of symbols) {
            if (symbol.name) {
                symbolNames.add(symbol.name);
                // Track definition line to exclude from reference count
                // Parse symbols have .line, introspection symbols have .position?.line
                const defLine = (symbol as any).line ?? symbol.position?.line;
                if (defLine !== undefined) {
                    definitionLines.set(symbol.name, defLine);
                }
            }
        }

        // PERF-004: Use tokens from analyze() when available (no additional IPC)
        // Tokens now include character positions (computed in Pike, faster than JS string search)
        if (tokens && tokens.length > 0) {
            const lines = text.split('\n');

            // Filter tokens for our symbols and build positions
            for (const token of tokens) {
                if (symbolNames.has(token.text)) {
                    const lineIdx = token.line - 1; // Convert to 0-indexed

                    // Skip if character position is not available (-1)
                    if (token.character < 0) {
                        continue;
                    }

                    // Skip tokens at the definition line (don't count definition as reference)
                    const defLine = definitionLines.get(token.text);
                    if (defLine !== undefined && token.line === defLine) {
                        continue; // This is the definition, not a reference
                    }

                    if (lineIdx >= 0 && lineIdx < lines.length) {
                        const line = lines[lineIdx];
                        if (!line) continue;

                        // Verify word boundary (still needed for accuracy)
                        const beforeChar = token.character > 0 ? line[token.character - 1]! : ' ';
                        const afterChar = token.character + token.text.length < line.length
                            ? line[token.character + token.text.length]!
                            : ' ';

                        if (!/\w/.test(beforeChar) && !/\w/.test(afterChar)) {
                            const pos: Position = {
                                line: lineIdx,
                                character: token.character,
                            };

                            if (!index.has(token.text)) {
                                index.set(token.text, []);
                            }
                            index.get(token.text)!.push(pos);
                        }
                    }
                }
            }

            if (index.size > 0) {
                return index;
            }
        }

        // PERF-001: Fallback to findOccurrences IPC call if tokens not available
        const bridge = services.bridge;
        if (bridge?.isRunning()) {
            try {
                const result = await bridge.findOccurrences(text);

                // Group occurrences by symbol name
                for (const occ of result.occurrences) {
                    if (symbolNames.has(occ.text)) {
                        // Skip definition line (don't count definition as reference)
                        const defLine = definitionLines.get(occ.text);
                        if (defLine !== undefined && occ.line === defLine) {
                            continue;
                        }

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
                log.error('Token-based symbol position finding failed', { error: err instanceof Error ? err.message : String(err) });
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
                            // Skip definition line (don't count definition as reference)
                            // Parse symbols have .line, introspection symbols have .position?.line
                            const defLine = (symbol as any).line ?? symbol.position?.line;
                            if (defLine !== undefined && (lineNum + 1) === defLine) {
                                searchStart = matchIndex + 1;
                                continue;
                            }

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
     * INC-002: Change detection result from classification
     */
    interface ChangeClassification {
        /** Whether parsing can be skipped entirely */
        canSkip: boolean;
        /** Reason for classification */
        reason: string;
        /** New content hash (computed if needed) */
        newHash?: string;
        /** New line hashes (computed if needed) */
        newLineHashes?: number[];
    }

    /**
     * INC-002: Classify document change to determine if re-parsing is needed.
     *
     * Uses multiple strategies to detect if the change affects semantic content:
     * 1. Comment/whitespace-only changes → skip entirely
     * 2. Line hash comparison → skip if semantic content unchanged
     * 3. Symbol position overlap → skip if no symbols affected
     *
     * @param document - Current document state
     * @param changeRange - LSP range of the change (undefined = full document)
     * @param cachedEntry - Previous cached parse result (undefined = must parse)
     * @returns Classification indicating if parsing can be skipped
     */
    function classifyChange(
        document: TextDocument,
        changeRange: Range | undefined,
        cachedEntry: import('../core/types.js').DocumentCacheEntry | undefined
    ): ChangeClassification {
        // No cache? Must parse
        if (!cachedEntry) {
            return { canSkip: false, reason: 'no_cache' };
        }

        const text = document.getText();
        const lines = text.split('\n');

        // Strategy 1: Check if change range is provided
        if (changeRange) {
            const startLine = changeRange.start.line;
            const endLine = changeRange.end.line;

            // Single-line change - check if it's just comment/whitespace
            if (startLine === endLine && startLine < lines.length) {
                const line = lines[startLine];
                if (line) {
                    const semanticContent = stripLineComments(line.trim());

                    if (!semanticContent) {
                        return { canSkip: true, reason: 'comment_only' };
                    }
                }
            }

            // Multi-line change - check if all affected lines are comments
            let allComments = true;
            for (let i = startLine; i <= endLine && i < lines.length; i++) {
                const line = lines[i];
                if (line) {
                    const semanticContent = stripLineComments(line.trim());
                    if (semanticContent) {
                        allComments = false;
                        break;
                    }
                }
            }
            if (allComments) {
                return { canSkip: true, reason: 'multiline_comment_only' };
            }

            // Strategy 2: Check if change overlaps with any symbol positions
            if (cachedEntry.lineHashes) {
                const newLineHashes = computeLineHashes(text);

                // Check if any line in the change range has different semantic content
                let hasSemanticChange = false;
                for (let i = startLine; i <= endLine && i < newLineHashes.length; i++) {
                    const cachedHash = cachedEntry.lineHashes[i];
                    const newHash = newLineHashes[i];

                    if (cachedHash !== newHash) {
                        hasSemanticChange = true;
                        break;
                    }
                }

                if (!hasSemanticChange) {
                    return {
                        canSkip: true,
                        reason: 'semantic_unchanged',
                        newHash: computeContentHash(text),
                        newLineHashes
                    };
                }

                return {
                    canSkip: false,
                    reason: 'semantic_changed',
                    newHash: computeContentHash(text),
                    newLineHashes
                };
            }
        }

        // No range info (full document replacement) - compare content hash
        const newHash = computeContentHash(text);
        if (cachedEntry.contentHash === newHash) {
            return { canSkip: true, reason: 'content_unchanged', newHash };
        }

        return { canSkip: false, reason: 'full_replacement', newHash };
    }

    /**
     * INC-002: Strip comments from a line of Pike code.
     * Handles both line comments (//) and block comment markers.
     */
    function stripLineComments(line: string): string {
        // Remove line comments
        const commentPos = line.indexOf('//');
        if (commentPos >= 0) {
            line = line.substring(0, commentPos);
        }
        return line.trim();
    }

    /**
     * INC-002: Track change ranges for incremental parsing.
     * Stores the range of the most recent change for each document URI.
     */
    const pendingChangeRanges = new Map<string, Range | undefined>();

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

        // Set new timer
        const timer = setTimeout(() => {
            validationTimers.delete(uri);
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
    async function validateDocument(document: TextDocument, classification?: ChangeClassification): Promise<void> {
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
                const legacySymbols: PikeSymbol[] = [];

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
                            kind: s.kind as any,
                            modifiers: s.modifiers,
                            type: s.type,
                        });
                    }
                }

                // Resolve include/import dependencies for IntelliSense
                let dependencies: import('../core/types.js').DocumentDependencies | undefined;
                if (services.includeResolver) {
                    dependencies = await services.includeResolver.resolveDependencies(uri, legacySymbols);
                }

                // P.2 FIX: Store hierarchical symbols (not flattened) so classSymbol.children works
                // Apply extractDeprecatedFromSymbols to preserve class hierarchy with deprecated flags
                const hierarchicalSymbols = parseData && parseData.symbols.length > 0
                    ? extractDeprecatedFromSymbols(parseData.symbols)
                    : legacySymbols;

                const cacheEntry: import('../core/types.js').DocumentCacheEntry = {
                    version,
                    symbols: hierarchicalSymbols,  // Use hierarchical symbols with children preserved
                    diagnostics,
                    symbolPositions: await buildSymbolPositionIndex(text, legacySymbols, tokenizeData),  // Use flat for indexing
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
                let dependencies: import('../core/types.js').DocumentDependencies | undefined;
                if (services.includeResolver) {
                    dependencies = await services.includeResolver.resolveDependencies(uri, symbolsWithDeprecated);
                }

                const cacheEntry: import('../core/types.js').DocumentCacheEntry = {
                    version,
                    symbols: symbolsWithDeprecated,  // Use symbols with deprecated extracted from source
                    diagnostics,
                    symbolPositions: await buildSymbolPositionIndex(text, symbolsWithDeprecated, tokenizeData),
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
            const firstChange = contentChanges[0]!;
            // If range is present, it's an incremental change
            // If range is absent, it's a full document replacement
            if ('range' in firstChange && firstChange.range) {
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
