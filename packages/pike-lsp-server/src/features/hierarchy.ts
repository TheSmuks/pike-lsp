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
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';

import type { Services } from '../services/index.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

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
        } catch (err) {
            log.error('Call hierarchy outgoing calls failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Prepare type hierarchy - get type hierarchy item at position
     */
    connection.languages.typeHierarchy.onPrepare((params) => {
        log.debug('Type hierarchy prepare', { uri: params.textDocument.uri });
        try {
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
        } catch (err) {
            log.error('Type hierarchy prepare failed', { error: err instanceof Error ? err.message : String(err) });
            return null;
        }
    });

    /**
     * Supertypes - what does this class inherit from?
     */
    connection.languages.typeHierarchy.onSupertypes((params) => {
        log.debug('Type hierarchy supertypes', { item: params.item.name });
        try {
            const results: TypeHierarchyItem[] = [];
            const classUri = params.item.uri;

            const cached = documentCache.get(classUri);
            if (!cached) return results;

            // Find inherit symbols that belong to this class
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
        } catch (err) {
            log.error('Type hierarchy supertypes failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Subtypes - what classes inherit from this?
     */
    connection.languages.typeHierarchy.onSubtypes((params) => {
        log.debug('Type hierarchy subtypes', { item: params.item.name });
        try {
            const results: TypeHierarchyItem[] = [];
            const className = params.item.name;

            // Search all documents for classes that inherit from this class
            const entries = Array.from(documentCache.entries());
            for (const [docUri, cached] of entries) {
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
        } catch (err) {
            log.error('Type hierarchy subtypes failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });
}

