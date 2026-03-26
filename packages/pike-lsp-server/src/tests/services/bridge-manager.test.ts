import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import type { Logger } from '@pike-lsp/core';
import { BridgeManager, type HealthStatus } from '../../services/bridge-manager.js';

function createMockLogger(): Logger {
  return {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  } as unknown as Logger;
}

function createBridge(running: boolean, pid: number | null) {
  return {
    isRunning: () => running,
    on: () => undefined,
    process: pid === null ? undefined : { pid },
  };
}

function classifyHealthState(
  health: HealthStatus
): 'not-started' | 'version-pending' | 'running' | 'crashed' | 'unknown' {
  if (!health.bridgeConnected && health.pikePid === null) {
    return 'not-started';
  }

  if (health.bridgeConnected && health.versionFetchPending && health.pikeVersion === null) {
    return 'version-pending';
  }

  if (
    health.bridgeConnected &&
    !health.versionFetchPending &&
    health.pikePid !== null &&
    health.pikeVersion !== null
  ) {
    return 'running';
  }

  if (!health.bridgeConnected && health.pikePid !== null) {
    return 'crashed';
  }

  return 'unknown';
}

describe('BridgeManager getHealth branch coverage', () => {
  it('returns not-started state when bridge is not initialized', async () => {
    const manager = new BridgeManager(null, createMockLogger());

    const health = await manager.getHealth();

    assert.equal(classifyHealthState(health), 'not-started');
    assert.equal(health.bridgeConnected, false);
    assert.equal(health.pikePid, null);
    assert.equal(health.pikeVersion, null);
    assert.equal(health.versionFetchPending, false);
    assert.ok(health.serverUptime >= 0);
  });

  it('returns version-pending state while async version fetch is inflight', async () => {
    const manager = new BridgeManager(createBridge(true, 43210) as any, createMockLogger());
    (manager as any).versionFetchPromise = new Promise<void>(() => undefined);

    const health = await manager.getHealth();

    assert.equal(classifyHealthState(health), 'version-pending');
    assert.equal(health.bridgeConnected, true);
    assert.equal(health.pikePid, 43210);
    assert.equal(health.pikeVersion, null);
    assert.equal(health.versionFetchPending, true);
  });

  it('returns running state when bridge is connected and version is cached', async () => {
    const manager = new BridgeManager(createBridge(true, 87654) as any, createMockLogger());
    (manager as any).cachedVersion = {
      major: 8,
      minor: 0,
      build: 1116,
      version: '8.0.1116',
      display: 8.01116,
      pikePath: '/usr/bin/pike',
    };
    (manager as any).versionFetchPromise = null;

    const health = await manager.getHealth();

    assert.equal(classifyHealthState(health), 'running');
    assert.equal(health.bridgeConnected, true);
    assert.equal(health.pikePid, 87654);
    assert.ok(health.pikeVersion);
    assert.equal(health.pikeVersion?.pikePath, '/usr/bin/pike');
    assert.equal(health.versionFetchPending, false);
  });

  it('returns crashed state when bridge is disconnected but PID still exists', async () => {
    const manager = new BridgeManager(createBridge(false, 99999) as any, createMockLogger());
    (manager as any).errorLog = ['Bridge crashed'];

    const health = await manager.getHealth();

    assert.equal(classifyHealthState(health), 'crashed');
    assert.equal(health.bridgeConnected, false);
    assert.equal(health.pikePid, 99999);
    assert.deepEqual(health.recentErrors, ['Bridge crashed']);
    assert.equal(health.versionFetchPending, false);
  });
});
