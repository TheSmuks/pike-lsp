/**
 * Workspace Scanner Service
 *
 * Scans workspace for Pike source files and provides file discovery
 * for workspace-wide operations like Find References.
 */

/** Convert a file:// URI or raw path to a normalized filesystem path. */
function toNormalizedPath(raw: string): string {
  const stripped = raw.replace(/^file:\/\//, '');
  return stripTrailingSlash(decodeURIComponent(stripped));
}

/** Strip trailing slashes (preserve root '/'). */
function stripTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { IntrospectedSymbol, PikeToken } from '@pike-lsp/pike-bridge';
import { Logger } from '@pike-lsp/core';

/**
 * Information about a workspace file.
 */
export interface WorkspaceFileInfo {
  /** File URI */
  uri: string;
  /** File path (file://) */
  path: string;
  /** Normalized filesystem path (decoded, no file:// prefix) */
  normalizedPath: string;
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

  constructor(private readonly logger: Logger) {}

  /**
   * Initialize the workspace scanner with workspace folders.
   */
  async initialize(folders: string[]): Promise<void> {
    this.logger.debug('WorkspaceScanner: initializing', { folderCount: folders.length });

    for (const folder of folders) {
      this.workspaceRoots.add(toNormalizedPath(folder));
    }

    await this.scanAll();
    this.initialized = true;
  }

  /**
   * Add a workspace folder and scan it.
   */
  async addFolder(folder: string): Promise<void> {
    this.workspaceRoots.add(toNormalizedPath(folder));
    const files = await this.scanFolder(folder);
    for (const file of files) {
      this.files.set(file.uri, file);
    }
  }

  /**
   * Remove a workspace folder.
   */
  removeFolder(folder: string): void {
    this.logger.debug('WorkspaceScanner: removing folder', { folder });
    const normalizedFolder = toNormalizedPath(folder);

    this.workspaceRoots.delete(normalizedFolder);

    // Remove all files from this folder
    for (const [uri, info] of this.files) {
      if (
        info.normalizedPath === normalizedFolder ||
        info.normalizedPath.startsWith(`${normalizedFolder}/`)
      ) {
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
            const subOptions = opts.maxDepth > 0 ? { ...opts, maxDepth: opts.maxDepth - 1 } : opts;
            const subFiles = await this.scanFolder(fullPath, subOptions);
            results.push(...subFiles);
          }
        } else if (entry.isFile()) {
          // Check file extension
          const ext = entry.name.substring(entry.name.lastIndexOf('.'));
          if (opts.extensions.includes(ext)) {
            const uri = fullPath.startsWith('file://') ? fullPath : `file://${fullPath}`;
            const normalizedPath = toNormalizedPath(fullPath);

            try {
              const stat = await fs.stat(fullPath);
              results.push({
                uri,
                path: uri,
                normalizedPath,
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
  updateFileData(
    uri: string,
    data: {
      symbols?: IntrospectedSymbol[];
      symbolPositions?: Map<string, Array<{ line: number; character: number }>>;
    }
  ): void {
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

  upsertFile(uri: string, lastModified: number): void {
    const existing = this.files.get(uri);
    const normalizedPath = toNormalizedPath(uri);
    if (existing) {
      existing.lastModified = lastModified;
      existing.path = uri;
      existing.normalizedPath = normalizedPath;
      return;
    }

    this.files.set(uri, {
      uri,
      path: uri,
      normalizedPath,
      lastModified,
    });
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

  removeFile(uri: string): void {
    this.files.delete(uri);
  }

  /**
   * Search for symbol references across workspace files.
   * Returns URIs of files that contain the symbol name.
   *
   * For files with cached symbols, checks those directly.
   * For uncached files, reads content and uses the provided tokenize
   * function to find identifier tokens matching the symbol name.
   */
  async searchSymbol(
    symbolName: string,
    options: {
      tokenize?: (content: string, filePath: string) => Promise<PikeToken[]>;
    } = {}
  ): Promise<string[]> {
    const matchingFiles: string[] = [];

    for (const [uri, file] of this.files) {
      // Check cached symbols first (fast path)
      if (file.symbols) {
        if (file.symbols.some((s: IntrospectedSymbol) => s.name === symbolName)) {
          matchingFiles.push(uri);
        }
        continue;
      }

      // For uncached files, tokenize and check identifier tokens
      if (options.tokenize) {
        try {
          const filePath = file.normalizedPath;
          const content = await fs.readFile(filePath, 'utf-8');
          const tokens = await options.tokenize(content, filePath);
          const hasMatch = tokens.some(t => t.text === symbolName);
          if (hasMatch) {
            matchingFiles.push(uri);
          }
        } catch {
          // File may have been deleted or unreadable; skip
        }
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
