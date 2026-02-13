/**
 * Hierarchy Feature Handlers
 *
 * Groups "what is related to this" handlers:
 * - Call Hierarchy: who calls this / what does this call
 * - Type Hierarchy: supertypes / subtypes
 *
 * Each handler includes try/catch with logging fallback (SRV-12).
 */

import {
    Connection,
    SymbolKind,
    Range,
    CallHierarchyIncomingCall,
    CallHierarchyOutgoingCall,
    TypeHierarchyItem,
    DiagnosticSeverity,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import type { Services } from '../services/index.js';
import type { PikeSymbol, PikeSymbolKind } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

/**
 * Validation set for PikeSymbolKind values
 * Using type assertions ensures TypeScript validates against the union type
 */
const VALID_KINDS: Set<PikeSymbolKind> = new Set<PikeSymbolKind>([
    'class' as PikeSymbolKind,
    'method' as PikeSymbolKind,
    'variable' as PikeSymbolKind,
    'constant' as PikeSymbolKind,
    'typedef' as PikeSymbolKind,
    'enum' as PikeSymbolKind,
    'enum_constant' as PikeSymbolKind,
    'inherit' as PikeSymbolKind,
    'import' as PikeSymbolKind,
    'include' as PikeSymbolKind,
    'module' as PikeSymbolKind
]);

/**
 * Validate symbol kind and log warnings for unknown values
 */
function validateSymbolKind(symbol: PikeSymbol, context: string): void {
    if (!VALID_KINDS.has(symbol.kind)) {
        const log = new Logger('Hierarchy');
        log.warn(`Unknown symbol kind: ${symbol.kind}`, {
            symbol: symbol.name,
            kind: symbol.kind,
            context
        });
    }
}

/**
 * Format inheritance detail for TypeHierarchyItem
 * Shows "class ClassName (extends Parent1, Parent2)"
 */
function formatInheritanceDetail(symbol: PikeSymbol, cached: { symbols: PikeSymbol[] }): string {
    if (!symbol.position) {
        return `class ${symbol.name}`;
    }

    // Find inherit symbols on the same line as the class declaration
    const inheritSymbols = cached.symbols.filter(s =>
        s.position &&
        s.position.line === symbol.position!.line &&
        s.kind === 'inherit'
    );

    if (inheritSymbols.length === 0) {
        return `class ${symbol.name}`;
    }

    const parents = inheritSymbols
        .map(s => s.classname ?? s.name)
        .filter((name): name is string => Boolean(name));

    if (parents.length === 0) {
        return `class ${symbol.name}`;
    }

    return `class ${symbol.name} (extends ${parents.join(', ')})`;
}

/**
 * Register all hierarchy handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Bundle of server services
 * @param documents - TextDocuments manager for LSP document synchronization
 */
export function registerHierarchyHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Hierarchy');

    /**
     * Prepare call hierarchy - get call hierarchy item at position
     */
    connection.languages.callHierarchy.onPrepare((params) => {
        log.debug('Call hierarchy prepare', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                connection.sendDiagnostics({
                    uri: params.textDocument.uri,
                    diagnostics: [{
                        range: { start: params.position, end: params.position },
                        severity: DiagnosticSeverity.Warning,
                        message: 'Call hierarchy unavailable: document not analyzed. Open the file to enable call hierarchy.',
                        source: 'pike-lsp'
                    }]
                });
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
            if (methodSymbol.position.line === undefined || methodSymbol.position.column === undefined) {
                log.warn(`Symbol ${methodSymbol.name} has incomplete position information`);
                return null;
            }

            const line = methodSymbol.position.line - 1;

            // Clear any previous diagnostics for this file (analysis succeeded)
            connection.sendDiagnostics({
                uri,
                diagnostics: []
            });

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
        } catch (err) {
            log.error('Call hierarchy prepare failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Incoming calls - who calls this function?
     * Uses symbolPositions from documentCache (built via Pike tokenization) for accuracy.
     */
    connection.languages.callHierarchy.onIncomingCalls((params) => {
        log.debug('Call hierarchy incoming calls', { item: params.item.name });
        try {
            const results: CallHierarchyIncomingCall[] = [];
            const targetName = params.item.name;
            const targetUri = params.item.uri;

            // Check if document has symbolPositions (fully analyzed)
            const cached = documentCache.get(targetUri);
            if (!cached?.symbolPositions) {
                connection.sendDiagnostics({
                    uri: targetUri,
                    diagnostics: [{
                        range: params.item.range,
                        severity: DiagnosticSeverity.Warning,
                        message: 'Call hierarchy incomplete: document not fully analyzed.',
                        source: 'pike-lsp'
                    }]
                });
                return results;  // Empty array = no callers found
            }

            // Track already-added callers to prevent duplicates
            const addedCallers = new Set<string>();

            // Helper function to search for calls in a cached document
            const searchCachedDocument = (
                docUri: string,
                cached: { symbols: PikeSymbol[]; symbolPositions?: Map<string, { line: number; character: number }[]> },
                text: string
            ) => {
                const lines = text.split('\n');
                const symbols = cached.symbols;

                // Get positions of target name from Pike tokenization (accurate, excludes comments)
                const targetPositions = cached.symbolPositions?.get(targetName) ?? [];

                // Filter to only positions that look like function calls (followed by '(')
                const callPositions: { line: number; character: number }[] = [];
                for (const pos of targetPositions) {
                    const line = lines[pos.line];
                    if (!line) continue;

                    // Check if this is a function call: targetName followed by '('
                    const afterName = line.substring(pos.character + targetName.length);
                    if (/^\s*\(/.test(afterName)) {
                        callPositions.push(pos);
                    }
                }

                // For each method, find which calls are within its body
                for (const symbol of symbols) {
                    if (symbol.kind !== 'method' || !symbol.position) continue;

                    // Don't include self-references from the same method
                    if (docUri === targetUri && symbol.name === targetName) continue;

                    const methodStartLine = (symbol.position.line ?? 1) - 1;

                    // Find method end by looking for the next method
                    const nextMethodLine = symbols
                        .filter(s => s.kind === 'method' && s.position && (s.position.line ?? 0) > (symbol.position?.line ?? 0))
                        .map(s => (s.position?.line ?? 0) - 1)
                        .sort((a, b) => a - b)[0] ?? lines.length;

                    // Find call positions within this method's body
                    const ranges: Range[] = [];
                    for (const pos of callPositions) {
                        if (pos.line >= methodStartLine && pos.line < nextMethodLine) {
                            ranges.push({
                                start: { line: pos.line, character: pos.character },
                                end: { line: pos.line, character: pos.character + targetName.length },
                            });
                        }
                    }

                    if (ranges.length > 0) {
                        // Prevent duplicate entries for the same caller
                        const callerId = `${docUri}:${symbol.name}:${methodStartLine}`;
                        if (addedCallers.has(callerId)) continue;
                        addedCallers.add(callerId);

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

            // Search all open/cached documents (these have accurate symbolPositions)
            const entries = Array.from(documentCache.entries());
            for (const [docUri, cached] of entries) {
                const doc = documents.get(docUri);
                if (!doc) continue;
                searchCachedDocument(docUri, cached, doc.getText());
            }

            // Note: For workspace files not in cache, we skip them as they don't have
            // Pike-tokenized symbolPositions. Users should open files to get accurate results.

            // Clear any previous diagnostics for this file (analysis succeeded)
            connection.sendDiagnostics({
                uri: targetUri,
                diagnostics: []
            });

            return results;
        } catch (err) {
            log.error('Call hierarchy incoming calls failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Outgoing calls - what does this function call?
     * Uses symbolPositions from documentCache (built via Pike tokenization) for accuracy.
     */
    connection.languages.callHierarchy.onOutgoingCalls((params) => {
        log.debug('Call hierarchy outgoing calls', { item: params.item.name });
        try {
            const results: CallHierarchyOutgoingCall[] = [];
            const sourceUri = params.item.uri;
            const sourceLine = params.item.range.start.line;
            const sourceMethodName = params.item.name;

            const cached = documentCache.get(sourceUri);
            const doc = documents.get(sourceUri);
            if (!cached || !doc) {
                connection.sendDiagnostics({
                    uri: sourceUri,
                    diagnostics: [{
                        range: params.item.range,
                        severity: DiagnosticSeverity.Warning,
                        message: 'Call hierarchy unavailable: document not analyzed.',
                        source: 'pike-lsp'
                    }]
                });
                return results;
            }

            if (!cached.symbolPositions) {
                connection.sendDiagnostics({
                    uri: sourceUri,
                    diagnostics: [{
                        range: params.item.range,
                        severity: DiagnosticSeverity.Warning,
                        message: 'Call hierarchy incomplete: document not fully analyzed. Some calls may be missing.',
                        source: 'pike-lsp'
                    }]
                });
                return results;
            }

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

            // Pike keywords and control flow that look like function calls
            const keywords = new Set([
                'if', 'else', 'while', 'for', 'foreach', 'switch', 'case',
                'return', 'break', 'continue', 'catch', 'throw', 'sizeof',
                'typeof', 'arrayp', 'mappingp', 'stringp', 'intp', 'floatp',
                'objectp', 'functionp', 'programp', 'callablep', 'multisetp'
            ]);

            // Find all function calls using Pike-tokenized symbolPositions
            const calledFunctions = new Map<string, Range[]>();

            // Iterate through all identifiers in symbolPositions
            if (cached.symbolPositions) {
                for (const [identName, positions] of cached.symbolPositions.entries()) {
                    // Skip keywords and self-recursion
                    if (keywords.has(identName)) continue;
                    if (identName === sourceMethodName) continue;

                    // Find positions within this method that are function calls
                    const ranges: Range[] = [];
                    for (const pos of positions) {
                        // Check if within method body
                        if (pos.line < methodStartLine || pos.line >= nextMethodLine) continue;

                        // Check if this is a function call (followed by '(')
                        const line = lines[pos.line];
                        if (!line) continue;

                        const afterName = line.substring(pos.character + identName.length);
                        if (/^\s*\(/.test(afterName)) {
                            ranges.push({
                                start: { line: pos.line, character: pos.character },
                                end: { line: pos.line, character: pos.character + identName.length },
                            });
                        }
                    }

                    if (ranges.length > 0) {
                        calledFunctions.set(identName, ranges);
                    }
                }
            }

            // Build results for each called function
            for (const [funcName, ranges] of calledFunctions) {
                // Phase 2.1: Search all cached documents for function definition
                let targetUri = sourceUri;
                let targetLine: number | null = null;

                // First, try the current document
                const targetSymbol = cached.symbols.find(s => s.name === funcName && s.kind === 'method');
                if (targetSymbol?.position) {
                    // Validate position has required fields before using
                    if (targetSymbol.position.line === undefined || targetSymbol.position.column === undefined) {
                        log.debug(`Skipping ${funcName} (incomplete position in current document)`);
                        continue; // Skip this function entirely
                    }
                    targetLine = targetSymbol.position.line - 1;
                } else {
                    // Not found in current document - search all cached documents
                    for (const [docUri, cachedDoc] of documentCache.entries()) {
                        const symbol = cachedDoc.symbols?.find(s => s.name === funcName && s.kind === 'method');
                        if (symbol?.position) {
                            // Validate position has required fields before using
                            if (symbol.position.line === undefined || symbol.position.column === undefined) {
                                log.debug(`Skipping ${funcName} (incomplete position in ${docUri})`);
                                continue; // Skip to next document
                            }
                            targetUri = docUri;
                            targetLine = symbol.position.line - 1;
                            break; // Found it
                        }
                    }
                }

                // Skip if targetLine is still null (not found in any document)
                if (targetLine === null) {
                    log.debug(`Skipping unresolved function call: ${funcName} (not in any cached document)`);
                    continue;  // Skip this function entirely - don't create invalid item
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

            // Clear any previous diagnostics for this file (analysis succeeded)
            connection.sendDiagnostics({
                uri: sourceUri,
                diagnostics: []
            });

            return results;
        } catch (err) {
            log.error('Call hierarchy outgoing calls failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Prepare type hierarchy - get type hierarchy item at position
     *
     * Phase 3: Distinguish null from empty results
     * - Returns null: "no type hierarchy item at this position" (cursor not on class, document not analyzed)
     * - Returns TypeHierarchyItem[]: valid class with inheritance detail
     */
    connection.languages.typeHierarchy.onPrepare((params) => {
        log.debug('Type hierarchy prepare', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            // Return null: document not analyzed (valid LSP response)
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

            // Return null: cursor not on a class (valid LSP response)
            if (!word) return null;

            // Find class symbol
            const classSymbol = cached.symbols.find(s =>
                s.name === word && s.kind === 'class' && s.position
            );

            // Return null: symbol not found or not a class (valid LSP response)
            if (!classSymbol || !classSymbol.position) {
                return null;
            }

            const line = Math.max(0, (classSymbol.position.line ?? 1) - 1);

            // Validate kind
            validateSymbolKind(classSymbol, 'type hierarchy prepare');

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
                // Phase 3: Populate detail field with inheritance summary
                detail: formatInheritanceDetail(classSymbol, cached)
            }];
        } catch (err) {
            log.error('Type hierarchy prepare failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Supertypes - what does this class inherit from?
     *
     * Phase 2: Circular inheritance detection (single-file only)
     * - Tracks visited nodes to detect cycles
     * - Cross-file cycle detection NOT implemented in Phase 2
     *
     * Phase 5: Diagnostic filtering
     * - Only clears type-hierarchy diagnostics (d.code !== 'type-hierarchy')
     * - All type hierarchy diagnostics include code: 'type-hierarchy'
     */
    connection.languages.typeHierarchy.onSupertypes((params) => {
        log.debug('Type hierarchy supertypes', { item: params.item.name });
        try {
            const results: TypeHierarchyItem[] = [];
            const classUri = params.item.uri;
            const className = params.item.name;

            const cached = documentCache.get(classUri);
            if (!cached) {
                // Document not analyzed - publish warning diagnostic with code
                connection.sendDiagnostics({
                    uri: classUri,
                    diagnostics: [{
                        range: params.item.range,
                        severity: DiagnosticSeverity.Warning,
                        message: 'Type hierarchy unavailable: document not analyzed. Open the file to enable type hierarchy.',
                        source: 'pike-lsp',
                        code: 'type-hierarchy'
                    }]
                });
                return results;  // Empty array = no hierarchy found
            }

            // Phase 2: Track visited nodes for circular inheritance detection
            const visited = new Set<string>();
            const cyclePath: string[] = [];
            const queue = [{ uri: classUri, name: className }];

            while (queue.length > 0) {
                const current = queue.shift()!;
                const visitKey = `${current.uri}:${current.name}`;

                // Circular inheritance detected
                if (visited.has(visitKey)) {
                    cyclePath.push(current.name);
                    connection.sendDiagnostics({
                        uri: classUri,
                        diagnostics: [
                            // Keep existing non-type-hierarchy diagnostics
                            ...cached.diagnostics.filter(d =>
                                d.source !== 'pike-lsp' || d.code !== 'type-hierarchy'
                            ),
                            // Add circular inheritance error
                            {
                                range: params.item.range,
                                severity: DiagnosticSeverity.Error,
                                code: 'type-hierarchy',
                                message: `Circular inheritance detected: ${cyclePath.join(' → ')}`,
                                source: 'pike-lsp'
                            }
                        ]
                    });
                    break; // Stop traversal after detecting cycle
                }

                visited.add(visitKey);
                cyclePath.push(current.name);

                const currentCached = documentCache.get(current.uri);
                if (!currentCached) {
                    // Parent class file not in cache - skip for now
                    // Cross-file cycle detection: NOT IMPLEMENTED in Phase 2
                    // TODO: Phase 6 will add workspace file search for cross-file inheritance
                    log.debug(`Parent class not in cache: ${current.name}`, {
                        uri: current.uri,
                        note: 'Cross-file inheritance not supported in Phase 2'
                    });
                    continue;
                }

                // Find inherit symbols
                for (const symbol of currentCached.symbols) {
                    if (symbol.kind !== 'inherit') {
                        validateSymbolKind(symbol, 'supertypes traversal');
                        continue;
                    }

                    const inheritedName = symbol.classname ?? symbol.name;
                    if (!inheritedName) continue;

                    // Find parent class definition in current document
                    const parentSymbol = currentCached.symbols.find(s =>
                        s.name === inheritedName && s.kind === 'class'
                    );

                    if (parentSymbol?.position) {
                        const parentLine = Math.max(0, (parentSymbol.position.line ?? 1) - 1);
                        results.push({
                            name: inheritedName,
                            kind: SymbolKind.Class,
                            uri: current.uri,
                            range: {
                                start: { line: parentLine, character: 0 },
                                end: { line: parentLine, character: inheritedName.length }
                            },
                            selectionRange: {
                                start: { line: parentLine, character: 0 },
                                end: { line: parentLine, character: inheritedName.length }
                            }
                        });

                        // Add to queue for multi-level traversal (same document only)
                        // Cross-file inheritance: NOT IMPLEMENTED in Phase 2
                        queue.push({ uri: current.uri, name: inheritedName });
                    } else {
                        // Parent not found in current document
                        log.debug(`Parent class not found in document: ${inheritedName}`, {
                            document: current.uri,
                            note: 'Cross-file inheritance not supported in Phase 2'
                        });
                    }
                }
            }

            // Phase 5: Clear only type-hierarchy diagnostics, preserve others
            const nonTypeHierarchyDiagnostics = cached.diagnostics.filter(d =>
                d.source !== 'pike-lsp' || d.code !== 'type-hierarchy'
            );
            connection.sendDiagnostics({
                uri: classUri,
                diagnostics: nonTypeHierarchyDiagnostics
            });

            return results;  // Empty array = no parents found (valid)
        } catch (err) {
            log.error('Type hierarchy supertypes failed', { error: err instanceof Error ? err.message : String(err) });
            // Publish error diagnostic with code
            connection.sendDiagnostics({
                uri: params.item.uri,
                diagnostics: [{
                    range: params.item.range,
                    severity: DiagnosticSeverity.Error,
                    message: `Type hierarchy analysis failed: ${err instanceof Error ? err.message : String(err)}`,
                    source: 'pike-lsp',
                    code: 'type-hierarchy'
                }]
            });
            return [];  // Empty array signals error occurred
        }
    });

    /**
     * Subtypes - what classes inherit from this?
     *
     * Phase 5: Diagnostic filtering
     * - Only clears type-hierarchy diagnostics (d.code !== 'type-hierarchy')
     * - All type hierarchy diagnostics include code: 'type-hierarchy'
     */
    connection.languages.typeHierarchy.onSubtypes((params) => {
        log.debug('Type hierarchy subtypes', { item: params.item.name });
        try {
            const results: TypeHierarchyItem[] = [];
            const className = params.item.name;
            const classUri = params.item.uri;

            // Check if the source document is analyzed
            const cached = documentCache.get(classUri);
            if (!cached) {
                // Document not analyzed - publish warning diagnostic with code
                connection.sendDiagnostics({
                    uri: classUri,
                    diagnostics: [{
                        range: params.item.range,
                        severity: DiagnosticSeverity.Warning,
                        message: 'Type hierarchy unavailable: document not analyzed. Open the file to enable type hierarchy.',
                        source: 'pike-lsp',
                        code: 'type-hierarchy'
                    }]
                });
                return results;  // Empty array = no hierarchy found
            }

            // Search all documents for classes that inherit from this class
            const entries = Array.from(documentCache.entries());
            for (const [docUri, cached] of entries) {
                for (const symbol of cached.symbols) {
                    if (symbol.kind !== 'inherit') {
                        validateSymbolKind(symbol, 'subtypes traversal');
                        continue;
                    }

                    const inheritedName = symbol.classname ?? symbol.name;
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

            // Phase 5: Clear only type-hierarchy diagnostics, preserve others
            const nonTypeHierarchyDiagnostics = cached.diagnostics.filter(d =>
                d.source !== 'pike-lsp' || d.code !== 'type-hierarchy'
            );
            connection.sendDiagnostics({
                uri: classUri,
                diagnostics: nonTypeHierarchyDiagnostics
            });

            return results;  // Empty array = no children found (valid)
        } catch (err) {
            log.error('Type hierarchy subtypes failed', { error: err instanceof Error ? err.message : String(err) });
            // Publish error diagnostic with code
            connection.sendDiagnostics({
                uri: params.item.uri,
                diagnostics: [{
                    range: params.item.range,
                    severity: DiagnosticSeverity.Error,
                    message: `Type hierarchy analysis failed: ${err instanceof Error ? err.message : String(err)}`,
                    source: 'pike-lsp',
                    code: 'type-hierarchy'
                }]
            });
            return [];  // Empty array signals error occurred
        }
    });
}

