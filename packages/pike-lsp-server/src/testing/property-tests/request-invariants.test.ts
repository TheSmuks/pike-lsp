import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { assertInvariant } from './invariants.js';
import { documentUriArbitrary } from './generators.js';

interface RequestLifecycle {
  uri: string;
  requestId: string;
  settleAs: 'completed' | 'cancelled';
}

describe('Property Invariant: in-flight request cleanup', () => {
  it('cleans in-flight request entries after completion/cancellation', () => {
    const lifecycleArbitrary: fc.Arbitrary<RequestLifecycle> = fc.record({
      uri: documentUriArbitrary(),
      requestId: fc.uuid(),
      settleAs: fc.constantFrom('completed', 'cancelled'),
    });

    assertInvariant(
      'in-flight-request-cleanup',
      fc.property(fc.array(lifecycleArbitrary, { minLength: 1, maxLength: 200 }), lifecycles => {
        const inFlight = new Map<string, string>();

        for (const lifecycle of lifecycles) {
          inFlight.set(lifecycle.uri, lifecycle.requestId);

          if (lifecycle.settleAs === 'completed' || lifecycle.settleAs === 'cancelled') {
            inFlight.delete(lifecycle.uri);
          }
        }

        assert.equal(inFlight.size, 0);
      })
    );
  });
});
