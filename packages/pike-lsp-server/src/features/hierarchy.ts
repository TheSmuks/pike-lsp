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
import { PatternHelpers } from '../utils/regex-patterns.js';
import { Logger } from '../core/logging.js';

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
    const { documentCache, workspaceIndex } = services;
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
     */
    connection.languages.callHierarchy.onIncomingCalls((params) => {
        log.debug('Call hierarchy incoming calls', { item: params.item.name });
        try {
            const results: CallHierarchyIncomingCall[] = [];
            const targetName = params.item.name;

            // Helper function to search for calls in a document
            const searchDocument = (docUri: string, text: string, symbols: PikeSymbol[]) => {
                const lines = text.split('\n');

                // Find all methods in this document
                for (const symbol of symbols) {
                    if (symbol.kind !== 'method' || !symbol.position) continue;

                    const methodStartLine = (symbol.position.line ?? 1) - 1;

                    // Search for calls to targetName in this method's body
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
                    const fs = await import('fs');
                    const fileContent = fs.readFileSync(filePath, 'utf-8');
                    const wsSymbols = workspaceIndex.getDocumentSymbols(wsUri);
                    searchDocument(wsUri, fileContent, wsSymbols);
                } catch {
                    // Skip files we can't read
                }
            }

            return results;
        } catch (err) {
            log.error('Call hierarchy incoming calls failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Outgoing calls - what does this function call?
     */
    connection.languages.callHierarchy.onOutgoingCalls((params) => {
        log.debug('Call hierarchy outgoing calls', { item: params.item.name });
        try {
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
        } catch (err) {
            log.error('Type hierarchy subtypes failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });
}
