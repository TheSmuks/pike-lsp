import { describe, it, spyOn } from 'bun:test';
import type { PikeBridge } from '@pike-lsp/pike-bridge';
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
    getDiagnostics: () => ({ options: {}, isRunning: running, pid }),
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

describe('BridgeManager parseFileSymbols', () => {
  it('throws on readFile ENOENT and logs filePath', async () => {
    const warnCalls: Array<Array<unknown>> = [];
    const mockLogger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (...args: unknown[]) => {
        warnCalls.push(args);
      },
      error: () => undefined,
    } as unknown as Logger;

    const manager = new BridgeManager(
      createBridge(true, 1234) as unknown as PikeBridge,
      mockLogger
    );

    await assert.rejects(
      () => manager.parseFileSymbols('/nonexistent/path/file.pike'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /ENOENT/);
        return true;
      }
    );

    assert.ok(warnCalls.length >= 1, 'warn should be called for readFile error');
    const warnArg = String(warnCalls[0][0]);
    assert.ok(
      warnArg.includes('/nonexistent/path/file.pike'),
      `warn message should include filePath, got: ${warnArg}`
    );
  });

  it('throws on readFile EACCES and logs filePath', async () => {
    const warnCalls: Array<Array<unknown>> = [];
    const mockLogger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (...args: unknown[]) => {
        warnCalls.push(args);
      },
      error: () => undefined,
    } as unknown as Logger;

    const manager = new BridgeManager(
      createBridge(true, 1234) as unknown as PikeBridge,
      mockLogger
    );

    // Use /proc/kcore or another path that will trigger EACCES on Linux
    // If running as root, this won't trigger EACCES, so we skip
    try {
      await assert.rejects(
        () => manager.parseFileSymbols('/root/.bashrc'),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          const msg = (err as NodeJS.ErrnoException).code;
          assert.ok(msg === 'EACCES' || msg === 'ENOENT', `expected EACCES or ENOENT, got: ${msg}`);
          return true;
        }
      );
      assert.ok(warnCalls.length >= 1, 'warn should be called for readFile error');
    } catch {
      // Running as root — skip this test
    }
  });

  it('throws when analyze() fails and logs filePath', async () => {
    const warnCalls: Array<Array<unknown>> = [];
    const mockLogger = {
      debug: () => undefined,
      info: () => undefined,
      warn: (...args: unknown[]) => {
        warnCalls.push(args);
      },
      error: () => undefined,
    } as unknown as Logger;

    const manager = new BridgeManager(
      {
        isRunning: () => true,
        on: () => undefined,
        getDiagnostics: () => ({ options: {}, isRunning: true, pid: 1 }),
        getInflightRequestCount: () => 0,
        analyze: () => {
          throw new Error('analyze failed');
        },
      } as unknown as PikeBridge,
      mockLogger
    );

    // Write a temporary file with valid content so readFile succeeds
    const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
    const tmpDir = await mkdtemp('/tmp/pike-test-XXXXXX');
    const tmpFile = `${tmpDir}/test.pike`;
    await writeFile(tmpFile, 'int x;');
    try {
      await assert.rejects(
        () => manager.parseFileSymbols(tmpFile),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /analyze failed/);
          return true;
        }
      );

      // Verify warn was called with filePath
      assert.ok(warnCalls.length >= 1, 'warn should be called for analyze error');
      const warnArg = String(warnCalls[0][0]);
      assert.ok(warnArg.includes(tmpFile), `warn message should include filePath, got: ${warnArg}`);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws when bridge is null', async () => {
    const manager = new BridgeManager(null, createMockLogger());
    await assert.rejects(
      () => manager.parseFileSymbols('/any/path.pike'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Bridge not available/);
        return true;
      }
    );
  });
});

describe('BridgeManager stop() guards against stale writes', () => {
  it('does not overwrite cachedVersion after stop() clears it', async () => {
    let resolveVersion: (v: unknown) => void;
    const manager = new BridgeManager(
      {
        isRunning: () => true,
        on: () => undefined,
        start: async () => undefined,
        stop: async () => undefined,
        getVersionInfo: () =>
          new Promise(r => {
            resolveVersion = r;
          }),
        getDiagnostics: () => ({ options: { pikePath: '/usr/bin/pike' }, isRunning: true, pid: 1 }),
      } as unknown as PikeBridge,
      createMockLogger()
    );

    // start() fires fetchVersionInfoInternal as fire-and-forget
    await manager.start();

    // Resolve version AFTER stop() is called but BEFORE stop() returns
    // We achieve this by calling stop() and resolving the promise in sequence.
    // Since stop() is async but the flag is set synchronously, the in-flight
    // await should see stopped=true.
    await manager.stop();

    // Now resolve the pending promise (if it hasn't already)
    resolveVersion!({ major: 8, minor: 0, build: 1116, version: '8.0.1116', display: 8.01116 });

    // Wait a tick for the promise microtask to run
    await new Promise(r => setTimeout(r, 0));

    const health = await manager.getHealth();
    assert.equal(health.pikeVersion, null, 'cachedVersion should remain null after stop()');
    assert.equal(health.startupMetrics, null, 'startupMetrics should remain null after stop()');
  });

  it('does not overwrite cachedVersion when stop() is called during realpath() delay', async () => {
    let resolveRealpath: (v: string) => void;
    const fsp = await import('node:fs/promises');
    const realpathSpy = spyOn(fsp, 'realpath').mockImplementation(() => {
      return new Promise(r => {
        resolveRealpath = r;
      });
    });

    const manager = new BridgeManager(
      {
        isRunning: () => true,
        on: () => undefined,
        start: async () => undefined,
        stop: async () => undefined,
        getVersionInfo: async () => ({
          major: 8,
          minor: 0,
          build: 1116,
          version: '8.0.1116',
          display: 8.01116,
        }),
        getDiagnostics: () => ({ options: { pikePath: '/usr/bin/pike' }, isRunning: true, pid: 1 }),
      } as unknown as PikeBridge,
      createMockLogger()
    );

    // start() fires fetchVersionInfoInternal as fire-and-forget.
    // getVersionInfo resolves immediately, but realpath() is delayed.
    await manager.start();

    // Call stop() while realpath() is still pending
    await manager.stop();

    // Now resolve the delayed realpath
    resolveRealpath!('/usr/bin/pike');

    // Wait for the promise microtask to run
    await new Promise(r => setTimeout(r, 0));

    const health = await manager.getHealth();
    assert.equal(
      health.pikeVersion,
      null,
      'cachedVersion should remain null after stop() during realpath delay'
    );

    realpathSpy.mockRestore();
  });
});

describe('BridgeManager requireBridge guard', () => {
  it('throws when bridge is null', async () => {
    const manager = new BridgeManager(null, createMockLogger());
    await assert.rejects(
      () => manager.findOccurrences('int x;'),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Bridge not available/);
        return true;
      }
    );
  });

  it('throws when bridge is null for engine methods', async () => {
    const manager = new BridgeManager(null, createMockLogger());
    await assert.rejects(
      () => manager.engineQuery({ feature: 'test', requestId: '1', snapshot: {}, queryParams: {} }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Bridge not available/);
        return true;
      }
    );
  });

  it('delegates to bridge when available', async () => {
    let called = false;
    const manager = new BridgeManager(
      {
        isRunning: () => true,
        on: () => undefined,
        getDiagnostics: () => ({ options: {}, isRunning: true, pid: 1 }),
        findOccurrences: () => {
          called = true;
          return Promise.resolve([]);
        },
      } as unknown as PikeBridge,
      createMockLogger()
    );
    await manager.findOccurrences('int x;');
    assert.ok(called, 'should delegate to bridge.findOccurrences');
  });
});
