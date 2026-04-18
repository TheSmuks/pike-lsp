/**
 * Debounced Validation Race Condition Tests
 *
 * Tests the public contract of createDebouncedValidation:
 * - Timer replacement on rapid edits
 * - Stale version rejection
 * - Document deletion between schedule and fire
 * - Skip-path republishes cached diagnostics
 * - Full validation path through RequestScheduler
 * - Multiple-changes batch classification
 * - RequestSupersededError handling
 * - Timer map cleanup
 */

import { describe, it, beforeEach } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createDebouncedValidation } from '../debounced-validation.js';
import type { DebouncedValidationDeps } from '../debounced-validation.js';
import { RequestScheduler } from '../../../services/request-scheduler.js';
import type { DocumentCacheEntry } from '../../../../core/types.js';
import { computeContentHash } from '../../../services/document-cache.js';

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const URI = 'file:///test.pike';
const DOC_TEXT = 'int x = 1;\n';

function createTextDocument(uri: string, version: number, text: string): TextDocument {
  return TextDocument.create(uri, 'pike', version, text);
}

interface ValidationCall {
  document: TextDocument;
  classification: unknown;
  analysisMode: string;
}

interface SentDiagnostics {
  uri: string;
  version: number;
  diagnostics: unknown[];
}

interface TestHarness {
  deps: DebouncedValidationDeps;
  sentDiagnostics: SentDiagnostics[];
  validationCalls: ValidationCall[];
  liveDocuments: Map<string, TextDocument>;
  cacheEntries: Map<string, DocumentCacheEntry>;
  validationTimers: Map<string, ReturnType<typeof setTimeout>>;
  validationVersions: Map<string, number>;
  pendingChangeStates: Map<string, { hasMultipleChanges: boolean; range: unknown }>;
  logCalls: Array<{ level: string; args: unknown[] }>;
}

function setupDeps(diagnosticDelay = 0): TestHarness {
  const sentDiagnostics: SentDiagnostics[] = [];
  const validationCalls: ValidationCall[] = [];
  const liveDocuments = new Map<string, TextDocument>();
  const cacheEntries = new Map<string, DocumentCacheEntry>();
  const validationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const validationVersions = new Map<string, number>();
  const pendingChangeStates = new Map<string, { hasMultipleChanges: boolean; range: unknown }>();
  const logCalls: Array<{ level: string; args: unknown[] }> = [];

  const deps: DebouncedValidationDeps = {
    connection: {
      sendDiagnostics(params: unknown) {
        const p = params as SentDiagnostics;
        sentDiagnostics.push(p);
      },
    } as DebouncedValidationDeps['connection'],
    documents: {
      get(uri: string) {
        return liveDocuments.get(uri);
      },
    },
    services: {
      documentCache: {
        get(uri: string) {
          return cacheEntries.get(uri);
        },
        setPending() {},
      },
      globalSettings: { diagnosticDelay } as DebouncedValidationDeps['services']['globalSettings'],
    } as DebouncedValidationDeps['services'],
    validationTimers,
    validationVersions,
    pendingChangeStates: pendingChangeStates as DebouncedValidationDeps['pendingChangeStates'],
    diagnosticsScheduler: new RequestScheduler({ maxConcurrent: 4 }),
    async validateDocument(document, classification, _shouldContinue, analysisMode) {
      validationCalls.push({
        document,
        classification,
        analysisMode: analysisMode ?? 'unknown',
      });
    },
    log: {
      error(...args: unknown[]) {
        logCalls.push({ level: 'error', args });
      },
      debug() {},
      info() {},
      warn() {},
    } as DebouncedValidationDeps['log'],
  };

  return {
    deps,
    sentDiagnostics,
    validationCalls,
    liveDocuments,
    cacheEntries,
    validationTimers,
    validationVersions,
    pendingChangeStates,
    logCalls,
  };
}

function makeCacheEntry(overrides: Partial<DocumentCacheEntry> = {}): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: [
      {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Warning on line 1',
        severity: 2,
      },
    ],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    ...overrides,
  };
}

describe('createDebouncedValidation', () => {
  let harness: TestHarness;
  let validateDocumentDebounced: (document: TextDocument) => void;

  beforeEach(() => {
    harness = setupDeps(0);
    const result = createDebouncedValidation(harness.deps);
    validateDocumentDebounced = result.validateDocumentDebounced;
  });

  // --- Scenario 1: Rapid-fire edits cancel previous timers ---

  describe('rapid-fire edits', () => {
    it('should only validate the last version when multiple edits occur within the debounce window', async () => {
      const harness = setupDeps(10);
      const { validateDocumentDebounced } = createDebouncedValidation(harness.deps);

      // Fire 5 rapid calls with increasing versions
      for (let v = 1; v <= 5; v++) {
        const doc = createTextDocument(URI, v, DOC_TEXT);
        harness.liveDocuments.set(URI, doc);
        validateDocumentDebounced(doc);
      }

      // Only one timer should exist — the last one
      assert.strictEqual(harness.validationTimers.size, 1, 'Only the last timer should remain');
      assert.strictEqual(harness.validationVersions.get(URI), 5, 'Expected version should be 5');

      // Wait for the debounce timer to fire
      await wait(30);

      // classifyChange will return canSkip:false (no cache), so full validation proceeds
      // But validateDocument is async through the scheduler — wait for it
      await wait(20);

      assert.strictEqual(harness.validationCalls.length, 1, 'Exactly one validation should run');
      assert.strictEqual(
        harness.validationCalls[0].document.version,
        5,
        'Validation should be for the last version'
      );
      assert.strictEqual(
        harness.validationCalls[0].analysisMode,
        'typing',
        'Analysis mode should be typing'
      );
    });
  });

  // --- Scenario 2: Version conflict rejects stale result ---

  describe('stale version rejection', () => {
    it('should skip validation when live document version changed between schedule and fire', async () => {
      const harness = setupDeps(10);
      const { validateDocumentDebounced } = createDebouncedValidation(harness.deps);

      // Schedule with version 3
      const doc = createTextDocument(URI, 3, DOC_TEXT);
      harness.liveDocuments.set(URI, doc);
      validateDocumentDebounced(doc);

      assert.strictEqual(harness.validationVersions.get(URI), 3, 'Expected version set to 3');

      // Before timer fires, update to version 4
      harness.liveDocuments.set(URI, createTextDocument(URI, 4, DOC_TEXT + 'int y = 2;\n'));

      // Wait for timer to fire
      await wait(30);
      await wait(20);

      // No validation should have run — version mismatch
      assert.strictEqual(
        harness.validationCalls.length,
        0,
        'No validation should run for stale version'
      );
      assert.strictEqual(harness.sentDiagnostics.length, 0, 'No diagnostics should be published');

      // Version map should be cleaned up
      assert.strictEqual(
        harness.validationVersions.get(URI),
        undefined,
        'Version entry should be deleted'
      );
      assert.strictEqual(
        harness.pendingChangeStates.get(URI),
        undefined,
        'Pending change state should be deleted'
      );
    });
  });

  // --- Scenario 3: Document deleted between schedule and fire ---

  describe('document deleted before timer fires', () => {
    it('should silently skip when document is closed before timer fires', async () => {
      const harness = setupDeps(10);
      const { validateDocumentDebounced } = createDebouncedValidation(harness.deps);

      const doc = createTextDocument(URI, 2, DOC_TEXT);
      harness.liveDocuments.set(URI, doc);
      validateDocumentDebounced(doc);

      // Delete the document before timer fires
      harness.liveDocuments.delete(URI);

      await wait(30);
      await wait(20);

      assert.strictEqual(harness.validationCalls.length, 0, 'No validation should run');
      assert.strictEqual(harness.sentDiagnostics.length, 0, 'No diagnostics should be published');
      assert.strictEqual(
        harness.validationVersions.get(URI),
        undefined,
        'Version entry cleaned up'
      );
      assert.strictEqual(
        harness.pendingChangeStates.get(URI),
        undefined,
        'Pending change state cleaned up'
      );
    });
  });

  // --- Scenario 4: Skip-path republishes cached diagnostics ---

  describe('skip-path with cached diagnostics', () => {
    it('should republish cached diagnostics when content is unchanged', async () => {
      // Compute the content hash for our document text so the cache matches
      const contentHash = computeContentHash(DOC_TEXT);

      const cachedDiag = {
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        message: 'Existing warning',
        severity: 2,
      };
      const cacheEntry = makeCacheEntry({
        version: 1,
        diagnostics: [cachedDiag],
        contentHash,
      });

      const doc = createTextDocument(URI, 1, DOC_TEXT);
      harness.liveDocuments.set(URI, doc);
      harness.cacheEntries.set(URI, cacheEntry);

      // No pendingChangeState means changeRange will be undefined
      // classifyChange will compare contentHash and find it unchanged → canSkip:true
      validateDocumentDebounced(doc);

      await wait(20);

      assert.strictEqual(
        harness.validationCalls.length,
        0,
        'validateDocument should not be called'
      );
      assert.strictEqual(harness.sentDiagnostics.length, 1, 'Diagnostics should be republished');
      assert.strictEqual(harness.sentDiagnostics[0].uri, URI, 'URI should match');
      assert.strictEqual(harness.sentDiagnostics[0].version, 1, 'Version should match');
      assert.strictEqual(
        harness.pendingChangeStates.get(URI),
        undefined,
        'Pending change state should be cleaned up'
      );
      assert.strictEqual(
        harness.validationVersions.get(URI),
        undefined,
        'Version entry should be cleaned up'
      );
    });
  });

  // --- Scenario 5: Full validation path ---

  describe('full validation path', () => {
    it('should call validateDocument with the live document through the scheduler', async () => {
      const doc = createTextDocument(URI, 1, DOC_TEXT);
      harness.liveDocuments.set(URI, doc);
      // No cache entry → classifyChange returns canSkip: false (reason: 'no_cache')

      validateDocumentDebounced(doc);

      await wait(30);

      assert.strictEqual(
        harness.validationCalls.length,
        1,
        'validateDocument should be called once'
      );
      assert.strictEqual(
        harness.validationCalls[0].document.version,
        1,
        'Document version should be 1'
      );
      assert.strictEqual(
        harness.validationCalls[0].analysisMode,
        'typing',
        'Analysis mode should be typing'
      );

      // Classification should indicate no-cache
      const classification = harness.validationCalls[0].classification as {
        canSkip: boolean;
        reason: string;
      };
      assert.strictEqual(classification.canSkip, false, 'Should not skip');
      assert.strictEqual(classification.reason, 'no_cache', 'Reason should be no_cache');
    });
  });

  // --- Scenario 6: Multiple changes batched ---

  describe('multiple changes batched', () => {
    it('should force full validation when hasMultipleChanges is true', async () => {
      const cacheEntry = makeCacheEntry();
      const doc = createTextDocument(URI, 2, DOC_TEXT);
      harness.liveDocuments.set(URI, doc);
      harness.cacheEntries.set(URI, cacheEntry);

      // Set multiple changes flag — this bypasses classifyChange entirely
      harness.pendingChangeStates.set(URI, {
        hasMultipleChanges: true,
        range: undefined,
      });

      validateDocumentDebounced(doc);

      await wait(30);

      assert.strictEqual(harness.validationCalls.length, 1, 'validateDocument should be called');

      const classification = harness.validationCalls[0].classification as {
        canSkip: boolean;
        reason: string;
      };
      assert.strictEqual(classification.canSkip, false, 'Should not skip');
      assert.strictEqual(
        classification.reason,
        'multiple_change_batch',
        'Reason should be multiple_change_batch'
      );
    });
  });

  // --- Scenario 7: RequestSupersededError handling ---

  describe('RequestSupersededError handling', () => {
    it('should swallow RequestSupersededError and clean up via finally', async () => {
      let resolveValidation: () => void;
      let validationStarted = false;

      const harness = setupDeps(0);
      harness.deps.validateDocument = async () => {
        validationStarted = true;
        // Hang until resolved externally
        await new Promise<void>(resolve => {
          resolveValidation = resolve;
        });
      };

      const { validateDocumentDebounced } = createDebouncedValidation(harness.deps);

      const doc1 = createTextDocument(URI, 1, DOC_TEXT);
      harness.liveDocuments.set(URI, doc1);
      validateDocumentDebounced(doc1);

      await wait(20); // Let timer fire and scheduler start the task
      assert.ok(validationStarted, 'First validation should have started');

      // Now schedule a second debounce — this will set a new timer
      const doc2 = createTextDocument(URI, 2, DOC_TEXT);
      harness.liveDocuments.set(URI, doc2);
      validateDocumentDebounced(doc2);

      await wait(20); // Let second timer fire

      // The scheduler should have cancelled the first request.
      // Resolve the first validation so its promise settles.
      resolveValidation!();

      // Wait for all promises to settle
      await wait(20);

      // The RequestSupersededError from the first request should NOT be logged
      const supersededErrors = harness.logCalls.filter(
        c => c.level === 'error' && String(c.args[0]).includes('Debounced validation failed')
      );
      assert.strictEqual(
        supersededErrors.length,
        0,
        'RequestSupersededError should be swallowed, not logged'
      );
    });
  });

  // --- Scenario 8: Timer map cleanup ---

  describe('timer map cleanup', () => {
    it('should remove the timer entry when the timer fires', async () => {
      const doc = createTextDocument(URI, 1, DOC_TEXT);
      harness.liveDocuments.set(URI, doc);

      validateDocumentDebounced(doc);

      assert.ok(harness.validationTimers.has(URI), 'Timer should be set before firing');

      await wait(30);

      assert.strictEqual(
        harness.validationTimers.has(URI),
        false,
        'Timer entry should be deleted after firing'
      );
    });
  });
});
