/**
 * Workspace Diagnostics — processBatch retry tests — Issue #1851
 *
 * Verifies that files skipped due to bridge unavailability or individual
 * file I/O errors are pushed back into remainingUris for retry, rather
 * than being permanently marked as processed.
 */

import { describe, it, afterEach } from 'bun:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkspaceDiagnosticsManager } from '../../services/workspace-diagnostics.js';
import type { RequestScheduler } from '../../services/request-scheduler.js';
import type { WorkspaceIndex } from '../../workspace-index.js';
import type { BridgeManager } from '../../services/bridge-manager.js';

function createMockScheduler(): RequestScheduler {
  return {
    schedule: async ({ run }) => {
      await run();
    },
  } as unknown as RequestScheduler;
}

function createMockWorkspaceIndex(uris: string[]): WorkspaceIndex {
  return {
    getAllDocumentUris: () => uris,
  } as unknown as WorkspaceIndex;
}

describe('WorkspaceDiagnostics processBatch retry (#1851)', () => {
  let tmpDir: string;

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('does not mark files as processed when bridge is unavailable', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pike-test-'));
    const files = ['a.pike', 'b.pike', 'c.pike'];
    for (const f of files) {
      await fs.writeFile(path.join(tmpDir, f), 'int main() {}\n');
    }
    const testUris = files.map(f => `file://${path.join(tmpDir, f)}`);

    let sentUris: string[] = [];
    const manager = new WorkspaceDiagnosticsManager({
      scheduler: createMockScheduler(),
      workspaceIndex: createMockWorkspaceIndex(testUris),
      bridgeManager: {
        bridge: null,
      } as unknown as BridgeManager,
      idleDelayMs: 0,
      batchSize: 10,
      sendDiagnostics: params => {
        sentUris.push(params.uri);
      },
      clearDiagnostics: () => {},
    });

    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 20));

    const stats = manager.getStats();
    assert.equal(
      stats.processedCount,
      0,
      'No URIs should be marked processed when bridge is unavailable'
    );
    assert.equal(sentUris.length, 0, 'No diagnostics should be sent when bridge is unavailable');

    manager.dispose();
  });

  it('skips URIs after MAX_FAILURES (3) within a single index cycle', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pike-test-'));
    const files = ['a.pike', 'b.pike', 'c.pike'];
    for (const f of files) {
      await fs.writeFile(path.join(tmpDir, f), 'int main() {}\n');
    }
    const testUris = files.map(f => `file://${path.join(tmpDir, f)}`);

    let analyzeCount = 0;
    const bUri = testUris[1];

    const manager = new WorkspaceDiagnosticsManager({
      scheduler: createMockScheduler(),
      workspaceIndex: createMockWorkspaceIndex(testUris),
      bridgeManager: {
        bridge: {
          isRunning: () => true,
          analyze: async (_text: string, _modes: string[], uri: string) => {
            analyzeCount++;
            if (uri === bUri) {
              throw new Error('simulated permanent failure');
            }
            return { result: { diagnostics: { diagnostics: [] } } };
          },
        },
      } as unknown as BridgeManager,
      idleDelayMs: 0,
      batchSize: 1,
      sendDiagnostics: () => {},
      clearDiagnostics: () => {},
    });

    // First pass: process all 3 URIs (batchSize=1 → 3 batches in one queue run)
    // A succeeds, B fails (1st), C succeeds
    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 30));

    // B pushed to remainingUris, will retry on next idle
    // Second idle pass: B fails (2nd)
    await new Promise(r => setTimeout(r, 30));

    // Third idle pass: B fails (3rd) → permanently skipped
    await new Promise(r => setTimeout(r, 30));

    // Fourth idle pass: B should NOT be retried
    await new Promise(r => setTimeout(r, 30));

    const stats = manager.getStats();
    assert.equal(
      stats.processedCount,
      2,
      'A and C processed; B permanently skipped after 3 failures'
    );
    // B attempted 3 times (once per idle pass), A and C attempted once each
    assert.equal(analyzeCount, 5, 'B attempted exactly 3 times, A and C once each');

    manager.dispose();
  });

  it('onIndexingComplete resets failure counts so skipped URIs are retried', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pike-test-'));
    const files = ['a.pike', 'b.pike'];
    for (const f of files) {
      await fs.writeFile(path.join(tmpDir, f), 'int main() {}\n');
    }
    const testUris = files.map(f => `file://${path.join(tmpDir, f)}`);

    let analyzeCount = 0;
    const bUri = testUris[1];
    let bShouldFail = true;

    const manager = new WorkspaceDiagnosticsManager({
      scheduler: createMockScheduler(),
      workspaceIndex: createMockWorkspaceIndex(testUris),
      bridgeManager: {
        bridge: {
          isRunning: () => true,
          analyze: async (_text: string, _modes: string[], uri: string) => {
            analyzeCount++;
            if (uri === bUri && bShouldFail) {
              throw new Error('simulated failure');
            }
            return { result: { diagnostics: { diagnostics: [] } } };
          },
        },
      } as unknown as BridgeManager,
      idleDelayMs: 0,
      batchSize: 1,
      sendDiagnostics: () => {},
      clearDiagnostics: () => {},
    });

    // B fails 3 times → permanently skipped
    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 120));

    let stats = manager.getStats();
    assert.equal(stats.processedCount, 1, 'Only A processed; B skipped');

    // Re-index: B's failure count resets, now it succeeds
    bShouldFail = false;
    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 50));

    stats = manager.getStats();
    assert.equal(stats.processedCount, 2, 'Both A and B processed after re-index');

    manager.dispose();
  });

  it('marks files as processed after bridge becomes available', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pike-test-'));
    const files = ['a.pike', 'b.pike', 'c.pike'];
    for (const f of files) {
      await fs.writeFile(path.join(tmpDir, f), 'int main() {}\n');
    }
    const testUris = files.map(f => `file://${path.join(tmpDir, f)}`);

    let bridgeAvailable = false;

    const manager = new WorkspaceDiagnosticsManager({
      scheduler: createMockScheduler(),
      workspaceIndex: createMockWorkspaceIndex(testUris),
      bridgeManager: {
        get bridge() {
          return bridgeAvailable
            ? {
                isRunning: () => true,
                analyze: async () => ({ result: { diagnostics: { diagnostics: [] } } }),
              }
            : null;
        },
      } as unknown as BridgeManager,
      idleDelayMs: 0,
      batchSize: 10,
      sendDiagnostics: () => {},
      clearDiagnostics: () => {},
    });

    // First cycle: bridge unavailable
    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 20));

    assert.equal(manager.getStats().processedCount, 0, 'Nothing processed while bridge down');

    // Bridge comes back
    bridgeAvailable = true;

    // Reset and retry
    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 50));

    assert.equal(manager.getStats().processedCount, 3, 'All files processed after bridge returns');

    manager.dispose();
  });

  it('pipelined read-analyze respects concurrency limit and processes all files', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pike-test-'));
    const files = ['a.pike', 'b.pike', 'c.pike', 'd.pike', 'e.pike'];
    for (const f of files) {
      await fs.writeFile(path.join(tmpDir, f), 'int main() {}\n');
    }
    const testUris = files.map(f => `file://${path.join(tmpDir, f)}`);

    // Track max concurrent analyze invocations and which URIs completed
    let activeConcurrent = 0;
    let maxConcurrent = 0;
    const analyzedUris: string[] = [];

    const manager = new WorkspaceDiagnosticsManager({
      scheduler: createMockScheduler(),
      workspaceIndex: createMockWorkspaceIndex(testUris),
      bridgeManager: {
        bridge: {
          isRunning: () => true,
          analyze: async (_text: string, _modes: string[], uri: string) => {
            activeConcurrent++;
            if (activeConcurrent > maxConcurrent) {
              maxConcurrent = activeConcurrent;
            }
            // Simulate slow analysis so concurrency overlaps
            await new Promise(r => setTimeout(r, 50));
            analyzedUris.push(uri);
            activeConcurrent--;
            return { result: { diagnostics: { diagnostics: [] } } };
          },
        },
      } as unknown as BridgeManager,
      idleDelayMs: 0,
      batchSize: 10,
      sendDiagnostics: () => {},
      clearDiagnostics: () => {},
    });

    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 300));

    const stats = manager.getStats();
    assert.equal(stats.processedCount, 5, 'All 5 files must be processed');
    assert.ok(
      maxConcurrent <= 10,
      `Max concurrent analyze calls (${maxConcurrent}) must not exceed MAX_CONCURRENT (10)`
    );
    assert.ok(maxConcurrent > 1, `Expected concurrency > 1, got ${maxConcurrent}`);
    assert.deepEqual(
      [...analyzedUris].sort(),
      [...testUris].sort(),
      'All URIs must be analyzed'
    );

    manager.dispose();
  });
});
