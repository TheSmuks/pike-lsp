/**
 * Document Links Handler
 *
 * Provides clickable file paths in Pike code.
 */

import {
    Connection,
    DocumentLink,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { Services } from '../../services/index.js';
import type { PikeSettings } from '../../core/types.js';
import type { DocumentCache } from '../../services/document-cache.js';
import { Logger } from '@pike-lsp/core';
import * as path from 'path';
import * as fsSync from 'fs';

/**
 * Register document links handler.
 */
export function registerDocumentLinksHandler(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>,
    _globalSettings: PikeSettings,
    includePaths: string[]
): void {
    const { documentCache } = services;
    const log = new Logger('Advanced');

    /**
     * Document Links handler - find clickable file paths
     */
    connection.onDocumentLinks((params): DocumentLink[] => {
        log.debug('Document links request', { uri: params.textDocument.uri });
        try {
            const document = documents.get(params.textDocument.uri);
            if (!document) {
                return [];
            }

            const links: DocumentLink[] = [];
            const text = document.getText();
            const lines = text.split('\n');
            const documentDir = getDocumentDirectory(params.textDocument.uri);

            const inheritRegex = /inherit\s+([A-Z][\w.]*)/g;
            const includeRegex = /#include\s+"([^"]+)"/g;
            const docLinkRegex = /\/\/[!/]?\s*@(?:file|see|link):\s*([^\s]+)/g;

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
                const line = lines[lineNum] ?? '';

                let inheritMatch: RegExpExecArray | null;
                while ((inheritMatch = inheritRegex.exec(line)) !== null) {
                    const index = inheritMatch.index;
                    const modulePath = inheritMatch[1];
                    if (index !== undefined && modulePath) {
                        const link = resolveModulePath(modulePath, documentDir, documentCache);
                        if (link) {
                            links.push({
                                range: {
                                    start: { line: lineNum, character: index },
                                    end: { line: lineNum, character: index + modulePath.length }
                                },
                                target: link.target,
                                tooltip: link.tooltip
                            });
                        }
                    }
                }
                inheritRegex.lastIndex = 0;

                let includeMatch: RegExpExecArray | null;
                while ((includeMatch = includeRegex.exec(line)) !== null) {
                    const index = includeMatch.index;
                    const filePath = includeMatch[1];
                    if (index !== undefined && filePath) {
                        const link = resolveIncludePath(filePath, documentDir, includePaths);
                        if (link) {
                            links.push({
                                range: {
                                    start: { line: lineNum, character: index },
                                    end: { line: lineNum, character: index + filePath.length + 2 }
                                },
                                target: link.target,
                                tooltip: link.tooltip
                            });
                        }
                    }
                }
                includeRegex.lastIndex = 0;

                let docMatch: RegExpExecArray | null;
                while ((docMatch = docLinkRegex.exec(line)) !== null) {
                    const index = docMatch.index;
                    const filePath = docMatch[1];
                    if (index !== undefined && filePath) {
                        if (filePath.includes('/') || filePath.includes('.')) {
                            const link = resolveIncludePath(filePath, documentDir, includePaths);
                            if (link) {
                                links.push({
                                    range: {
                                        start: { line: lineNum, character: index },
                                        end: { line: lineNum, character: index + filePath.length }
                                    },
                                    target: link.target,
                                    tooltip: link.tooltip
                                });
                            }
                        }
                    }
                }
                docLinkRegex.lastIndex = 0;
            }

            connection.console.log(`[DOC_LINKS] Found ${links.length} links`);
            return links;
        } catch (err) {
            log.error(`Document links failed for ${params.textDocument.uri}: ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    });
}

/**
 * Resolve a module path from inherit statement to a file URI
 * @export For testing purposes
 */
export function resolveModulePath(
    modulePath: string,
    _documentDir: string,
    documentCache: DocumentCache
): { target: string; tooltip: string } | null {
    // Iterate through document cache entries
    const entries = Array.from(documentCache.keys());
    for (const uri of entries) {
        if (uri.includes(modulePath) || uri.endsWith(modulePath + '.pike') || uri.endsWith(modulePath + '.pmod')) {
            return {
                target: uri,
                tooltip: `Navigate to ${modulePath}`
            };
        }
    }
    return null;
}

/**
 * Resolve an include path to a file URI
 */
function resolveIncludePath(
    filePath: string,
    documentDir: string,
    includePaths: string[]
): { target: string; tooltip: string } | null {
    // Handle absolute paths
    if (filePath.startsWith('/')) {
        if (fsSync.existsSync(filePath)) {
            return {
                target: `file://${filePath}`,
                tooltip: filePath
            };
        }
        return null;
    }

    // Try document directory first, then include paths
    const candidates = [
        path.resolve(documentDir, filePath),
        ...includePaths.map((includePath) => path.resolve(includePath, filePath))
    ];

    for (const candidate of candidates) {
        if (fsSync.existsSync(candidate)) {
            return {
                target: `file://${candidate}`,
                tooltip: `${filePath} → ${candidate}`
            };
        }
    }

    // File not found - don't return a broken link
    return null;
}

/**
 * Get the directory path from a file URI
 */
function getDocumentDirectory(uri: string): string {
    // Decode URI-encoded characters (e.g., %20 -> space)
    const filePath = decodeURIComponent(uri.replace(/^file:\/\/\/?/, ''));
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash >= 0 ? filePath.substring(0, lastSlash) : filePath;
}
