import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { DocumentCache } from '../../services/document-cache.js';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { makeCachedEntry } from '../../tests/helpers/test-helpers.js';
import { stressRunner } from '../stress-runner.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Stress: validation burst', () => {
  it('keeps only latest validation result during edit bursts', async () => {
    const uri = 'file:///validation-burst.pike';
    const cache = new DocumentCache();
    const scheduler = new RequestScheduler({ maxConcurrent: 4 });
    let latestVersion = 0;
    let malformedWrites = 0;

    const result = await stressRunner.run(
      'validation-burst',
      1000,
      async (seed, iteration) => {
        const tasks: Array<Promise<number>> = [];

        for (let offset = 0; offset < 10; offset += 1) {
          const version = iteration * 10 + offset + 1;
          latestVersion = version;
          const isMalformed = (seed + version) % 5 === 0;
          const text = isMalformed ? 'int v = ;\n' : `int v = ${seed + version};\n`;

          const task = scheduler
            .schedule<number>({
              requestClass: 'typing',
              key: `validate:${uri}`,
              run: async checkpoint => {
                await sleep((seed + offset) % 4);
                checkpoint();

                if (version !== latestVersion) {
                  throw new RequestSupersededError('stale validation');
                }

                const entry = makeCachedEntry(text, {
                  parseFailed: isMalformed,
                  diagnostics: isMalformed
                    ? [
                        {
                          severity: 1,
                          source: 'pike',
                          message: 'Parse degraded under active edits',
                          range: {
                            start: { line: 0, character: 0 },
                            end: { line: 0, character: 1 },
                          },
                        },
                      ]
                    : [],
                });
                entry.version = version;
                cache.set(uri, entry);
                if (isMalformed) {
                  malformedWrites += 1;
                }
                return version;
              },
            })
            .catch(error => {
              if (error instanceof RequestSupersededError) {
                return -1;
              }
              throw error;
            });

          tasks.push(task);
        }

        await Promise.all(tasks);
      },
      {
        concurrency: 3,
        delayMs: { min: 10, max: 30 },
        timeoutMs: 5_000,
      }
    );

    const cached = cache.get(uri);
    assert.strictEqual(result.failures, 0);
    assert.ok(cached);
    assert.strictEqual(cached.version, latestVersion);
    assert.equal(malformedWrites > 0, true);
    assert(result.durationMs < 60_000);
  }, 60_000);
});
