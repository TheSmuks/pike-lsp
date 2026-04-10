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

import type { Logger } from '@pike-lsp/core';

import { TextDocument } from 'vscode-languageserver-textdocument';
import type { Services } from '../../services/index.js';
import type { DocumentCacheEntry } from '../../core/types.js';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';
import {
  MockBridge as BaseMockBridge,
  FaultInjectableMockBridge,
  type FaultInjectionConfig,
  type MockBridgeConfig,
} from './mock-bridge.js';

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

export interface MockDocumentHooks {
  onEvent?: (event: {
    type: 'open' | 'save' | 'change' | 'close';
    uri: string;
    version: number;
  }) => void;
}

export function createMockDocuments(hooks: MockDocumentHooks = {}): MockDocuments {
  let openHandler: OpenHandler | undefined;
  let saveHandler: SaveHandler | undefined;
  let changeHandler: ChangeHandler | undefined;
  let closeHandler: CloseHandler | undefined;
  const docs = new Map<string, TextDocument>();

  return {
    get(uri: string) {
      return docs.get(uri);
    },
    all() {
      return [...docs.values()];
    },
    onDidOpen(handler: OpenHandler) {
      openHandler = handler;
    },
    onDidSave(handler: SaveHandler) {
      saveHandler = handler;
    },
    onDidChangeContent(handler: ChangeHandler) {
      changeHandler = handler;
    },
    onDidClose(handler: CloseHandler) {
      closeHandler = handler;
    },
    emitOpen(document: TextDocument) {
      docs.set(document.uri, document);
      openHandler?.({ document });
      hooks.onEvent?.({ type: 'open', uri: document.uri, version: document.version });
    },
    emitSave(document: TextDocument) {
      docs.set(document.uri, document);
      saveHandler?.({ document });
      hooks.onEvent?.({ type: 'save', uri: document.uri, version: document.version });
    },
    emitChange(document: TextDocument) {
      docs.set(document.uri, document);
      changeHandler?.({ document });
      hooks.onEvent?.({ type: 'change', uri: document.uri, version: document.version });
    },
    emitClose(document: TextDocument) {
      docs.delete(document.uri);
      closeHandler?.({ document });
      hooks.onEvent?.({ type: 'close', uri: document.uri, version: document.version });
    },
  };
}

// ---------------------------------------------------------------------------
// Bridge mock
// ---------------------------------------------------------------------------

export type MockBridge = BaseMockBridge;
export type { MockBridgeConfig, FaultInjectionConfig, FaultInjectableMockBridge };

export function createMockBridge(
  config: MockBridgeConfig & { faultInjection?: FaultInjectionConfig } = {}
): MockBridge | FaultInjectableMockBridge {
  const { faultInjection, ...baseConfig } = config;
  if (faultInjection) {
    return new FaultInjectableMockBridge(baseConfig, faultInjection);
  }
  return new BaseMockBridge(baseConfig);
}

// ---------------------------------------------------------------------------
// Connection mock
// ---------------------------------------------------------------------------

export interface MockConnection {
  sendDiagnostics(params: { uri: string; diagnostics: unknown[] }): void;
  onDidChangeConfiguration(handler: (params: { settings: Record<string, unknown> }) => void): void;
  onDidChangeTextDocument(
    handler: (params: {
      textDocument: { uri: string; version: number };
      contentChanges: unknown[];
    }) => void
  ): void;
  console: { log(): void; warn(): void; error(): void };
}

export function createMockConnection(): MockConnection & { diagnosticsPublished: unknown[] } {
  const diagnosticsPublished: unknown[] = [];

  return {
    diagnosticsPublished,
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }) {
      diagnosticsPublished.push(params);
    },
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

export function createMockServices(
  uri: string,
  bridge: MockBridge,
  cachedEntry?: DocumentCacheEntry
) {
  let entry = cachedEntry;

  return {
    services: {
      bridge,
      documentCache: {
        get(requestedUri: string) {
          return requestedUri === uri ? entry : undefined;
        },
        setPending() {},
        set(requestedUri: string, e: DocumentCacheEntry) {
          if (requestedUri === uri) entry = e;
        },
        delete() {},
      },
      typeDatabase: {
        setProgram() {},
        removeProgram() {},
        getMemoryStats() {
          return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
        },
      },
      workspaceIndex: { indexDocument() {}, removeDocument() {} },
      includeResolver: null,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    } as unknown as Services,
    get cachedEntry() {
      return entry;
    },
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


// ---------------------------------------------------------------------------
// Logger mock
// ---------------------------------------------------------------------------

/**
 * Create a mock Logger for tests.
 * Optionally captures calls by level for assertion.
 */
export function createMockLogger(options?: { captureInfos?: boolean }): Logger & { infos?: unknown[][] } {
  if (options?.captureInfos) {
    const infos: unknown[][] = [];
    return {
      info: (...args: unknown[]) => infos.push(args),
      debug: () => {},
      warn: () => {},
      error: () => {},
      infos,
    } as unknown as Logger & { infos: unknown[][] };
  }
  return {
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  } as unknown as Logger;
}