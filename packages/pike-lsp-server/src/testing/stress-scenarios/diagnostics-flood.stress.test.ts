import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RequestScheduler, RequestSupersededError } from '../../services/request-scheduler.js';
import { createMockConnection } from '../../tests/helpers/test-helpers.js';
import { stressRunner } from '../stress-runner.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Stress: diagnostics flood', () => {
  it('publishes latest diagnostics across 10 files under rapid updates', async () => {
    const files = Array.from({ length: 10 }, (_, i) => `file:///diagnostics-${i}.pike`);
    const scheduler = new RequestScheduler({ maxConcurrent: 6 });
    const connection = createMockConnection();
    const latestByUri = new Map<string, number>();
    const publishedByUri = new Map<string, number>();

    const result = await stressRunner.run(
      'diagnostics-flood',
      1000,
      async seed => {
        const publishes = files.map((uri, index) => {
          const nextVersion = (latestByUri.get(uri) ?? 0) + 1;
          latestByUri.set(uri, nextVersion);

          return scheduler
            .schedule<void>({
              requestClass: 'typing',
              key: `diag:${uri}`,
              run: async checkpoint => {
                await sleep((seed + index) % 3);
                checkpoint();

                if (latestByUri.get(uri) !== nextVersion) {
                  throw new RequestSupersededError('stale diagnostics');
                }

                connection.sendDiagnostics({
                  uri,
                  diagnostics: [
                    {
                      message: `v${nextVersion}`,
                      severity: 1,
                    },
                  ],
                });
                publishedByUri.set(uri, nextVersion);
              },
            })
            .catch(error => {
              if (error instanceof RequestSupersededError) {
                return;
              }
              throw error;
            });
        });

        await Promise.all(publishes);
      },
      {
        concurrency: 4,
        delayMs: { min: 10, max: 30 },
        timeoutMs: 5_000,
      }
    );

    assert.strictEqual(result.failures, 0);
    assert(connection.diagnosticsPublished.length > 0);
    for (const uri of files) {
      assert.strictEqual(publishedByUri.get(uri), latestByUri.get(uri));
    }
    assert(result.durationMs < 90_000);
  }, 60_000);
});
