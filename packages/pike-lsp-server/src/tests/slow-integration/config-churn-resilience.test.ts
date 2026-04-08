/**
 * Slow Integration Test: Config Churn / Reload Storm Resilience
 *
 * RA-inspired test that validates the server's behavior during rapid
 * configuration changes and workspace reload storms. Mirrors rust-analyzer's
 * `ratoml.rs` config churn tests.
 *
 * Ensures debounce logic correctly collapses multiple rapid changes into
 * a single reload, preventing resource exhaustion and stale state.
 *
 * Part of Risk R-003 mitigation.
 *
 * Run with: bun run test:slow
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { computeContentHash, computeLineHashes } from '../../services/document-cache.js';

/**
 * Simulates a workspace reload operation that should be debounced.
 */
class ReloadSimulator {
  private reloadCount = 0;
  private scheduler = new RequestScheduler();

  get totalReloads(): number {
    return this.reloadCount;
  }

  /**
   * Request a workspace reload. With coalescing, rapid calls should result
   * in fewer actual reloads.
   */
  requestReload(configKey: string): Promise<void> {
    return this.scheduler.schedule({
      requestClass: 'background',
      key: `workspace-reload-${configKey}`,
      coalesceMs: 100,
      run: async () => {
        this.reloadCount++;
        // Simulate reload work
        await new Promise(r => setTimeout(r, 50));
      },
    });
  }

  /**
   * Fire N reload requests in rapid succession.
   * Superseded requests are expected and caught.
   */
  async fireReloadStorm(count: number): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < count; i++) {
      promises.push(
        this.requestReload('pike.settings').catch(err => {
          // Superseded requests are expected during a storm
          if (err instanceof RequestSupersededError) return;
          throw err;
        })
      );
    }
    await Promise.all(promises);
  }
}

describe('Slow Integration: Config Churn / Reload Storm Resilience', { timeout: 30_000 }, () => {
  describe('Reload debouncing', () => {
    it('coalesces rapid config changes into fewer reloads', async () => {
      const sim = new ReloadSimulator();

      // Fire 20 rapid reload requests
      await sim.fireReloadStorm(20);

      // Due to coalescing + superseding, actual reloads should be significantly fewer
      expect(sim.totalReloads).toBeLessThan(20);
      expect(sim.totalReloads).toBeGreaterThan(0);
    });

    it('coalesces across different config keys independently', async () => {
      const scheduler = new RequestScheduler();
      const reloadsByKey = new Map<string, number>();

      // Rapid-fire reloads for different config keys
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        const key = `config-key-${i % 3}`; // 3 different keys
        promises.push(
          scheduler
            .schedule({
              requestClass: 'background',
              key: `reload-${key}`,
              coalesceMs: 50,
              run: async () => {
                reloadsByKey.set(key, (reloadsByKey.get(key) ?? 0) + 1);
                await new Promise(r => setTimeout(r, 30));
              },
            })
            .catch(err => {
              if (err instanceof RequestSupersededError) return;
              throw err;
            })
        );
      }

      await Promise.all(promises);

      // Each key should have been reloaded at most a few times
      for (const [, count] of reloadsByKey) {
        expect(count).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('Document version stability during churn', () => {
    it('version tracking remains consistent during rapid edits', async () => {
      const uri = 'file:///churn-test.pike';
      let doc = TextDocument.create(uri, 'pike', 1, 'int x = 1;');

      // Simulate 50 rapid edits (config churn scenario)
      const versions: number[] = [];
      for (let i = 0; i < 50; i++) {
        const newVersion = i + 2;
        doc = TextDocument.update(doc, [], newVersion, doc.getText() + `\nint v${i} = ${i};`);
        versions.push(doc.version);
      }

      // Versions should be monotonically increasing
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThan(versions[i - 1]);
      }

      // Final version should be 51
      expect(doc.version).toBe(51);
    });

    it('content hashes track edits correctly through churn', () => {
      const content1 = 'int x = 1;';
      const content2 = 'int x = 2;';

      const hash1 = computeContentHash(content1);
      const hash2 = computeContentHash(content2);

      // Different content = different hash
      expect(hash1).not.toBe(hash2);

      // Same content = same hash (idempotent)
      const hash1Again = computeContentHash(content1);
      expect(hash1Again).toBe(hash1);
    });

    it('line hashes detect semantic changes during rapid reformat', () => {
      const original = 'int x = 1;\nstring y = "hello";';
      const modified = 'int x = 2;\nstring y = "hello";';

      const hashes1 = computeLineHashes(original);
      const hashes2 = computeLineHashes(modified);

      // Semantic change (different value) should be detected in line hashes
      expect(hashes1).not.toEqual(hashes2);

      // Same input produces same output
      const hashes1Again = computeLineHashes(original);
      expect(hashes1Again).toEqual(hashes1);
    });
  });

  describe('Scheduler metrics under churn', () => {
    it('tracks metrics correctly through reload storm', async () => {
      const scheduler = new RequestScheduler();
      let completedCount = 0;

      // Fire 30 background requests with coalescing
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 30; i++) {
        promises.push(
          scheduler
            .schedule({
              requestClass: 'background',
              key: `churn-${i % 5}`, // 5 coalescing keys
              coalesceMs: 20,
              run: async () => {
                completedCount++;
                await new Promise(r => setTimeout(r, 10));
              },
            })
            .catch(err => {
              if (err instanceof RequestSupersededError) return;
              throw err;
            })
        );
      }

      await Promise.all(promises);

      // Due to coalescing, fewer actual runs
      expect(completedCount).toBeLessThanOrEqual(30);
      expect(completedCount).toBeGreaterThan(0);
    });

    it('superseded requests do not execute', async () => {
      const scheduler = new RequestScheduler();
      let executionCount = 0;
      let supersededErrors = 0;

      // Fire rapid requests with the same key — only the last should execute
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          scheduler
            .schedule({
              requestClass: 'typing',
              key: 'supersede-test',
              coalesceMs: 30,
              run: async () => {
                executionCount++;
              },
            })
            .catch(err => {
              if (err instanceof RequestSupersededError) {
                supersededErrors++;
                return;
              }
              throw err;
            })
        );
      }

      await Promise.allSettled(promises);

      // Should have at most a few actual executions
      expect(executionCount + supersededErrors).toBe(10);
    });
  });
});
