/**
 * Workspace Index Scanner
 *
 * Directory scanning and file indexing logic.
 * Extracted from WorkspaceIndex for clarity and to keep files under 500 lines.
 */

import { PikeBridge } from '@pike-lsp/pike-bridge';
import type { Dirent } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import * as path from 'path';
import { Logger } from '@pike-lsp/core';
import type {
  IndexedDocument,
  FlattenedSymbolEntry,
  IndexProgressCallback,
  FileInfo,
  IndexMetrics,
} from './workspace-index-types.js';

/**
 * Callbacks the scanner uses to interact with the WorkspaceIndex data structures.
 */
export interface IndexStorage {
  documents: Map<string, IndexedDocument>;
  metrics: IndexMetrics;
  bridge: PikeBridge | null;
  log: Logger;
  flattenSymbols(symbols: import('@pike-lsp/pike-bridge').PikeSymbol[]): FlattenedSymbolEntry[];
  countLines(content: string): number;
  removeDocument(uri: string): void;
  addToLookup(uri: string, symbols: FlattenedSymbolEntry[], lineCount?: number): void;
  removeFromLookup(uri: string): void;
  reportError(message: string, uri?: string): void;
}

/**
 * Index all Pike files in a directory.
 * PERF-002: Uses batch parsing for better performance
 * PERF-007: Adds performance instrumentation
 * PERF-008: Incremental indexing with progress callbacks and chunked processing
 */
/**
 * Store a parsed document into the index, replacing any existing entry.
 */
function storeParsedDocument(
  storage: IndexStorage,
  uri: string,
  symbols: FlattenedSymbolEntry[],
  lastModified: number,
  lineCount: number
): void {
  const existing = storage.documents.get(uri);
  if (existing) {
    storage.removeFromLookup(uri);
  }

  storage.documents.set(uri, {
    uri,
    symbols,
    version: 1,
    lastModified,
    lineCount,
  });

  storage.addToLookup(uri, symbols, lineCount);
}

export async function indexDirectory(
  storage: IndexStorage,
  dirPath: string,
  recursive: boolean = true,
  onProgress?: IndexProgressCallback
): Promise<number> {
  if (!storage.bridge?.isRunning()) {
    return 0;
  }

  const totalStart = performance.now();

  // PERF-007: Time file discovery
  const discoveryStart = performance.now();
  const allFiles = await findPikeFilesWithStats(storage, dirPath, recursive);
  const discoveryEnd = performance.now();
  storage.metrics.lastFileDiscoveryMs = discoveryEnd - discoveryStart;

  if (allFiles.length === 0) {
    return 0;
  }

  // PERF-008: Report discovery phase
  onProgress?.({
    current: allFiles.length,
    total: allFiles.length,
    phase: 'discovering',
    message: `Discovered ${allFiles.length} Pike files`,
  });

  // PERF-008: Filter for changed/new files only (incremental indexing)
  const filesToIndex = allFiles.filter(fileInfo => {
    const uri = `file://${fileInfo.path}`;
    const existing = storage.documents.get(uri);
    return !existing || existing.lastModified < fileInfo.lastModified;
  });

  // PERF-008: Track and remove deleted files
  const currentPaths = new Set(allFiles.map(f => `file://${f.path}`));
  let deletedCount = 0;
  for (const [uri] of storage.documents) {
    if (!currentPaths.has(uri) && uri.startsWith('file://')) {
      storage.removeDocument(uri);
      deletedCount++;
    }
  }

  const skippedCount = allFiles.length - filesToIndex.length;

  // PERF-008: Report discovery results
  onProgress?.({
    current: 0,
    total: filesToIndex.length,
    phase: 'discovering',
    message: `Found ${filesToIndex.length} changed files, skipped ${skippedCount}, removed ${deletedCount}`,
  });

  if (filesToIndex.length === 0) {
    // PERF-008: Log incremental reindex (no changes)
    storage.log.info('workspace-index-perf', {
      event: 'workspace-index-perf',
      fileCount: allFiles.length,
      indexed: 0,
      skipped: skippedCount,
      deleted: deletedCount,
      fileDiscoveryMs: storage.metrics.lastFileDiscoveryMs.toFixed(2),
      fileReadMs: '0.00',
      parsingMs: '0.00',
      indexingMs: '0.00',
      totalMs: (performance.now() - totalStart).toFixed(2),
      incremental: true,
    });
    storage.metrics.lastFileCount = allFiles.length;
    storage.metrics.lastIndexTimeMs = performance.now() - totalStart;
    return 0;
  }

  storage.metrics.lastParsingMs = 0;
  storage.metrics.lastIndexingMs = 0;

  // PERF-008: Chunk size for file reading (smaller than bridge's 50)
  const CHUNK_SIZE = 20;

  let totalReadMs = 0;
  let indexed = 0;

  for (let i = 0; i < filesToIndex.length; i += CHUNK_SIZE) {
    const chunk = filesToIndex.slice(i, i + CHUNK_SIZE);
    const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(filesToIndex.length / CHUNK_SIZE);

    // PERF-008: Report reading progress
    onProgress?.({
      current: i,
      total: filesToIndex.length,
      phase: 'reading',
      message: `Reading files ${i + 1}-${Math.min(i + CHUNK_SIZE, filesToIndex.length)} of ${filesToIndex.length}`,
    });

    const chunkReadStart = performance.now();

    // PERF-008: Read only this chunk (lazy loading)
    const chunkData: Array<{
      code: string;
      filename: string;
      lastModified: number;
      lineCount: number;
    }> = [];
    for (const fileInfo of chunk) {
      try {
        const content = await readFile(fileInfo.path, 'utf-8');
        chunkData.push({
          code: content,
          filename: fileInfo.path,
          lastModified: fileInfo.lastModified,
          lineCount: storage.countLines(content),
        });
      } catch (error) {
        storage.log.debug('Skipping unreadable file during indexing', {
          path: fileInfo.path,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const chunkReadEnd = performance.now();
    totalReadMs += chunkReadEnd - chunkReadStart;

    // PERF-008: Report parsing progress
    onProgress?.({
      current: i,
      total: filesToIndex.length,
      phase: 'parsing',
      message: `Parsing chunk ${chunkNumber} of ${totalChunks} (${chunkData.length} files)`,
    });

    try {
      // PERF-007: Time parsing (IPC + Pike)
      const parseStart = performance.now();
      const batchResult = await storage.bridge.batchParse(
        chunkData.map(d => ({ code: d.code, filename: d.filename }))
      );
      const parseEnd = performance.now();
      storage.metrics.lastParsingMs += parseEnd - parseStart;

      // PERF-008: Time indexing for this chunk
      const indexingStart = performance.now();

      // Process results with proper bounds checking
      for (let j = 0; j < Math.min(batchResult.results.length, chunkData.length); j++) {
        const result = batchResult.results[j];
        const fileInfo = chunkData[j];

        // Skip if either result or file info is undefined
        if (!result || !fileInfo) continue;
        const uri = `file://${result.filename}`;
        const symbols = storage.flattenSymbols(result.symbols);

        storeParsedDocument(storage, uri, symbols, fileInfo.lastModified, fileInfo.lineCount);
        indexed++;
      }

      const indexingEnd = performance.now();
      storage.metrics.lastIndexingMs += indexingEnd - indexingStart;

      // PERF-008: Report chunk progress
      onProgress?.({
        current: i + chunk.length,
        total: filesToIndex.length,
        phase: 'indexing',
        message: `Indexed ${indexed} of ${filesToIndex.length} changed files`,
      });
    } catch (err) {
      storage.reportError(
        `[Pike LSP] Batch parse failed for chunk ${chunkNumber}, falling back to sequential parsing: ${err instanceof Error ? err.message : String(err)}`
      );

      // Fallback to sequential parsing for this chunk
      for (const fileData of chunkData) {
        try {
          const analyzeResult = await storage.bridge.analyze(
            fileData.code,
            ['parse'],
            fileData.filename
          );
          const parsedSymbols = analyzeResult.result?.parse?.symbols ?? [];

          const uri = `file://${fileData.filename}`;
          const symbols = storage.flattenSymbols(parsedSymbols);

          storeParsedDocument(storage, uri, symbols, fileData.lastModified, fileData.lineCount);
          indexed++;
        } catch (error) {
          storage.log.debug('Sequential parse fallback failed for file', {
            path: fileData.filename,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  storage.metrics.lastFileReadMs = totalReadMs;

  // PERF-007: Log performance data
  storage.log.info('workspace-index-perf', {
    event: 'workspace-index-perf',
    fileCount: allFiles.length,
    indexed,
    skipped: skippedCount,
    deleted: deletedCount,
    fileDiscoveryMs: storage.metrics.lastFileDiscoveryMs.toFixed(2),
    fileReadMs: storage.metrics.lastFileReadMs.toFixed(2),
    parsingMs: storage.metrics.lastParsingMs.toFixed(2),
    indexingMs: storage.metrics.lastIndexingMs.toFixed(2),
    totalMs: (performance.now() - totalStart).toFixed(2),
    incremental: indexed < allFiles.length,
  });

  // PERF-007: Update metrics
  const totalEnd = performance.now();
  storage.metrics.lastIndexTimeMs = totalEnd - totalStart;
  storage.metrics.lastFileCount = allFiles.length;
  storage.metrics.totalFilesIndexed += indexed;

  return indexed;
}

/**
 * Find all Pike files in a directory with filesystem modification times.
 * PERF-008: Enables incremental indexing by tracking file mtime
 */
async function findPikeFilesWithStats(
  storage: IndexStorage,
  dirPath: string,
  recursive: boolean
): Promise<FileInfo[]> {
  const pikePaths: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      storage.log.debug('Skipping unreadable directory while scanning workspace', {
        path: dir,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        // Skip common non-source directories
        if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod')) {
          pikePaths.push(fullPath);
        }
      }
    }
  };

  await walk(dirPath);

  // PERF-008: Batch stat() calls with concurrency limit of 50
  const BATCH_SIZE = 50;
  const files: FileInfo[] = [];
  for (let i = 0; i < pikePaths.length; i += BATCH_SIZE) {
    const batch = pikePaths.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async filePath => {
        try {
          const stats = await stat(filePath);
          return { path: filePath, lastModified: stats.mtimeMs } as FileInfo;
        } catch (error) {
          storage.log.debug('Skipping file with unreadable metadata', {
            path: filePath,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      })
    );
    for (const result of results) {
      if (result !== null) files.push(result);
    }
  }

  return files;
}
