/**
 * Standard Test Helpers for pike-lsp
 *
 * Import this file instead of creating inline mocks.
 * Ensures consistent test patterns across all test files.
 *
 * Usage:
 *   import { describe, it } from 'bun:test';
 *   import assert from 'node:assert/strict';
 *   import { createMockDocuments, createMockBridge, createMockServices, makeCachedEntry } from './test-helpers.js';
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';

// ---------------------------------------------------------------------------
// Document mock
// ---------------------------------------------------------------------------

type OpenHandler = (event: { document: TextDocument }) => void;
type SaveHandler = (event: { document: TextDocument }) => void;
type ChangeHandler = (event: { document: TextDocument }) => void;
type CloseHandler = (event: { document: TextDocument }) => void;

export interface MockDocuments {
  get(uri: string): TextDocument | undefined;
  all(): TextDocument[];
  onDidOpen(handler: OpenHandler): void;
  onDidSave(handler: SaveHandler): void;
  onDidChangeContent(handler: ChangeHandler): void;
  onDidClose(handler: CloseHandler): void;
  emitOpen(document: TextDocument): void;
  emitSave(document: TextDocument): void;
  emitChange(document: TextDocument): void;
  emitClose(document: TextDocument): void;
}

export function createMockDocuments(): MockDocuments {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>();

  return {
    get(uri: string) { return docs.get(uri); },
    all() { return [...docs.values()]; },
    onDidOpen(handler: OpenHandler) { openHandler = handler; },
    onDidSave(handler: SaveHandler) { saveHandler = handler; },
    onDidChangeContent(handler: ChangeHandler) { changeHandler = handler; },
    onDidClose(handler: CloseHandler) { closeHandler = handler; },
    emitOpen(document: TextDocument) { docs.set(document.uri, document); openHandler?.({ document }); },
    emitSave(document: TextDocument) { docs.set(document.uri, document); saveHandler?.({ document }); },
    emitChange(document: TextDocument) { docs.set(document.uri, document); changeHandler?.({ document }); },
    emitClose(document: TextDocument) { docs.delete(document.uri); closeHandler?.({ document }); },
  };
}

// ---------------------------------------------------------------------------
// Bridge mock
// ---------------------------------------------------------------------------

export interface MockBridgeConfig {
  /** Simulates Pike's analyzer: returns error diagnostics for broken code */
  analyzeResult?: (text: string) => { hasError: boolean; errorMessage?: string };
  /** Simulated analysis delay in ms */
  delayMs?: number;
}

export interface MockBridge {
  isRunning(): boolean;
  start(): Promise<void>;
  engineOpenDocument(): Promise<{ revision: number; snapshotId: string }>;
  engineChangeDocument(): Promise<{ revision: number; snapshotId: string }>;
  engineCloseDocument(): Promise<{ revision: number; snapshotId: string }>;
  engineUpdateConfig(): Promise<{ revision: number; snapshotId: string }>;
  engineCancelRequest(): Promise<{ accepted: boolean }>;
  engineQuery(params: { queryParams?: { text?: string } }): Promise<{
    snapshotIdUsed: string;
    result: Record<string, unknown>;
    metrics: Record<string, unknown>;
  }>;
  analyze(): Promise<never>;
  findOccurrences(): Promise<{ occurrences: unknown[] }>;
  get callCount(): number;
}

export function createMockBridge(config: MockBridgeConfig = {}): MockBridge {
  let callCount = 0;
  const delayMs = config.delayMs ?? 1;
  const analyzeResult = config.analyzeResult ?? (() => ({ hasError: false }));

  return {
    get callCount() { return callCount; },
    isRunning() { return true; },
    async start() {},
    async engineOpenDocument() { return { revision: 1, snapshotId: 'snap-1' }; },
    async engineChangeDocument() { return { revision: 1, snapshotId: 'snap-2' }; },
    async engineCloseDocument() { return { revision: 1, snapshotId: 'snap-3' }; },
    async engineUpdateConfig() { return { revision: 1, snapshotId: 'snap-4' }; },
    async engineCancelRequest() { return { accepted: true }; },
    async engineQuery(params: { queryParams?: { text?: string } }) {
      callCount++;
      const text = params.queryParams?.text ?? '';
      const analysis = analyzeResult(text);
      const diags = analysis.hasError
        ? [{ message: analysis.errorMessage ?? 'Syntax error', severity: 'error', position: { line: 1, character: 0 } }]
        : [];
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
      return {
        snapshotIdUsed: `snp-${callCount}`,
        result: {
          analyzeResult: {
            result: {
              parse: { symbols: [], diagnostics: [] },
              introspect: { success: analysis.hasError ? 0 : 1, symbols: [], functions: [], variables: [], classes: [], inherits: [], diagnostics: [] },
              diagnostics: { diagnostics: diags },
            },
          },
          revision: 1,
        },
        metrics: { durationMs: delayMs },
      };
    },
    async analyze() { throw new Error('analyze fallback should not be used'); },
    async findOccurrences() { return { occurrences: [] }; },
  };
}

// ---------------------------------------------------------------------------
// Connection mock
// ---------------------------------------------------------------------------

export interface MockConnection {
  sendDiagnostics(params: { uri: string; diagnostics: unknown[] }): void;
  onDidChangeConfiguration(handler: (params: { settings: Record<string, unknown> }) => void): void;
  onDidChangeTextDocument(handler: (params: { textDocument: { uri: string; version: number }; contentChanges: unknown[] }) => void): void;
  console: { log(): void; warn(): void; error(): void };
}

export function createMockConnection(): MockConnection & { diagnosticsPublished: unknown[] } {
  const diagnosticsPublished: unknown[] = [];

  return {
    diagnosticsPublished,
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }) { diagnosticsPublished.push(params); },
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: { log() {}, warn() {}, error() {} },
  };
}

// ---------------------------------------------------------------------------
// Cache entry factory
// ---------------------------------------------------------------------------

export function makeCachedEntry(
  text: string,
  options: { parseFailed?: boolean; diagnostics?: unknown[] } = {}
): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: (options.diagnostics ?? []) as DocumentCacheEntry['diagnostics'],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    contentHash: computeContentHash(text),
    lineHashes: computeLineHashes(text),
    analysisState: { isStale: false, parseFailed: options.parseFailed ?? false },
  };
}

// ---------------------------------------------------------------------------
// Full services mock (for registerDiagnosticsHandlers, etc.)
// ---------------------------------------------------------------------------

export function createMockServices(uri: string, bridge: MockBridge, cachedEntry?: DocumentCacheEntry) {
  let entry = cachedEntry;

  return {
    services: {
      bridge,
      documentCache: {
        get(requestedUri: string) { return requestedUri === uri ? entry : undefined; },
        setPending() {},
        set(requestedUri: string, e: DocumentCacheEntry) { if (requestedUri === uri) entry = e; },
        delete() {},
      },
      typeDatabase: {
        setProgram() {},
        removeProgram() {},
        getMemoryStats() { return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 }; },
      },
      workspaceIndex: { indexDocument() {}, removeDocument() {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    } as unknown as Services,
    get cachedEntry() { return entry; },
  };
}

// ---------------------------------------------------------------------------
// Pika analyzer simulation (for scenarios)
// ---------------------------------------------------------------------------

export function pikeAnalyzer(text: string): { hasError: boolean; errorMessage?: string } {
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;
    if (/=\s*;/.test(trimmed) || (/=\s*$/.test(trimmed) && !trimmed.endsWith('{'))) {
      return { hasError: true, errorMessage: 'Syntax error: expected expression' };
    }
  }
  return { hasError: false };
}
