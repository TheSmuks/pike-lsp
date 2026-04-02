/**
 * Scenario: Workspace Idle Diagnostics (Issue #1113)
 *
 * Tests that workspace diagnostics manager properly schedules background
 * analysis during idle time and yields to user activity.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { WorkspaceDiagnosticsManager } from '../services/workspace-diagnostics.js';
import { RequestScheduler } from '../services/request-scheduler.js';
import { WorkspaceIndex } from '../workspace-index.js';

describe('Scenario: workspace idle diagnostics', () => {
  it('should initialize with default options', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = new WorkspaceIndex();
    const bridgeManager = null;

    const manager = new WorkspaceDiagnosticsManager({
      scheduler,
      workspaceIndex,
      bridgeManager,
    });

    const stats = manager.getStats();
    assert.strictEqual(stats.queueDepth, 0);
    assert.strictEqual(stats.processedCount, 0);
    assert.strictEqual(stats.isRunning, false);

    manager.dispose();
  });

  it('should track idle state and yield to user activity', () => {
    const scheduler = new RequestScheduler();
    const workspaceIndex = new WorkspaceIndex();

    const manager = new WorkspaceDiagnosticsManager({
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
    const workspaceIndex = new WorkspaceIndex();

    const manager = new WorkspaceDiagnosticsManager({
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
});
