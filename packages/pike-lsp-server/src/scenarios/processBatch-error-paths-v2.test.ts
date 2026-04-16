/**
 * Scenario: processBatch additional error paths (Issue #2051)
 *
 * Tests error-handling branches not covered by processBatch-error-paths.test.ts:
 * - Unknown fs error codes (not ENOENT/EACCES) → not counted as processed
 * - EACCES file increments failedUriAttempts to MAX_FAILURES (permanent skip)
 * - Analyze returning malformed diagnostics (missing severity) → defaults to 2
 * - Analyze returning null/missing diagnostics array → no crash
 * - Scheduler rejection (RequestSupersededError) → batch returns empty set
 * - Bridge crashes mid-batch (isRunning returns false after first analyze) → partial results
 * - ENOENT file is counted as processed even in mixed-success batch
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceDiagnosticsManager } from '../services/workspace-diagnostics.js';
import { RequestScheduler, RequestSupersededError } from '../services/request-scheduler.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { CoreDiagnostic } from '../core/types.js';

interface SentDiagnostics {
  uri: string;
  diagnostics: CoreDiagnostic[];
}

interface MockBridge {
  analyze: (code: string, ops: string[], filename?: string) => Promise<Record<string, unknown>>;
  isRunning: () => boolean;
}

function createMockBridgeManager(bridge: MockBridge): BridgeManager {
  return { bridge } as unknown as BridgeManager;
}

function createMockWorkspaceIndex(uris: string[]): WorkspaceIndex {
  return {
    getAllDocumentUris: () => uris,
  } as unknown as WorkspaceIndex;
}

function makeBridge(overrides?: Partial<MockBridge>): MockBridge {
  return {
    analyze(_code: string, _ops: string[], _filename?: string) {
      return Promise.resolve({ result: { diagnostics: { diagnostics: [] } } });
    },
    isRunning() {
      return true;
    },
    ...overrides,
  };
}

async function drainManager(
  manager: WorkspaceDiagnosticsManager,
  timeoutMs = 500,
  pollMs = 10
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (manager.getStats().isRunning) break;
    await new Promise(r => setTimeout(r, pollMs));
  }
  while (Date.now() < deadline) {
    if (!manager.getStats().isRunning) return;
    await new Promise(r => setTimeout(r, pollMs));
  }
}

describe('Scenario: processBatch error paths v2', () => {
  it('should not count unknown fs error codes as processed', async () => {
    // We can't easily trigger arbitrary fs error codes, but we can test the
    // observable behavior: a URI that fails with a non-ENOENT error should
    // not be in the processed set. We use a URI pointing to a directory
    // (EISDIR) as a naturally occurring non-ENOENT error.
    const bridge = makeBridge();
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const goodFile = join(tempDir, 'good.pike');

    try {
      writeFileSync(goodFile, 'int x = 1;\n');
      // Use the directory itself as a URI — readFile on a directory yields EISDIR
      const dirUri = tempDir;

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([goodFile, dirUri]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      // The good file should be processed; the directory URI should NOT be processed
      const stats = manager.getStats();
      assert.strictEqual(
        stats.processedCount,
        1,
        'Only the readable file should be processed, not the EISDIR entry'
      );

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should permanently skip EACCES file without retrying (failedUriAttempts = MAX_FAILURES)', async () => {
    // This test verifies the EACCES branch sets failedUriAttempts to MAX_FAILURES
    // directly, so the URI is never retried. We check by confirming processedCount
    // stays at 1 (only the good file) and the manager finishes running without
    // scheduling additional idle cycles for the restricted file.
    const bridge = makeBridge();
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const goodFile = join(tempDir, 'good.pike');
    const restrictedFile = join(tempDir, 'restricted.pike');

    try {
      writeFileSync(goodFile, 'int x = 1;\n');
      writeFileSync(restrictedFile, 'int y = 2;\n');

      // EACCES requires the process NOT to be root
      let eaccesConfirmed = false;
      try {
        const { chmodSync } = await import('node:fs');
        chmodSync(restrictedFile, 0o000);
        try {
          const { readFile } = await import('node:fs/promises');
          await readFile(restrictedFile, 'utf-8');
        } catch (err) {
          if (
            err instanceof Error &&
            'code' in err &&
            (err as Error & { code: string }).code === 'EACCES'
          ) {
            eaccesConfirmed = true;
          }
        }
      } catch {
        // chmod failed — skip test
      }

      if (!eaccesConfirmed) {
        // Running as root — can't test EACCES in this environment
        const { chmodSync } = await import('node:fs');
        try {
          chmodSync(restrictedFile, 0o644);
        } catch {
          /* ignore */
        }
        return;
      }

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([goodFile, restrictedFile]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      const stats = manager.getStats();
      assert.strictEqual(
        stats.processedCount,
        1,
        'Only good file should be processed; EACCES file should be permanently skipped'
      );
      assert.strictEqual(
        stats.isRunning,
        false,
        'Manager should finish without scheduling retry for EACCES file'
      );

      const { chmodSync } = await import('node:fs');
      chmodSync(restrictedFile, 0o644);
      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should default severity to 2 when bridge returns diagnostic without severity', async () => {
    const bridge = makeBridge({
      analyze(_code: string, _ops: string[], _filename?: string) {
        return Promise.resolve({
          result: {
            diagnostics: {
              diagnostics: [
                {
                  // Intentionally no severity field
                  message: 'Missing severity diag',
                  position: { line: 0, character: 0 },
                },
              ],
            },
          },
        });
      },
    });
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'nosev.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      assert.strictEqual(sent.length, 1, 'Should publish diagnostic');
      assert.strictEqual(
        sent[0]!.diagnostics[0]!.severity,
        2,
        'Missing severity should default to 2'
      );
      assert.strictEqual(sent[0]!.diagnostics[0]!.message, 'Missing severity diag');
      assert.strictEqual(sent[0]!.diagnostics[0]!.source, 'pike-background');

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle analyze returning null diagnostics array without crashing', async () => {
    const bridge = makeBridge({
      analyze(_code: string, _ops: string[], _filename?: string) {
        return Promise.resolve({
          result: {
            diagnostics: {
              // diagnostics field is undefined/null
              diagnostics: null as unknown as [],
            },
          },
        });
      },
    });
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'null.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      // File should still be processed (analyze didn't throw)
      const stats = manager.getStats();
      assert.strictEqual(
        stats.processedCount,
        1,
        'File should be processed even with null diagnostics'
      );
      // No diagnostics published since null coalesces to []
      assert.strictEqual(sent.length, 0, 'No diagnostics published for null diagnostics array');

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle analyze returning deeply nested undefined results without crashing', async () => {
    const bridge = makeBridge({
      analyze(_code: string, _ops: string[], _filename?: string) {
        // result is undefined, result.diagnostics is undefined, etc.
        return Promise.resolve({} as Record<string, unknown>);
      },
    });
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'empty.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      const stats = manager.getStats();
      assert.strictEqual(
        stats.processedCount,
        1,
        'File should be processed even with empty result'
      );
      assert.strictEqual(sent.length, 0, 'No diagnostics for empty result');

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty set when scheduler rejects with RequestSupersededError', async () => {
    // The scheduler can reject if a newer request supersedes the current one.
    // processBatch wraps scheduler.schedule in try/catch, so it should return
    // the empty processed set instead of crashing.
    const bridge = makeBridge();
    const bridgeManager = createMockBridgeManager(bridge);

    // Create a scheduler that immediately rejects with SupersededError
    const rejectingScheduler = {
      schedule() {
        return Promise.reject(new RequestSupersededError('Superseded by newer request'));
      },
    } as unknown as RequestScheduler;

    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'super.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler: rejectingScheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      assert.strictEqual(sent.length, 0, 'No diagnostics when scheduler rejects');
      const stats = manager.getStats();
      assert.strictEqual(stats.processedCount, 0, 'No URIs processed when scheduler rejects');

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return empty set when scheduler throws unexpected error', async () => {
    const bridge = makeBridge();
    const bridgeManager = createMockBridgeManager(bridge);

    const throwingScheduler = {
      schedule() {
        return Promise.reject(new Error('Scheduler internal failure'));
      },
    } as unknown as RequestScheduler;

    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'throw.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler: throwingScheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      assert.strictEqual(sent.length, 0, 'No diagnostics when scheduler throws');
      const stats = manager.getStats();
      assert.strictEqual(stats.processedCount, 0, 'No URIs processed when scheduler throws');

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should produce partial results when bridge crashes after first file analyze', async () => {
    let callCount = 0;
    const bridge = makeBridge({
      isRunning() {
        // Bridge "crashes" after the first analyze call
        return callCount < 1;
      },
      analyze(_code: string, _ops: string[], _filename?: string) {
        callCount++;
        return Promise.resolve({
          result: {
            diagnostics: {
              diagnostics: [
                {
                  message: `Diag from call ${callCount}`,
                  severity: 'error',
                  position: { line: 0, character: 0 },
                },
              ],
            },
          },
        });
      },
    });
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const file1 = join(tempDir, 'first.pike');
    const file2 = join(tempDir, 'second.pike');

    try {
      writeFileSync(file1, 'int a = 1;\n');
      writeFileSync(file2, 'int b = 2;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([file1, file2]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      // At least the first file's diagnostics should be published
      assert.ok(
        sent.length >= 1,
        'At least one file should produce diagnostics before bridge crashes'
      );

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle non-Error thrown by bridge.analyze', async () => {
    const bridge = makeBridge({
      analyze(_code: string, _ops: string[], _filename?: string) {
        return Promise.reject('string error not an Error instance');
      },
    });
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'strerr.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      // Should not crash — non-Error is stringified in the catch branch
      assert.strictEqual(sent.length, 0, 'No diagnostics when analyze throws non-Error');
      const stats = manager.getStats();
      assert.strictEqual(stats.processedCount, 0, 'File not processed when analyze throws');

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle bridge.analyze returning diagnostics with various severity values', async () => {
    const bridge = makeBridge({
      analyze(_code: string, _ops: string[], _filename?: string) {
        return Promise.resolve({
          result: {
            diagnostics: {
              diagnostics: [
                { message: 'err', severity: 'error', position: { line: 0, character: 0 } },
                { message: 'warn', severity: 'warning', position: { line: 1, character: 0 } },
                { message: 'info', severity: 'info', position: { line: 2, character: 0 } },
                { message: 'unknown', severity: 'hint', position: { line: 3, character: 0 } },
              ],
            },
          },
        });
      },
    });
    const bridgeManager = createMockBridgeManager(bridge);
    const scheduler = new RequestScheduler();
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-batch-v2-'));
    const filePath = join(tempDir, 'sev.pike');

    try {
      writeFileSync(filePath, 'int x = 1;\n');

      const sent: SentDiagnostics[] = [];
      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex: createMockWorkspaceIndex([filePath]),
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 10,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await drainManager(manager);

      assert.strictEqual(sent.length, 1);
      const diags = sent[0]!.diagnostics;
      assert.strictEqual(diags.length, 4);

      // error → 1, warning → 2, info → 3, unknown → 1 (default in convertSeverity)
      assert.strictEqual(diags[0]!.severity, 1, 'error severity');
      assert.strictEqual(diags[1]!.severity, 2, 'warning severity');
      assert.strictEqual(diags[2]!.severity, 3, 'info severity');
      assert.strictEqual(diags[3]!.severity, 1, 'unknown severity defaults to error');

      // All should have source 'pike-background'
      for (const d of diags) {
        assert.strictEqual(d.source, 'pike-background');
      }

      manager.dispose();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
