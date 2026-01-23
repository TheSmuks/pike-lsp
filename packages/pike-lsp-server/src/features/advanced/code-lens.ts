/**
 * Code Lens Handler
 *
 * Provides reference counts and quick actions in code.
 */

import {
    Connection,
    CodeLens,
    Position,
} from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import { buildCodeLensCommand } from '../../utils/code-lens.js';
import { Logger } from '@pike-lsp/core';

/**
 * Register code lens handlers.
 */
export function registerCodeLensHandlers(
    connection: Connection,
    services: Services,
    _documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

    // Code lens cache: URI -> { version, lenses }
    // Prevents regenerating lenses when switching tabs if document hasn't changed
    const codeLensCache = new Map<string, { version: number; lenses: CodeLens[] }>();

    // Resolved code lens cache: URI -> { version, commands: Map<symbolName, refCount> }
    // Prevents re-resolving lenses on window focus changes
    const resolvedLensCache = new Map<string, { version: number; refCounts: Map<string, number> }>();

    /**
     * Code Lens handler - provide inline annotations
     */
    connection.onCodeLens((params): CodeLens[] => {
        log.debug('Code lens request', { uri: params.textDocument.uri });
        try {
            const uri = params.textDocument.uri;
            const cache = documentCache.get(uri);

            if (!cache) {
                return [];
            }

            // Check if we have cached lenses for this document version
            const cached = codeLensCache.get(uri);
            if (cached && cached.version === cache.version) {
                log.debug('Code lens cache hit', { uri, version: cache.version });
                return cached.lenses;
            }

            const lenses: CodeLens[] = [];

            for (const symbol of cache.symbols) {
                if (symbol.kind === 'method' || symbol.kind === 'class') {
                    const line = Math.max(0, (symbol.position?.line ?? 1) - 1);
                    const char = Math.max(0, (symbol.position?.column ?? 1) - 1);
                    const symbolName = symbol.name ?? '';

                    const position: Position = { line, character: char };

                    lenses.push({
                        range: {
                            start: { line, character: char },
                            end: { line, character: char + symbolName.length }
                        },
                        data: {
                            uri,
                            symbolName,
                            kind: symbol.kind,
                            position
                        }
                    });
                }
            }

            // Cache the lenses for this document version
            codeLensCache.set(uri, { version: cache.version, lenses });

            connection.console.log(`[CODE_LENS] Generated ${lenses.length} lenses (cached for v${cache.version})`);
            return lenses;
        } catch (err) {
            log.error('Code lens failed', { error: err instanceof Error ? err.message : String(err) });
            return [];
        }
    });

    /**
     * Code Lens resolve handler - compute reference counts
     */
    connection.onCodeLensResolve((lens): CodeLens => {
        try {
            const data = lens.data as { uri: string; symbolName: string; kind: string; position: Position };

            if (!data) {
                return lens;
            }

            const currentCache = documentCache.get(data.uri);
            const currentVersion = currentCache?.version ?? 0;

            // Check resolved cache - prevents re-resolution on window focus changes
            const cached = resolvedLensCache.get(data.uri);
            if (cached && cached.version === currentVersion) {
                const cachedRefCount = cached.refCounts.get(data.symbolName);
                if (cachedRefCount !== undefined) {
                    lens.command = buildCodeLensCommand(cachedRefCount, data.uri, data.position);
                    return lens;
                }
            }

            // Compute ref count
            let refCount = 0;

            if (currentCache && currentCache.symbolPositions) {
                const positions = currentCache.symbolPositions.get(data.symbolName);
                refCount = positions?.length ?? 0;
            }

            const entries = Array.from(documentCache.entries());
            for (const [uri, cache] of entries) {
                if (uri !== data.uri && cache.symbolPositions) {
                    const positions = cache.symbolPositions.get(data.symbolName);
                    if (positions) {
                        refCount += positions.length;
                    }
                }
            }

            // Update cache
            if (!cached || cached.version !== currentVersion) {
                resolvedLensCache.set(data.uri, { version: currentVersion, refCounts: new Map() });
            }
            resolvedLensCache.get(data.uri)!.refCounts.set(data.symbolName, refCount);

            lens.command = buildCodeLensCommand(refCount, data.uri, data.position);

            connection.console.log(`[CODE_LENS] Resolved lens for "${data.symbolName}": ${refCount} refs`);
            return lens;
        } catch (err) {
            log.error('Code lens resolve failed', { error: err instanceof Error ? err.message : String(err) });
            return lens;
        }
    });
}
