/**
 * Implementation Handler
 *
 * Provides implementation navigation for Pike classes/interfaces.
 * When invoked on a class/interface, finds all classes that inherit from it.
 *
 * Per LSP spec:
 * - textDocument/implementation should find all implementations of an interface
 * - For Pike, this means finding all classes with "inherit TargetClass"
 * - Returns empty array for non-class symbols
 * - Returns empty array when on an implementation (shows usages instead)
 */

import {
    Connection,
    Location,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';
import type { DocumentCache } from '../../services/document-cache.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Register implementation handler.
 */
export function registerImplementationHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Navigation');

    /**
     * Implementation handler - find all implementations of a class/interface
     *
     * Per LSP 3.17 spec:
     * - The `textDocument/implementation` request is sent from the client to the server
     *   to resolve the implementation locations of a symbol at a given text document position.
     * - The request's parameter is of type ImplementationParams
     * - The response is of type ImplementationItem or Location[]
     * - Returns empty array if symbol is not a class/interface or has no implementations
     *
     * For Pike:
     * - Classes use "inherit" for both inheritance and interface implementation
     * - We find all classes with "inherit TargetClass" where TargetClass is the symbol
     * - Return locations of those inheriting classes
     */
    connection.onImplementation(async (params): Promise<Location[]> => {
        log.debug('Implementation request', { uri: params.textDocument.uri, position: params.position });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri) as DocumentCache | undefined;
            const document = documents.get(uri);

            if (!cached || !document) {
                return [];
            }

            // Find the symbol at the current position
            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol) {
                log.debug('Implementation: no symbol at position');
                return [];
            }

            // Implementation only applies to classes and interfaces (symbols with kind = 'class')
            // For Pike, interfaces are also represented as classes
            if (symbol.kind !== 'class') {
                log.debug('Implementation: symbol is not a class/interface', { kind: symbol.kind });
                return [];
            }

            const className = symbol.name;
            const implementations: Location[] = [];

            // Search in the current document for classes inheriting from this class/interface
            const currentDocImplementations = findInheritancesInDocument(
                className,
                uri,
                document,
                cached.symbols
            );
            implementations.push(...currentDocImplementations);

            // Search in other open documents
            for (const [otherUri] of Array.from(documentCache.keys())) {
                if (otherUri === uri) continue;

                const otherCached = documentCache.get(otherUri) as DocumentCache | undefined;
                const otherDoc = documents.get(otherUri);
                if (!otherCached || !otherDoc) continue;

                const otherDocImplementations = findInheritancesInDocument(
                        className,
                        otherUri,
                        otherDoc,
                        otherCached.symbols
                    );
                implementations.push(...otherDocImplementations);
            }

            log.debug('Implementation: found', {
                className,
                count: implementations.length,
                implementations: implementations.map(loc => ({ uri: loc.uri, range: loc.range }))
            });

            return implementations;
        } catch (err) {
            log.error('Implementation failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });
}

/**
 * Find symbol at given position in document.
 */
function findSymbolAtPosition(
    symbols: any[],
    position: { line: number; character: number },
    document: TextDocument
): any | null {
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

    // Find symbol with matching name at this position
    for (const symbol of symbols) {
        if (symbol.name === word) {
            // Check if position is within symbol's range
            if (symbol.position) {
                const symbolLine = (symbol.position.line ?? 1) - 1; // Convert to 0-based
                if (symbolLine === position.line) {
                    return symbol;
                }
            }
        }
    }

    // Also check against classname for inherits, imports, and includes (stripping quotes)
    if (symbol.kind === 'inherit' || symbol.kind === 'import' || symbol.kind === 'include') {
        const classname = symbol.classname?.replace(/["']/g, '');
        // Check if classname matches word or part of it (e.g., Stdio in Stdio.File)
        if (classname === word || (classname && classname.includes(word))) {
            return symbol;
        }
    }

    return null;
}

/**
 * Find all classes in a document that inherit from a given class/interface.
 */
function findInheritancesInDocument(
    className: string,
    uri: string,
    document: TextDocument,
    symbols: any[]
): Location[] {
    const implementations: Location[] = [];

    // First, try to use cached inherit information if available
    // The document cache may have an 'inherits' array from Pike's get_inherited
    if (symbols.some((s: any) => s.kind === 'inherit')) {
        // Find all inherit symbols that reference this class
        for (const symbol of symbols) {
            if (symbol.kind === 'inherit') {
                const inheritClassName = symbol.classname || symbol.name;
                // Normalize both for comparison (remove quotes, trim whitespace)
                const normalizedInherit = (inheritClassName || '').replace(/["']/g, '').trim();
                const normalizedTarget = className.replace(/["']/g, '').trim();

                if (normalizedInherit === normalizedTarget) {
                    // This inherit statement references our target class
                    // The implementation is the class that contains this inherit statement
                    // We need to find the class definition that contains this inherit

                    const classLocation = findClassContainingInherit(symbol, symbols, document, uri);
                    if (classLocation) {
                        implementations.push(classLocation);
                    }
                }
            }
        }
}
    }

        return implementations;
    }
}    }

    // Fallback: text-based search for inherit statements
    const text = document.getText();
    const lines = text.split('\n');

    // Pattern: "inherit className;" with flexible whitespace
    // Also handle: inherit "module.className";
    const inheritPattern = new RegExp(
        'inherit\\s+["\']?' + escapeRegExp(className) + '["\']?',
        'gi'
    );

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        if (!line) continue;

        const match = inheritPattern.exec(line);
        if (match) {
            // Found an inherit statement - now find the class that contains it
            // We need to search backward from this line to find the class definition
            const classLocation = findClassDeclarationBeforeLine(lineNum, document, uri);
            if (classLocation) {
                implementations.push(classLocation);
            }
        }
    }

    return implementations;
}

/**
 * Find the class declaration that contains a given inherit symbol.
 */
function findClassContainingInherit(
    inheritSymbol: any,
    symbols: any[],
    document: TextDocument,
    uri: string
): Location | null {
    if (!inheritSymbol.position) return null;

    const inheritLine = (inheritSymbol.position.line ?? 1) - 1; // Convert to 0-based

    // Search backward from inherit line to find class declaration
    // Class declarations have kind = 'class'
    let bestClass: any | null = null;

    for (const symbol of symbols) {
        if (symbol.kind === 'class' && symbol.position) {
            const classLine = (symbol.position.line ?? 1) - 1;

            // Class must come before the inherit statement
            if (classLine < inheritLine) {
                // This class is before the inherit, check if it's the best match
                // (closest class before the inherit statement)
                if (!bestClass || classLine > bestClass.position.line) {
                    bestClass = symbol;
                }
            }
        }
    }

    if (bestClass && bestClass.position) {
        return {
            uri,
            range: {
                start: { line: (bestClass.position.line ?? 1) - 1, character: 0 },
                end: { line: (bestClass.position.line ?? 1) - 1, character: (bestClass.name || '').length },
            },
        };
    }

    return null;
}

/**
 * Find a class declaration before a given line number.
 */
function findClassDeclarationBeforeLine(
    lineNum: number,
    document: TextDocument,
    uri: string
): Location | null {
    const text = document.getText();
    const lines = text.split('\n');

    // Search backward from lineNum to find "class" declaration
    for (let i = lineNum; i >= 0; i--) {
        const line = lines[i];
        if (!line) continue;

        // Pattern: "class ClassName" with flexible whitespace
        const classMatch = line.match(/^\s*class\s+(\w+)/);
        if (classMatch) {
            return {
                uri,
                range: {
                    start: { line: i, character: 0 },
                    end: { line: i, character: classMatch[0].length },
                },
            };
        }
    }

    return null;
}

/**
 * Escape special characters in a string for RegExp.
 */
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
