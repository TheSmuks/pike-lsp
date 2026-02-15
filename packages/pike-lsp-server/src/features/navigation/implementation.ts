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
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

export function registerImplementationHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Navigation');

    connection.onImplementation(async (params): Promise<Location[]> => {
        log.debug('Implementation request', { uri: params.textDocument.uri, position: params.position });
        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return [];
            }

            const symbol = findSymbolAtPosition(cached.symbols, params.position, document);
            if (!symbol) {
                log.debug('Implementation: no symbol at position');
                return [];
            }

            if (symbol.kind !== 'class') {
                log.debug('Implementation: symbol is not a class/interface', { kind: symbol.kind });
                return [];
            }

            const className = symbol.name;
            const implementations: Location[] = [];

            const currentDocImplementations = findInheritancesInDocument(
                className,
                uri,
                cached.symbols
            );
            implementations.push(...currentDocImplementations);

            for (const otherUri of Array.from(documentCache.keys())) {
                if (otherUri === uri || !otherUri) continue;

                const otherCached = documentCache.get(otherUri);
                const otherDoc = documents.get(otherUri);
                if (!otherCached || !otherDoc) continue;

                const otherDocImplementations = findInheritancesInDocument(
                        className,
                        otherUri,
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

function findSymbolAtPosition(
    symbols: PikeSymbol[],
    position: { line: number; character: number },
    document: TextDocument
): PikeSymbol | null {
    const text = document.getText();
    const offset = document.offsetAt(position);

    let start = offset;
    let end = offset;
    while (start > 0 && text[start - 1] && /\w/.test(text[start - 1]!)) {
        start--;
    }
    while (end < text.length && text[end] && /\w/.test(text[end]!)) {
        end++;
    }

    const word = text.slice(start, end);
    if (!word) {
        return null;
    }

    for (const sym of symbols) {
        if (sym.name === word) {
            if (sym.position) {
                const symbolLine = (sym.position.line ?? 1) - 1;
                if (symbolLine === position.line) {
                    return sym;
                }
            }
        }
    }

    return null;
}

function findInheritancesInDocument(
    className: string,
    uri: string,
    symbols: PikeSymbol[]
): Location[] {
    const implementations: Location[] = [];

    for (const symbol of symbols) {
        if (symbol.kind === 'inherit') {
            const inheritClassName = (symbol as { classname?: string }).classname || symbol.name;
            const normalizedInherit = (inheritClassName || '').replace(/["']/g, '').trim();
            const normalizedTarget = className.replace(/["']/g, '').trim();

            if (normalizedInherit === normalizedTarget) {
                const classLocation = findClassContainingInherit(symbol, symbols, uri);
                if (classLocation) {
                    implementations.push(classLocation);
                }
            }
        }
    }

    return implementations;
}

function findClassContainingInherit(
    inheritSymbol: PikeSymbol,
    symbols: PikeSymbol[],
    uri: string
): Location | null {
    if (!inheritSymbol.position) return null;

    const inheritLine = (inheritSymbol.position.line ?? 1) - 1;
    let bestClass: PikeSymbol | null = null;

    for (const symbol of symbols) {
        if (symbol.kind === 'class' && symbol.position) {
            const classLine = (symbol.position.line ?? 1) - 1;

            if (classLine <= inheritLine) {
                if (!bestClass || classLine > ((bestClass.position?.line ?? 1) - 1)) {
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
