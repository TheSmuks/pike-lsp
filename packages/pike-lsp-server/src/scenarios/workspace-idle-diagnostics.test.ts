/**
 * Scenario: Workspace Idle Diagnostics (Issue #1113)
 *
 * Tests that workspace diagnostics manager properly schedules background
 * analysis during idle time and yields to user activity.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceDiagnosticsManager } from '../services/workspace-diagnostics.js';
import { RequestScheduler } from '../services/request-scheduler.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { CoreDiagnostic } from '../core/types.js';
import type { UninitializedVariableDiagnostic } from '@pike-lsp/pike-bridge';

interface RecordedCall {
  code: string;
  ops: string[];
  filename?: string;
}

interface SentDiagnostics {
  uri: string;
  diagnostics: CoreDiagnostic[];
}

/** Minimal mock bridge that records analyze() calls and returns configurable results. */
function createRecordingBridge(analyzeResult: Record<string, unknown> = {}): {
  analyze: (code: string, ops: string[], filename?: string) => Promise<Record<string, unknown>>;
  isRunning: () => boolean;
  analyzeCalls: RecordedCall[];
} {
  const analyzeCalls: RecordedCall[] = [];

  return {
    analyze(code: string, ops: string[], filename?: string) {
      if (filename !== undefined) {
        analyzeCalls.push({ code, ops, filename });
      } else {
        analyzeCalls.push({ code, ops });
      }
      return Promise.resolve(analyzeResult);
    },
    isRunning() {
      return true;
    },
    analyzeCalls,
  };
}

/** Minimal BridgeManager mock. */
function createMockBridgeManager(bridge: ReturnType<typeof createRecordingBridge>): BridgeManager {
  return { bridge } as unknown as BridgeManager;
}

/** Create a mock WorkspaceIndex that returns given URIs. */
function createMockWorkspaceIndex(uris: string[]): WorkspaceIndex {
  return {
    getAllDocumentUris: () => uris,
  } as unknown as WorkspaceIndex;
}

describe('Scenario: workspace idle diagnostics', () => {
  it('should initialize with default options', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = createMockWorkspaceIndex([]);
    const bridgeManager = null;
    const sent: SentDiagnostics[] = [];

    const manager = new WorkspaceDiagnosticsManager({
      scheduler,
      workspaceIndex,
      bridgeManager,
      sendDiagnostics: p => sent.push(p),
      clearDiagnostics: () => {},
    });

    const stats = manager.getStats();
    assert.strictEqual(stats.queueDepth, 0);
    assert.strictEqual(stats.processedCount, 0);
    assert.strictEqual(stats.isRunning, false);

    manager.dispose();
  });

  it('should track idle state and yield to user activity', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = createMockWorkspaceIndex([]);
    const sent: SentDiagnostics[] = [];

    const manager = new WorkspaceDiagnosticsManager({
      scheduler,
      workspaceIndex,
      bridgeManager: null,
      idleDelayMs: 100,
      sendDiagnostics: p => sent.push(p),
      clearDiagnostics: () => {},
    });

    manager.onUserActivity();

    const stats = manager.getStats();
    assert.strictEqual(stats.isRunning, false);

    manager.dispose();
  });

  it('should reset when indexing completes', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = createMockWorkspaceIndex([]);
    const sent: SentDiagnostics[] = [];

    const manager = new WorkspaceDiagnosticsManager({
      scheduler,
      workspaceIndex,
      bridgeManager: null,
      sendDiagnostics: p => sent.push(p),
      clearDiagnostics: () => {},
    });

    manager.onIndexingComplete();

    const stats = manager.getStats();
    assert.strictEqual(stats.processedCount, 0);
    assert.strictEqual(stats.queueDepth, 0);

    manager.dispose();
  });

  it('should read file content from disk and pass to analyze (Issue #1319)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'test.pike');
    const fileContent = 'int main() { return 0; }\n';

    try {
      writeFileSync(filePath, fileContent);

      const bridge = createRecordingBridge();
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const sent: SentDiagnostics[] = [];

      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      // Trigger idle processing directly
      manager.onIndexingComplete();

      // Wait for idle processing to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify analyze was called with actual file content, not empty string
      assert.ok(bridge.analyzeCalls.length > 0, 'Expected analyze() to be called at least once');

      const firstCall = bridge.analyzeCalls[0]!;
      assert.strictEqual(
        firstCall.code,
        fileContent,
        'analyze() should receive file content read from disk, not empty string'
      );
      assert.deepStrictEqual(firstCall.ops, ['parse', 'diagnostics']);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should continue processing when a file read fails (Issue #1319)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const goodFilePath = join(tempDir, 'good.pike');
    const badFilePath = join(tempDir, 'missing.pike');
    const goodContent = 'int x = 1;\n';

    try {
      writeFileSync(goodFilePath, goodContent);
      // Do NOT create badFilePath — simulates a missing file

      const bridge = createRecordingBridge();
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([goodFilePath, badFilePath]);
      const sent: SentDiagnostics[] = [];

      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      // The good file should have been analyzed despite the bad file failing
      const goodCall = bridge.analyzeCalls.find(c => c.filename === goodFilePath);
      assert.ok(goodCall, 'Good file should be analyzed despite missing file in batch');
      assert.strictEqual(goodCall!.code, goodContent);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should publish diagnostics from processBatch results (Issue #1658)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'diag.pike');
    const fileContent = 'int x = ;\n';

    try {
      writeFileSync(filePath, fileContent);

      const fakeDiagnostic: UninitializedVariableDiagnostic = {
        message: 'Expected expression',
        severity: 'warning',
        position: { line: 0, character: 8 },
        variable: 'x',
        state: 'uninitialized',
      };

      const bridge = createRecordingBridge({
        result: {
          diagnostics: {
            diagnostics: [fakeDiagnostic],
          },
        },
      });
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const sent: SentDiagnostics[] = [];

      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      assert.strictEqual(sent.length, 1, 'Should have published diagnostics for one file');
      assert.strictEqual(sent[0]!.uri, filePath);
      assert.strictEqual(sent[0]!.diagnostics.length, 1);
      assert.strictEqual(sent[0]!.diagnostics[0]!.message, 'Expected expression');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should not publish diagnostics when analyze returns empty diagnostics', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'clean.pike');
    const fileContent = 'int x = 1;\n';

    try {
      writeFileSync(filePath, fileContent);

      const bridge = createRecordingBridge({
        result: {
          diagnostics: {
            diagnostics: [],
          },
        },
      });
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const sent: SentDiagnostics[] = [];

      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: () => {},
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      assert.strictEqual(sent.length, 0, 'Should not publish when diagnostics are empty');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should clear background diagnostics on user activity (Issue #1658)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'clearable.pike');
    const fileContent = 'int x = ;\n';

    try {
      writeFileSync(filePath, fileContent);

      const fakeDiagnostic: UninitializedVariableDiagnostic = {
        message: 'Syntax error',
        severity: 'warning',
        position: { line: 0, character: 8 },
        variable: 'x',
        state: 'uninitialized',
      };

      const bridge = createRecordingBridge({
        result: {
          diagnostics: {
            diagnostics: [fakeDiagnostic],
          },
        },
      });
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const sent: SentDiagnostics[] = [];
      const clearedUris: string[] = [];

      const manager = new WorkspaceDiagnosticsManager({
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
        sendDiagnostics: p => sent.push(p),
        clearDiagnostics: uri => clearedUris.push(uri),
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      assert.strictEqual(sent.length, 1, 'Should have published diagnostics');

      // Simulate user activity — should clear published diagnostics
      manager.onUserActivity();

      assert.strictEqual(clearedUris.length, 1, 'Should have cleared diagnostics on user activity');
      assert.strictEqual(clearedUris[0], filePath);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
