/**
 * Workspace Scanner Service
 *
 * Scans workspace for Pike source files and provides file discovery
 * for workspace-wide operations like Find References.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { PikeSettings } from '../core/types.js';
import type { IntrospectedSymbol } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

/**
 * Information about a workspace file.
 */
export interface WorkspaceFileInfo {
    /** File URI */
    uri: string;
    /** File path (file://) */
    path: string;
    /** Last modified time */
    lastModified: number;
    /** Cached symbols (lazy-loaded) */
    symbols?: IntrospectedSymbol[] | undefined;
    /** Cached symbol positions */
    symbolPositions?: Map<string, Array<{ line: number; character: number }>> | undefined;
}

/**
 * Scan options for workspace scanning.
 */
export interface ScanOptions {
    /** File extensions to include */
    extensions?: string[];
    /** Maximum depth to scan (0 = unlimited) */
    maxDepth?: number;
    /** Pattern to exclude (e.g., "node_modules") */
    excludePatterns?: string[];
}

/**
 * Default scan options.
 */
const DEFAULT_OPTIONS: Required<ScanOptions> = {
    extensions: ['.pike', '.pmod'],
    maxDepth: 0,
    excludePatterns: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
};

/**
 * Workspace Scanner Service
 *
 * Discovers and tracks all Pike files in the workspace.
 */
export class WorkspaceScanner {
    private files: Map<string, WorkspaceFileInfo> = new Map();
    private workspaceRoots: Set<string> = new Set();
    private scanPending: boolean = false;
    private initialized: boolean = false;

    constructor(
        private readonly logger: Logger,
        _getSettings: () => PikeSettings
    ) {}

    /**
     * Initialize the workspace scanner with workspace folders.
     */
    async initialize(folders: string[]): Promise<void> {
        this.logger.debug('WorkspaceScanner: initializing', { folderCount: folders.length });

        for (const folder of folders) {
            this.workspaceRoots.add(folder);
        }

        await this.scanAll();
        this.initialized = true;
    }

    /**
     * Add a workspace folder and scan it.
     */
    async addFolder(folder: string): Promise<void> {
        this.logger.debug('WorkspaceScanner: adding folder', { folder });
        this.workspaceRoots.add(folder);
        await this.scanFolder(folder);
    }

    /**
     * Remove a workspace folder.
     */
    removeFolder(folder: string): void {
        this.logger.debug('WorkspaceScanner: removing folder', { folder });
        this.workspaceRoots.delete(folder);

        // Remove all files from this folder
        for (const [uri, info] of this.files) {
            if (info.path.startsWith(folder)) {
                this.files.delete(uri);
            }
        }
    }

    /**
     * Scan all workspace folders.
     */
    async scanAll(): Promise<void> {
        if (this.scanPending) {
            return;
        }

        this.scanPending = true;
        const startTime = Date.now();

        try {
            this.logger.debug('WorkspaceScanner: scanning all workspace folders');

            const files: WorkspaceFileInfo[] = [];

            for (const root of this.workspaceRoots) {
                const folderFiles = await this.scanFolder(root);
                files.push(...folderFiles);
            }

            // Clear and update cache
            this.files.clear();
            for (const file of files) {
                this.files.set(file.uri, file);
            }

            const elapsed = Date.now() - startTime;
            this.logger.info('WorkspaceScanner: scan complete', {
                fileCount: this.files.size,
                elapsed: `${elapsed}ms`,
            });
        } finally {
            this.scanPending = false;
        }
    }

    /**
     * Scan a single folder for Pike files.
     */
    async scanFolder(folderPath: string, options: ScanOptions = {}): Promise<WorkspaceFileInfo[]> {
        const opts = { ...DEFAULT_OPTIONS, ...options };
        const results: WorkspaceFileInfo[] = [];

        try {
            const entries = await fs.readdir(folderPath, { withFileTypes: true });

            for (const entry of entries) {
                // Skip excluded patterns
                if (opts.excludePatterns.some(pattern => entry.name.includes(pattern))) {
                    continue;
                }

                const fullPath = join(folderPath, entry.name);

                if (entry.isDirectory()) {
                    // Recursively scan subdirectories (with depth limit if set)
                    if (opts.maxDepth === 0 || opts.maxDepth > 1) {
                        const subOptions = opts.maxDepth > 0
                            ? { ...opts, maxDepth: opts.maxDepth - 1 }
                            : opts;
                        const subFiles = await this.scanFolder(fullPath, subOptions);
                        results.push(...subFiles);
                    }
                } else if (entry.isFile()) {
                    // Check file extension
                    const ext = entry.name.substring(entry.name.lastIndexOf('.'));
                    if (opts.extensions.includes(ext)) {
                        const uri = fullPath.startsWith('file://')
                            ? fullPath
                            : `file://${fullPath}`;

                        try {
                            const stat = await fs.stat(fullPath);
                            results.push({
                                uri,
                                path: uri,
                                lastModified: stat.mtimeMs,
                            });
                        } catch (err) {
                            // File might have been deleted, skip - log at debug level
                            this.logger.debug('WorkspaceScanner: failed to stat file', {
                                path: fullPath,
                                error: err instanceof Error ? err.message : String(err),
                            });
                        }
                    }
                }
            }
        } catch (err) {
            this.logger.debug('WorkspaceScanner: failed to scan folder', {
                folder: folderPath,
                error: err instanceof Error ? err.message : String(err),
            });
        }

        return results;
    }

    /**
     * Get all workspace files.
     */
    getAllFiles(): WorkspaceFileInfo[] {
        return Array.from(this.files.values());
    }

    /**
     * Get files that are not in the document cache (not currently open).
     */
    getUncachedFiles(cachedUris: Set<string>): WorkspaceFileInfo[] {
        return this.getAllFiles().filter(file => !cachedUris.has(file.uri));
    }

    /**
     * Get a specific file by URI.
     */
    getFile(uri: string): WorkspaceFileInfo | undefined {
        return this.files.get(uri);
    }

    /**
     * Update cached data for a file.
     */
    updateFileData(uri: string, data: { symbols?: IntrospectedSymbol[]; symbolPositions?: Map<string, Array<{ line: number; character: number }>> }): void {
        const file = this.files.get(uri);
        if (file) {
            if (data.symbols) {
                file.symbols = data.symbols;
            }
            if (data.symbolPositions) {
                file.symbolPositions = data.symbolPositions;
            }
        }
    }

    /**
     * Invalidate cached data for a file (e.g., on file change).
     */
    invalidateFile(uri: string): void {
        const file = this.files.get(uri);
        if (file) {
            file.symbols = undefined;
            file.symbolPositions = undefined;
        }
    }

    /**
     * Search for symbol references across workspace files.
     * Returns files that contain the symbol name.
     */
    async searchSymbol(symbolName: string): Promise<string[]> {
        // For now, do a simple file name/content check
        // In a full implementation, we'd use a symbol index
        const matchingFiles: string[] = [];

        for (const [uri, file] of this.files) {
            // If we have cached symbols, check those first
            if (file.symbols) {
                const hasSymbol = file.symbols.some((s: IntrospectedSymbol) => s.name === symbolName);
                if (hasSymbol) {
                    matchingFiles.push(uri);
                }
            } else {
                // No cached data - include the file for later parsing
                // This is a simple heuristic that could be improved
                matchingFiles.push(uri);
            }
        }

        return matchingFiles;
    }

    /**
     * Check if scanner is initialized.
     */
    isReady(): boolean {
        return this.initialized;
    }

    /**
     * Get statistics about the workspace.
     */
    getStats(): { fileCount: number; rootCount: number; cachedFiles: number } {
        let cachedFiles = 0;
        for (const file of this.files.values()) {
            if (file.symbols) {
                cachedFiles++;
            }
        }

        return {
            fileCount: this.files.size,
            rootCount: this.workspaceRoots.size,
            cachedFiles,
        };
    }
}
