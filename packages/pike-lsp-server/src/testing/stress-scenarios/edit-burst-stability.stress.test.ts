import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { stressRunner } from '../stress-runner.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Stress: edit burst stability', () => {
  it('keeps latest-wins diagnostics stable across 1000 malformed edit bursts', async () => {
    const uri = 'file:///edit-burst-stability.pike';
    const scheduler = new RequestScheduler({ maxConcurrent: 4 });
    let latestVersion = 0;
    let latestRevision = 0;
    const publishedVersions: number[] = [];

    const result = await stressRunner.run(
      'edit-burst-stability',
      1000,
      async seed => {
        const burstSize = 6;
        const tasks: Array<Promise<void>> = [];

        for (let index = 0; index < burstSize; index += 1) {
          const version = latestVersion + 1;
          latestVersion = version;
          const revision = latestRevision + 1;
          latestRevision = revision;
          const malformed = (seed + index + version) % 4 === 0;

          const task = scheduler
            .schedule<void>({
              requestClass: 'typing',
              key: `diagnostics:${uri}`,
              run: async checkpoint => {
                await sleep((seed + index) % 5);
                checkpoint();

                if (revision !== latestRevision) {
                  throw new RequestSupersededError('superseded edit revision');
                }

                if (malformed) {
                  await sleep((seed + version) % 2);
                  checkpoint();
                }

                publishedVersions.push(version);
              },
            })
            .catch(error => {
              if (error instanceof RequestSupersededError) {
                return;
              }
              throw error;
            });

          tasks.push(task);
        }

        await Promise.all(tasks);
      },
      {
        concurrency: 3,
        delayMs: { min: 10, max: 25 },
        timeoutMs: 5_000,
      }
    );

    assert.equal(result.failures, 0);
    assert.equal(publishedVersions.length > 0, true);
    for (let index = 1; index < publishedVersions.length; index += 1) {
      assert.equal(publishedVersions[index]! >= publishedVersions[index - 1]!, true);
    }
    assert.equal(publishedVersions[publishedVersions.length - 1], latestVersion);
    assert(result.durationMs < 90_000);
  }, 90_000);
});
