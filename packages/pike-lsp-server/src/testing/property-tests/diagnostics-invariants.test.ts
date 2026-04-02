import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { assertInvariant, canPublishDiagnosticsVersion } from './invariants.js';

type Operation = { kind: 'bump' } | { kind: 'publish'; validatedVersion: number };

describe('Property Invariant: diagnostics version monotonic', () => {
  it('never publishes diagnostics newer than current live version', () => {
    const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
      fc.constant({ kind: 'bump' as const }),
      fc.record({
        kind: fc.constant('publish' as const),
        validatedVersion: fc.integer({ min: 0, max: 10_020 }),
      })
    );

    assertInvariant(
      'diagnostics-version-monotonic',
      fc.property(
        fc.integer({ min: 0, max: 25 }),
        fc.array(operationArbitrary, { minLength: 1, maxLength: 120 }),
        (initialLiveVersion, operations) => {
          let liveVersion = initialLiveVersion;

          for (const operation of operations) {
            if (operation.kind === 'bump') {
              liveVersion += 1;
              continue;
            }

            const canPublish = canPublishDiagnosticsVersion(
              operation.validatedVersion,
              liveVersion
            );
            if (canPublish) {
              assert.ok(operation.validatedVersion <= liveVersion);
            }
          }
        }
      )
    );
  });
});
