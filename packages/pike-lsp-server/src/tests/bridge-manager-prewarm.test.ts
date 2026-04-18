import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { BridgeManager } from '../services/bridge-manager.js';
import { Logger } from '@pike-lsp/core';

describe('BridgeManager - stdlib prewarming', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger('test');
  });

  it('should accept pikeIntrospection reference via setter', () => {
    const bm = new BridgeManager(null, logger);
    let prewarmCalled = false;
    const mockIntrospection = {
      prewarmStdlibIndex: async () => {
        prewarmCalled = true;
        return { durationMs: 100, modulesLoaded: ['Stdio'], modulesFailed: [], totalSymbols: 50 };
      },
    } as any;

    bm.setPikeIntrospection(mockIntrospection);

    // Verify no crash — setter stores reference
    expect(prewarmCalled).toBe(false); // Not called yet, only stored
  });

  it('should include prewarmMetrics in HealthStatus', async () => {
    const bm = new BridgeManager(null, logger);

    // Manually set prewarmMetrics as bridge-manager.start() would
    // (we can't actually start without a real bridge)
    const metrics = {
      durationMs: 250,
      modulesLoaded: ['Stdio', 'Parser'],
      modulesFailed: [],
      totalSymbols: 150,
    };

    // Access private field via type assertion to set metrics
    (bm as any).prewarmMetrics = metrics;

    const health = await bm.getHealth();
    expect(health.prewarmMetrics).toBeDefined();
    expect(health.prewarmMetrics?.modulesLoaded).toEqual(['Stdio', 'Parser']);
    expect(health.prewarmMetrics?.totalSymbols).toBe(150);
    expect(health.prewarmMetrics?.durationMs).toBe(250);
  });

  it('should report prewarmMetrics as null initially', async () => {
    const bm = new BridgeManager(null, logger);
    const health = await bm.getHealth();
    expect(health.prewarmMetrics).toBeNull();
  });

  it('should clear prewarmMetrics on stop', async () => {
    const bm = new BridgeManager(null, logger);
    (bm as any).prewarmMetrics = {
      durationMs: 100,
      modulesLoaded: ['Stdio'],
      modulesFailed: [],
      totalSymbols: 50,
    };

    await bm.stop();

    const health = await bm.getHealth();
    expect(health.prewarmMetrics).toBeNull();
  });
});
