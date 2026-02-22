/**
 * Moniker Handler
 *
 * Provides unique identifiers for symbols to enable cross-reference between
 * different code bases or code navigation tools.
 *
 * Features:
 * - Generate unique monikers for functions, classes, variables, etc.
 * - Support for 'scheme' to identify the naming convention
 * - Integration with workspace symbols
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import {
    Connection,
    Moniker,
    MonikerParams,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import { Logger } from '@pike-lsp/core';

/**
 * Supported moniker schemes for Pike
 */
enum MonikerScheme {
    Pike = 'pike',
    Oid = 'oid',
    Namespace = 'namespace',
}

/**
 * Register moniker handler.
 */
export function registerMonikerHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

    /**
     * Generate a unique moniker for a symbol.
     * Uses the format: scheme:identifier
     */
    function generateMoniker(
        symbolName: string,
        _symbolKind: string,
        filePath: string,
        scheme: MonikerScheme = MonikerScheme.Pike
    ): Moniker {
        // Create a stable identifier based on file path and symbol name
        // Normalize the file path for consistency
        const normalizedPath = filePath.replace(/\\/g, '/').replace(/\.pike$/, '');

        // Generate unique identifier
        const uniqueId = `${normalizedPath}/${symbolName}`;

        return {
            scheme: scheme,
            identifier: uniqueId,
            // @ts-expect-error - unique is optional in older LSP versions
            unique: uniqueId,
        };
    }

    /**
     * Map LSP symbol kind to appropriate moniker scheme.
     */
    function getSchemeForKind(kind: string): MonikerScheme {
        switch (kind) {
            case 'class':
            case 'interface':
            case 'type':
            case 'enum':
                return MonikerScheme.Namespace;
            case 'function':
            case 'method':
            case 'macro':
                return MonikerScheme.Pike;
            default:
                return MonikerScheme.Pike;
        }
    }

    /**
     * Handle textDocument/moniker request.
     * Returns monikers for symbols at the given position.
     */
    connection.languages.moniker.on(async (params: MonikerParams): Promise<Moniker[] | null> => {
        log.debug('Moniker request', { uri: params.textDocument.uri });

        try {
            const uri = params.textDocument.uri;
            const cached = documentCache.get(uri);
            const document = documents.get(uri);

            if (!cached || !document) {
                return null;
            }

            // Get the position from the request
            const position = params.position;

            // Find the symbol at or near the cursor position
            const symbols = cached.symbols;

            // Find the smallest enclosing symbol that contains the position
            let foundSymbol: PikeSymbol | null = null;
            let smallestRange = Infinity;

            for (const symbol of symbols) {
                if (!symbol.range) continue;

                const startLine = symbol.range.start.line;
                const endLine = symbol.range.end.line;
                const startChar = symbol.range.start.character;
                const endChar = symbol.range.end.character;

                // Check if position is within the symbol's range
                const isWithinLine = position.line >= startLine && position.line <= endLine;
                const isWithinChar = isWithinLine && (
                    (position.line > startLine || position.character >= startChar) &&
                    (position.line < endLine || position.character <= endChar)
                );

                if (isWithinChar) {
                    // Calculate the "size" of the range - prefer smaller ranges
                    const rangeSize = (endLine - startLine) * 1000 + (endChar - startChar);
                    if (rangeSize < smallestRange) {
                        smallestRange = rangeSize;
                        foundSymbol = symbol;
                    }
                }
            }

            if (!foundSymbol) {
                return null;
            }

            // Generate moniker for the found symbol
            const filePath = uri.replace(/^file:\/\//, '').replace(/^\//, '');
            const scheme = getSchemeForKind(foundSymbol.kind);

            const moniker = generateMoniker(
                foundSymbol.name,
                foundSymbol.kind,
                filePath,
                scheme
            );

            return [moniker];
        } catch (err) {
            log.error(`Moniker request failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`);
            return null;
        }
    });

    /**
     * Handler for $/logMessage - log message from client (noop, for protocol compliance)
     */
    connection.onRequest('$/logMessage', async (params) => {
        log.debug('Log message request', params);
        return null;
    });

    /**
     * Handler for $/cancelRequest - cancel a pending request (protocol compliance)
     *
     * Per LSP spec, this allows clients to cancel long-running requests.
     * The server acknowledges the cancellation request but doesn't actively
     * track cancellable requests - the client simply won't wait for the response.
     */
    connection.onRequest('$/cancelRequest', async (params: { id: number | string }) => {
        log.debug('Cancel request received', { requestId: params.id });
        // Return null to acknowledge the cancellation request
        // The actual request will complete but the client will ignore the response
        return null;
    });
}
