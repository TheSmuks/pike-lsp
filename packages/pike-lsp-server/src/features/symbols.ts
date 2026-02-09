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
import type { TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import { Logger } from '@pike-lsp/core';
import { LSP } from '../constants/index.js';
import { detectRoxenModule, enhanceRoxenSymbols } from './roxen/index.js';
import { detectRXMLStrings, mergeSymbolTrees } from './rxml/mixed-content.js';

/**
 * Convert Pike symbol kind to LSP SymbolKind.
 *
 * Exported for direct unit testing.
 */
export function convertSymbolKind(kind: string): SymbolKind {
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
 * Get detail string for symbol (type info).
 *
 * Exported for direct unit testing.
 */
export function getSymbolDetail(symbol: PikeSymbol): string | undefined {
    // Type info is in various fields depending on symbol kind
    const sym = symbol as unknown as Record<string, unknown>;
    let detail: string | undefined;

    if (sym['returnType']) {
        const returnType = sym['returnType'] as { name?: string };
        const argTypes = sym['argTypes'] as Array<{ name?: string }> | undefined;
        const args = argTypes?.map(t => t?.name ?? 'mixed').join(', ') ?? '';
        detail = `${returnType.name ?? 'mixed'}(${args})`;
    } else if (sym['type']) {
        const type = sym['type'] as { name?: string };
        detail = type.name;
    }

    // Add inheritance info
    if (sym['inherited']) {
        const from = sym['inheritedFrom'] as string | undefined;
        const inheritInfo = from ? `(from ${from})` : '(inherited)';
        detail = detail ? `${detail} ${inheritInfo}` : inheritInfo;
    }

    return detail;
}

/**
 * Register symbols handlers with the LSP connection.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager
 */
export function registerSymbolsHandlers(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache, workspaceIndex } = services;
    const log = new Logger('symbols');

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
     * Document symbols handler - provides outline view
     */
    connection.onDocumentSymbol(async (params): Promise<DocumentSymbol[] | null> => {
        const uri = params.textDocument.uri;

        log.debug('Document symbol request', { uri });

        try {
            let cached = documentCache.get(uri);

            if (!cached) {
                // Wait for any pending validation
                await documentCache.waitFor(uri);

                // Race condition check: wait a tick
                await new Promise(resolve => setTimeout(resolve, 50));

                cached = documentCache.get(uri);
            }

            if (!cached || !cached.symbols) {
                connection.console.log(`[SYMBOLS] No cached symbols for ${uri}`);
                return null;
            }

            // Filter out invalid symbols and convert
            const filtered = cached.symbols.filter((s): s is PikeSymbol => s != null && s.name != null);
            connection.console.log(`[SYMBOLS] Returning ${filtered.length} symbols (from ${cached.symbols.length} cached)`);

            // Log first few symbols for debugging
            for (let i = 0; i < Math.min(5, filtered.length); i++) {
                const sym = filtered[i]!;
                connection.console.log(`[SYMBOLS]   ${i}: name="${sym.name}", kind=${sym.kind}`);
            }

            // --- Roxen symbols integration ---
            let symbolsToConvert = filtered;
            try {
                const document = documents.get(uri);
                if (document && services.bridge?.bridge) {
                    const text = document.getText();
                    const roxenInfo = await detectRoxenModule(text, uri, services.bridge.bridge);
                    if (roxenInfo && roxenInfo.is_roxen_module === 1) {
                        const baseConverted = filtered.map(convertSymbol);
                        const enhanced = enhanceRoxenSymbols(baseConverted, roxenInfo);
                        connection.console.log(`[SYMBOLS] Enhanced ${filtered.length} symbols with Roxen data -> ${enhanced.length} total`);
                        return enhanced;
                    }

                    // --- Mixed RXML content integration ---
                    // Detect RXML strings in Pike multiline strings
                    const rxmlStrings = await detectRXMLStrings(text, uri, services.bridge.bridge);
                    if (rxmlStrings.length > 0) {
                        connection.console.log(`[SYMBOLS] Found ${rxmlStrings.length} RXML strings in Pike code`);
                        const baseConverted = filtered.map(convertSymbol);
                        const merged = mergeSymbolTrees(baseConverted, rxmlStrings);
                        connection.console.log(`[SYMBOLS] Merged ${filtered.length} Pike symbols + ${rxmlStrings.length} RXML strings -> ${merged.length} total`);
                        return merged;
                    }
                    // --- End mixed content integration ---
                }
            } catch (err) {
                connection.console.log(`[SYMBOLS] Roxen enhancement failed: ${err}`);
            }
            // --- End Roxen integration ---

            const converted = symbolsToConvert.map(convertSymbol);
            return converted;
        } catch (err) {
            log.error('Document symbol failed', {
                error: err instanceof Error ? err.message : String(err)
            });
            return null;
        }
    });

    /**
     * Workspace symbol handler - search symbols across workspace (Ctrl+T)
     *
     * PERF-006: Uses MAX_WORKSPACE_SYMBOLS to limit results.
     * NOTE: Current LSP version is 3.17 (vscode-languageserver 9.0.1).
     * WorkspaceSymbolParams.limit was added in LSP 3.18.
     * We implement server-side limiting to avoid overwhelming the client.
     * Upgrade tracking: https://github.com/TheSmuks/pike-lsp/issues/XXX
     */
    connection.onWorkspaceSymbol((params: WorkspaceSymbolParams): SymbolInformation[] => {
        const query = params.query;
        const limit = LSP.MAX_WORKSPACE_SYMBOLS;

        log.debug('Workspace symbol request', { query, limit });

        try {
            const allSymbols: SymbolInformation[] = [];
            const queryLower = query?.toLowerCase() ?? '';

            // Search the workspace index first
            const indexedResults = workspaceIndex.searchSymbols(query, limit);
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

                        if (allSymbols.length >= limit) {
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
