import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import {
  canPublishDiagnosticsRevision,
  nextValidationRevision,
} from '../../features/diagnostics/index.js';
import { stressRunner } from '../stress-runner.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Stress: malformed edit burst stability', () => {
  it('keeps diagnostics publish latest-wins across 1000 malformed edit bursts', async () => {
    const uri = 'file:///stress-malformed-edit-burst.pike';
    const scheduler = new RequestScheduler({ maxConcurrent: 6 });

    let latestVersion = 0;
    let latestScheduledRevision: number | undefined;
    let latestPublishedRevision: number | undefined;
    const published: Array<{ version: number; revision: number; malformed: boolean }> = [];

    const result = await stressRunner.run(
      'malformed-edit-burst-stability',
      1000,
      async (seed, iteration) => {
        const burstTasks: Promise<void>[] = [];

        for (let offset = 0; offset < 5; offset += 1) {
          const version = iteration * 5 + offset + 1;
          latestVersion = version;
          const malformed = (seed + version + offset) % 3 === 0;
          const revision = nextValidationRevision(latestScheduledRevision);
          latestScheduledRevision = revision;

          const task = scheduler
            .schedule<void>({
              requestClass: 'typing',
              key: `diag:${uri}`,
              run: async checkpoint => {
                await sleep((seed + offset) % 5);
                checkpoint();

                const hasPublishRights = canPublishDiagnosticsRevision(
                  revision,
                  latestScheduledRevision,
                  latestPublishedRevision
                );

                if (!hasPublishRights) {
                  throw new RequestSupersededError('superseded before publish');
                }

                published.push({ version, revision, malformed });
                latestPublishedRevision = revision;
              },
            })
            .catch(error => {
              if (error instanceof RequestSupersededError) {
                return;
              }
              throw error;
            });

          burstTasks.push(task);
        }

        await Promise.all(burstTasks);
      },
      {
        concurrency: 4,
        delayMs: { min: 10, max: 25 },
        timeoutMs: 5_000,
      }
    );

    assert.equal(result.failures, 0);
    assert.equal(published.length > 0, true);

    const lastPublish = published[published.length - 1];
    assert.ok(lastPublish);
    assert.equal(lastPublish.version, latestVersion);
    assert.equal(lastPublish.revision, latestScheduledRevision);
  }, 60_000);
});
