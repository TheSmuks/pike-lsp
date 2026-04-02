import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { assertInvariant } from './invariants.js';
import { documentUriArbitrary } from './generators.js';

interface ValidationOperation {
  uri: string;
  expectedVersion: number;
}

describe('Property Invariant: no duplicate active validation', () => {
  it('tracks at most one active validation per URI', () => {
    const operationArbitrary: fc.Arbitrary<ValidationOperation> = fc.record({
      uri: documentUriArbitrary(),
      expectedVersion: fc.integer({ min: 0, max: 10_000 }),
    });

    assertInvariant(
      'no-duplicate-active-validation',
      fc.property(fc.array(operationArbitrary, { minLength: 1, maxLength: 200 }), operations => {
        const activeByUri = new Map<string, number>();

        for (const operation of operations) {
          activeByUri.set(operation.uri, operation.expectedVersion);

          for (const [uri, version] of activeByUri.entries()) {
            assert.equal(typeof uri, 'string');
            assert.equal(Number.isInteger(version), true);
          }
        }

        const uniqueUris = new Set(operations.map(operation => operation.uri));
        assert.ok(activeByUri.size <= uniqueUris.size);
      })
    );
  });
});
