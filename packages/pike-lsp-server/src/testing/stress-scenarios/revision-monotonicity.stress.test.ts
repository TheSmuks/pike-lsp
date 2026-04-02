import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { stressRunner } from '../stress-runner.js';

type MutationMethod = 'open' | 'change' | 'close' | 'config' | 'workspace';

class SerializedMutationClock {
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();

  mutate(_method: MutationMethod): Promise<{ revision: number; snapshotId: string }> {
    return new Promise((resolve, reject) => {
      this.queue = this.queue
        .then(async () => {
          this.revision += 1;
          resolve({ revision: this.revision, snapshotId: `snp-${this.revision}` });
        })
        .catch(error => {
          reject(error);
        });
    });
  }
}

describe('Stress: QE2 monotonic revision invariant', () => {
  it('INV-03: keeps revisions globally monotonic and ordered under concurrency', async () => {
    const clock = new SerializedMutationClock();
    const seenRevisions = new Set<number>();
    const observed: number[] = [];

    const result = await stressRunner.run(
      'qe2-revision-monotonicity',
      350,
      async seed => {
        const methods: MutationMethod[] = ['open', 'change', 'close', 'config', 'workspace'];
        const method = methods[seed % methods.length] as MutationMethod;
        const ack = await clock.mutate(method);

        assert.equal(ack.snapshotId, `snp-${ack.revision}`);
        seenRevisions.add(ack.revision);
        observed.push(ack.revision);
      },
      {
        concurrency: 8,
        delayMs: { min: 0, max: 2 },
        timeoutMs: 1_000,
      }
    );

    assert.equal(result.failures, 0);
    assert.equal(seenRevisions.size, 350);

    const sorted = [...observed].sort((left, right) => left - right);
    for (let index = 0; index < sorted.length; index += 1) {
      assert.equal(sorted[index], index + 1);
    }
  }, 20_000);
});
