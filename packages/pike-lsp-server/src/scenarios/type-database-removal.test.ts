/**
 * Scenario: typeDatabase.setProgram removal (Issue #2165)
 *
 * Verifies that removing the typeDatabase.setProgram() call from
 * cache-builder.ts does not break the diagnostics pipeline.
 *
 * Previously, setProgram stored data in a separate TypeDatabase cache
 * that had no consumers. Its removal eliminates dead code and the
 * associated failure surface (memory pressure throws).
 *
 * Since setProgram no longer exists, the "type database failure" error
 * path from TC4 is gone. These tests verify the pipeline still works
 * correctly: diagnostics publish and cache entries are written.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { registerDiagnosticsHandlers } from '../features/diagnostics/index.js';
import type { Services } from '../services/index.js';
import type { DocumentCacheEntry } from '../core/types.js';
import {
  createMockBridge,
  createMockDocuments,
  makeCachedEntry,
  type FaultInjectableMockBridge,
} from '../tests/helpers/test-helpers.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 10
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start >= timeoutMs) {
      throw new Error('Timed out waiting for scenario to settle');
    }
    await wait(intervalMs);
  }
}

function createHarness(bridge: FaultInjectableMockBridge) {
  const docs = createMockDocuments();
  const cache = new Map<string, DocumentCacheEntry>();
  const diagnostics: Array<{ uri: string; version?: number; diagnostics: unknown[] }> = [];

  const connection = {
    sendDiagnostics(params: { uri: string; version?: number; diagnostics: unknown[] }) {
      diagnostics.push(params);
    },
    onRequest() {},
    onDidChangeConfiguration() {},
    onDidChangeTextDocument() {},
    console: {
      log() {},
      warn() {},
      error() {},
    },
  };

  const services = {
    bridge,
    documentCache: {
      get(uri: string) {
        return cache.get(uri);
      },
      set(uri: string, entry: DocumentCacheEntry) {
        cache.set(uri, entry);
      },
      setPending(_uri: string, promise: Promise<void>) {
        promise.catch(() => {});
      },
      waitFor: async () => {},
      delete(uri: string) {
        cache.delete(uri);
      },
      keys() {
        return cache.keys();
      },
    },
    typeDatabase: {
      removeProgram() {},
      getMemoryStats() {
        return { programCount: 0, symbolCount: 0, totalBytes: 0, utilizationPercent: 0 };
      },
    },
    workspaceIndex: {
      indexDocument() {},
      removeDocument() {},
      getAllDocumentUris() {
        return [...cache.keys()];
      },
    },
    includeResolver: null,
    globalSettings: { pikePath: 'pike', maxNumberOfProblems: 100, diagnosticDelay: 10 },
    documentSnapshots: new Map<string, string>(),
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  };

  registerDiagnosticsHandlers(
    connection as unknown as Connection,
    services as unknown as Services,
    docs as unknown as TextDocuments<TextDocument>
  );

  return { docs, cache, diagnostics };
}

describe('typeDatabase.setProgram removal (Issue #2165)', () => {
  it('GIVEN a working bridge WHEN document opens THEN diagnostics publish without setProgram', async () => {
    const uri = 'file:///test-tdb-removal.pike';
    const seededEntry = makeCachedEntry('int stable = 1;\n');
    seededEntry.version = 1;

    const bridge = createMockBridge() as FaultInjectableMockBridge;
    const harness = createHarness(bridge);

    const doc = TextDocument.create(uri, 'pike', 2, 'int now = 2;\n');
    harness.docs.emitOpen(doc);

    // Wait for the diagnostics pipeline to process the document change.
    await waitForCondition(() => harness.diagnostics.length > 0, 3000);

    // Diagnostics must have been published.
    assert.ok(
      harness.diagnostics.length > 0,
      'Expected diagnostics to be published after document open'
    );

    // The published diagnostics must reference the correct URI.
    const published = harness.diagnostics.find(d => d.uri === uri);
    assert.ok(published, `Expected diagnostics for ${uri}`);

    // Cache entry must exist for the new version.
    const cached = harness.cache.get(uri);
    assert.ok(cached, `Expected cache entry for ${uri}`);
    assert.equal(cached!.version, 2, 'Cache entry should have the new document version');
  });

  it('GIVEN a seeded cache WHEN document changes THEN cache updates even without setProgram', async () => {
    const uri = 'file:///test-tdb-cache-update.pike';
    const seededEntry = makeCachedEntry('int old = 1;\n');
    seededEntry.version = 3;

    const bridge = createMockBridge() as FaultInjectableMockBridge;
    const harness = createHarness(bridge);
    harness.cache.set(uri, seededEntry);

    const doc = TextDocument.create(uri, 'pike', 4, 'int updated = 2;\n');
    harness.docs.emitOpen(doc);

    // Wait for the pipeline to process.
    await waitForCondition(() => harness.diagnostics.length > 0, 3000);

    // Cache should have been updated to the new version.
    const cached = harness.cache.get(uri);
    assert.ok(cached, `Expected cache entry for ${uri}`);
    assert.equal(cached!.version, 4, 'Cache entry should reflect the latest document version');
  });
});
