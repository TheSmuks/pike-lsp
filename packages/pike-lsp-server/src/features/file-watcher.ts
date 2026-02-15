/**
 * File Watching for Incremental Updates
 *
 * Issue #184: Implements file watching for incremental symbol updates.
 * When files change on disk, the workspace index is updated without
 * requiring a full re-index.
 *
 * Features:
 * - Detects file changes (Created, Changed, Deleted)
 * - Incrementally updates the workspace symbol index
 * - Handles file deletions by removing symbols from cache
 * - Filters non-Pike files efficiently
 */

import type { Connection, DidChangeWatchedFilesParams } from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../services/index.js';
import * as fs from 'node:fs';
import { Logger } from '@pike-lsp/core';

/**
 * File change event type from LSP
 * 1 = Created, 2 = Changed, 3 = Deleted
 */
const LSPFileChangeType = {
    Created: 1,
    Changed: 2,
    Deleted: 3,
};

/**
 * Pike file extensions to watch
 */
const PIKE_EXTENSIONS = new Set(['.pike', '.pmod', '.cmod']);

/**
 * Check if a URI is a Pike source file
 * Exported for testing
 */
export function isPikeFile(uri: string): boolean {
    const pathname = decodeURIComponent(uri.replace(/^file:\/\//, ''));
    return PIKE_EXTENSIONS.has(getExtension(pathname));
}

/**
 * Get file extension from path
 */
function getExtension(pathname: string): string {
    const idx = pathname.lastIndexOf('.');
    return idx >= 0 ? pathname.substring(idx) : '';
}

/**
 * Convert file URI to filesystem path
 */
function uriToPath(uri: string): string {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

/**
 * Register file watching handler with the LSP connection.
 *
 * This handler watches for file system changes and incrementally
 * updates the workspace index when Pike files are modified.
 *
 * @param connection - LSP connection
 * @param services - Server services bundle
 * @param documents - Text document manager (for open documents)
 */
export function registerFileWatcher(
    connection: Connection,
    services: Services,
    documents: TextDocuments<TextDocument>
): void {
    const { workspaceIndex, documentCache } = services;
    const log = new Logger('FileWatcher');

    connection.onDidChangeWatchedFiles(async (params: DidChangeWatchedFilesParams) => {
        const startTime = Date.now();
        let processed = 0;
        let created = 0;
        let updated = 0;
        let deleted = 0;
        let skipped = 0;

        connection.console.log(`[FILE_WATCHER] Processing ${params.changes.length} file change events`);

        for (const change of params.changes) {
            const uri = change.uri;
            const type = change.type;

            // Skip non-Pike files
            if (!isPikeFile(uri)) {
                skipped++;
                continue;
            }

            const filePath = uriToPath(uri);

            try {
                switch (type) {
                    case LSPFileChangeType.Created: {
                        connection.console.log(`[FILE_WATCHER] Created: ${uri}`);
                        await handleFileCreated(uri, filePath, documents, workspaceIndex);
                        created++;
                        processed++;
                        break;
                    }

                    case LSPFileChangeType.Changed: {
                        connection.console.log(`[FILE_WATCHER] Changed: ${uri}`);
                        await handleFileChanged(uri, filePath, documents, workspaceIndex, documentCache);
                        updated++;
                        processed++;
                        break;
                    }

                    case LSPFileChangeType.Deleted: {
                        connection.console.log(`[FILE_WATCHER] Deleted: ${uri}`);
                        handleFileDeleted(uri, workspaceIndex, documentCache);
                        deleted++;
                        processed++;
                        break;
                    }

                    default:
                        connection.console.warn(`[FILE_WATCHER] Unknown file change type: ${type} for ${uri}`);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                connection.console.error(`[FILE_WATCHER] Error processing ${uri}: ${message}`);
                log.error(`Failed to process file change: ${message}`, { uri });
            }
        }

        const duration = Date.now() - startTime;
        connection.console.log(
            `[FILE_WATCHER] Completed in ${duration}ms: ` +
            `${processed} processed (created: ${created}, updated: ${updated}, deleted: ${deleted}), ` +
            `${skipped} skipped (non-Pike files)`
        );
    });

    /**
     * Handle a newly created file
     */
    async function handleFileCreated(
        uri: string,
        path: string,
        docs: TextDocuments<TextDocument>,
        index: typeof workspaceIndex
    ): Promise<void> {
        // Check if file is already open in editor
        const doc = docs.get(uri);
        if (doc) {
            // File is open, index from document content
            await index.indexDocument(uri, doc.getText(), doc.version);
            return;
        }

        // File is not open, read from disk
        try {
            const content = await fs.promises.readFile(path, 'utf-8');
            await index.indexDocument(uri, content, 0);
        } catch (err) {
            throw new Error(`Failed to read created file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Handle a modified file
     */
    async function handleFileChanged(
        uri: string,
        path: string,
        docs: TextDocuments<TextDocument>,
        index: typeof workspaceIndex,
        cache: typeof documentCache
    ): Promise<void> {
        // Check if file is open in editor
        const doc = docs.get(uri);
        if (doc) {
            // File is open in editor - didChange will handle indexing
            // No need to re-index here, it would create duplicate work
            connection.console.log(`[FILE_WATCHER] Skipping open file (didChange will handle): ${uri}`);
            return;
        }

        // File is not open, read from disk and re-index
        try {
            const content = await fs.promises.readFile(path, 'utf-8');
            await index.indexDocument(uri, content, 0);

            // Also clear any cached diagnostics for this file
            cache.delete(uri);
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                // File was deleted between change event and now
                handleFileDeleted(uri, index, cache);
                return;
            }
            throw new Error(`Failed to read changed file: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /**
     * Handle a deleted file
     */
    function handleFileDeleted(
        uri: string,
        index: typeof workspaceIndex,
        cache: typeof documentCache
    ): void {
        // Remove from workspace index
        index.removeDocument(uri);

        // Remove from document cache
        cache.delete(uri);
    }
}

/**
 * Get the file watch pattern for Pike files
 * Used to register with the client's file watcher
 */
export function getPikeFileWatchPatterns(): Array<{
    pattern: string;
    kind: 'file' | 'folder';
}> {
    return [
        { pattern: '**/*.pike', kind: 'file' },
        { pattern: '**/*.pmod', kind: 'file' },
        { pattern: '**/*.cmod', kind: 'file' },
    ];
}

/**
 * Export FileChangeType constants for tests
 */
export const FileChangeType = LSPFileChangeType;
