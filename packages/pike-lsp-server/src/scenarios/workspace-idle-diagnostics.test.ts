/**
 * Scenario: Workspace Idle Diagnostics (Issue #1113)
 *
 * Tests that workspace diagnostics manager properly schedules background
 * analysis during idle time, publishes diagnostics, and yields to user activity.
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

/** Minimal mock bridge that records analyze() calls and returns configurable results. */
function createRecordingBridge(resultOverrides?: Record<string, unknown>) {
  const analyzeCalls: Array<{ code: string; ops: string[]; filename?: string }> = [];

  return {
    analyze(code: string, ops: string[], filename?: string) {
      if (filename !== undefined) {
        analyzeCalls.push({ code, ops, filename });
      } else {
        analyzeCalls.push({ code, ops });
      }
      return Promise.resolve({ result: resultOverrides });
    },
    isRunning() {
      return true;
    },
    analyzeCalls,
  };
}

/** Minimal mock connection that records sendDiagnostics calls. */
function createMockConnection() {
  const sent: Array<{ uri: string; diagnostics: unknown[] }> = [];

  return {
    sendDiagnostics(params: { uri: string; diagnostics: unknown[] }) {
      sent.push({ uri: params.uri, diagnostics: params.diagnostics });
    },
    sent,
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
    const connection = createMockConnection();

    const manager = new WorkspaceDiagnosticsManager({
      connection: connection as never,
      scheduler,
      workspaceIndex,
      bridgeManager,
    });

    const stats = manager.getStats();
    assert.strictEqual(stats.queueDepth, 0);
    assert.strictEqual(stats.processedCount, 0);
    assert.strictEqual(stats.publishedDiagnosticCount, 0);
    assert.strictEqual(stats.isRunning, false);

    manager.dispose();
  });

  it('should track idle state and yield to user activity', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = createMockWorkspaceIndex([]);
    const connection = createMockConnection();

    const manager = new WorkspaceDiagnosticsManager({
      connection: connection as never,
      scheduler,
      workspaceIndex,
      bridgeManager: null,
      idleDelayMs: 100,
    });

    manager.onUserActivity();

    const stats = manager.getStats();
    assert.strictEqual(stats.isRunning, false);

    manager.dispose();
  });

  it('should reset when indexing completes', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = createMockWorkspaceIndex([]);
    const connection = createMockConnection();

    const manager = new WorkspaceDiagnosticsManager({
      connection: connection as never,
      scheduler,
      workspaceIndex,
      bridgeManager: null,
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
      const connection = createMockConnection();

      const manager = new WorkspaceDiagnosticsManager({
        connection: connection as never,
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
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
      const connection = createMockConnection();

      const manager = new WorkspaceDiagnosticsManager({
        connection: connection as never,
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
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

  it('should publish diagnostics from analyze results (Issue #1719)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'diag.pike');
    writeFileSync(filePath, 'int x = "not an int";\n');

    try {
      const fakeDiagnostics = [
        {
          range: { start: { line: 0, character: 8 }, end: { line: 0, character: 20 } },
          message: 'Type mismatch: expected int, got string',
          severity: 8, // Error
          source: 'pike',
        },
      ];

      const bridge = createRecordingBridge({
        diagnostics: { diagnostics: fakeDiagnostics },
      });
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const connection = createMockConnection();

      const manager = new WorkspaceDiagnosticsManager({
        connection: connection as never,
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      assert.strictEqual(connection.sent.length, 1, 'Should publish diagnostics once');
      assert.strictEqual(connection.sent[0]!.uri, filePath);
      assert.strictEqual(connection.sent[0]!.diagnostics.length, 1);
      assert.strictEqual(
        (connection.sent[0]!.diagnostics as Array<{ message: string }>)[0]!.message,
        'Type mismatch: expected int, got string'
      );

      const stats = manager.getStats();
      assert.strictEqual(stats.publishedDiagnosticCount, 1);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should clear published diagnostics on user activity (Issue #1719)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'clear.pike');
    writeFileSync(filePath, 'int x = 1;\n');

    try {
      const bridge = createRecordingBridge({
        diagnostics: { diagnostics: [] },
      });
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const connection = createMockConnection();

      const manager = new WorkspaceDiagnosticsManager({
        connection: connection as never,
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      // Diagnostics were published (even if empty)
      assert.ok(connection.sent.length > 0, 'Should have sent diagnostics');

      // Reset tracking
      connection.sent.length = 0;

      // Simulate user activity — should clear previously published diagnostics
      manager.onUserActivity();

      // Should have sent empty diagnostics to clear
      const clearCalls = connection.sent.filter(c => c.diagnostics.length === 0);
      assert.ok(clearCalls.length > 0, 'Should clear diagnostics on user activity');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should clear published diagnostics on dispose (Issue #1719)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'pike-ws-diag-'));
    const filePath = join(tempDir, 'dispose.pike');
    writeFileSync(filePath, 'int x = 1;\n');

    try {
      const bridge = createRecordingBridge({
        diagnostics: { diagnostics: [] },
      });
      const bridgeManager = createMockBridgeManager(bridge);
      const scheduler = new RequestScheduler();
      const workspaceIndex = createMockWorkspaceIndex([filePath]);
      const connection = createMockConnection();

      const manager = new WorkspaceDiagnosticsManager({
        connection: connection as never,
        scheduler,
        workspaceIndex,
        bridgeManager,
        idleDelayMs: 10,
        batchSize: 5,
      });

      manager.onIndexingComplete();
      await new Promise(resolve => setTimeout(resolve, 200));

      connection.sent.length = 0;
      manager.dispose();

      const clearCalls = connection.sent.filter(c => c.diagnostics.length === 0);
      assert.ok(clearCalls.length > 0, 'Should clear diagnostics on dispose');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
