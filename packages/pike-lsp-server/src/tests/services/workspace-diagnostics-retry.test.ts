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

  it('marks only successfully analyzed files as processed, retries failed ones', async () => {
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
            // B fails on first attempt only (transient failure)
            if (uri === bUri && analyzeCount <= 3) {
              throw new Error('simulated analysis failure');
            }
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
    await new Promise(r => setTimeout(r, 50));

    // A and C succeeded, B failed → processedCount should be 2
    let stats = manager.getStats();
    assert.equal(
      stats.processedCount,
      2,
      'Only A and C should be marked processed after first pass; B should be retried'
    );

    // onIndexingComplete resets processedUris and re-populates remainingUris
    // so the retry cycle can pick up B (which now succeeds because analyzeCount > 3)
    manager.onIndexingComplete();
    await new Promise(r => setTimeout(r, 50));

    stats = manager.getStats();
    assert.equal(stats.processedCount, 3, 'All URIs should be processed after retry cycle');

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
});
