/**
 * Workspace Index Types
 *
 * Shared types and interfaces for the workspace symbol index.
 */

import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/**
 * Indexed document with its symbols
 */
export interface IndexedDocument {
  uri: string;
  symbols: Array<FlattenedSymbolEntry | PikeSymbol>;
  version: number;
  lastModified: number;
  lineCount?: number;
}

export interface FlattenedSymbolEntry {
  symbol: PikeSymbol;
  parentName?: string;
}

/**
 * Symbol entry in the quick lookup index
 */
export interface SymbolEntry {
  name: string;
  kind: string;
  uri: string;
  line: number;
  maxLine?: number;
  parentName?: string; // WS-001: Parent symbol name for containerName field
}

export interface ImportableSymbolSearchResult {
  symbol: string;
  modulePath: string;
  importKind: 'import' | 'inherit';
  score: number;
  source: 'workspace-index';
}

/**
 * Error callback type for reporting indexing errors
 */
export type IndexErrorCallback = (message: string, uri?: string) => void;

/**
 * Progress information during workspace indexing
 */
export interface IndexProgress {
  current: number;
  total: number;
  phase: 'discovering' | 'reading' | 'parsing' | 'indexing';
  message: string;
}

/**
 * Callback type for progress updates during indexing
 */
export type IndexProgressCallback = (progress: IndexProgress) => void;

/**
 * File information with filesystem modification time
 */
export interface FileInfo {
  path: string;
  lastModified: number;
}

/**
 * Performance metrics for indexing operations
 */
export interface IndexMetrics {
  /** Total time for the last indexDirectory operation */
  lastIndexTimeMs: number;
  /** Time spent discovering files */
  lastFileDiscoveryMs: number;
  /** Time spent reading files */
  lastFileReadMs: number;
  /** Time spent parsing (IPC + Pike) */
  lastParsingMs: number;
  /** Time spent updating the index */
  lastIndexingMs: number;
  /** Number of files in the last index operation */
  lastFileCount: number;
  /** Cumulative number of files indexed since server start */
  totalFilesIndexed: number;
}
