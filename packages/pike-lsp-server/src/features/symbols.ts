/**
 * Symbols Feature Handlers
 *
 * Provides document symbols (outline view) and workspace symbols (search).
 * Extracted from server.ts for modular feature organization.
 */

import type { Connection } from 'vscode-languageserver/node.js';
import {
    DocumentSymbol,
    SymbolKind,
    SymbolInformation,
    WorkspaceSymbolParams,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import { Logger } from '@pike-lsp/core';
import { LSP } from '../constants/index.js';

/**
 * Register symbols handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 */
export function registerSymbolsHandlers(
    connection: Connection,
    services: Services
): void {
    const { documentCache, workspaceIndex } = services;
    const log = new Logger('symbols');

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

    /**
     * Document symbols handler - provides outline view
     */
    connection.onDocumentSymbol((params): DocumentSymbol[] | null => {
        const uri = params.textDocument.uri;

        log.debug('Document symbol request', { uri });

        try {
            const cached = documentCache.get(uri);

            if (!cached || !cached.symbols) {
                return null;
            }

            // Filter out invalid symbols and convert
            return cached.symbols
                .filter(s => s && s.name)
                .map(convertSymbol);
        } catch (err) {
            log.error('Document symbol failed', {
                error: err instanceof Error ? err.message : String(err)
            });
            return null;
        }
    });

    /**
     * Workspace symbol handler - search symbols across workspace (Ctrl+T)
     */
    connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
        const query = params.query;

        log.debug('Workspace symbol request', { query });

        try {
            const allSymbols: SymbolInformation[] = [];
            const queryLower = query?.toLowerCase() ?? '';

            // Search the workspace index first
            const indexedResults = workspaceIndex.searchSymbols(query, LSP.MAX_WORKSPACE_SYMBOLS);
            allSymbols.push(...indexedResults);

            // Also search open documents (documentCache) to include files that
            // may not be in the workspace index yet
            for (const [uri, cached] of Array.from(documentCache.entries())) {
                // Skip URIs already in results to avoid duplicates
                const alreadyIncluded = allSymbols.some(s => s.location.uri === uri);

                for (const symbol of cached.symbols) {
                    // Skip symbols with null names
                    if (!symbol.name) continue;

                    // Skip if we already have symbols from this URI via workspace index
                    if (alreadyIncluded) continue;

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
                            log.debug('Workspace symbol search hit limit', { count: allSymbols.length });
                            return allSymbols;
                        }
                    }
                }
            }

            log.debug('Workspace symbol search complete', {
                query,
                indexedCount: indexedResults.length,
                totalCount: allSymbols.length
            });
            return allSymbols;
        } catch (err) {
            log.error('Workspace symbol failed', {
                error: err instanceof Error ? err.message : String(err)
            });
            return [];
        }
    });
}
