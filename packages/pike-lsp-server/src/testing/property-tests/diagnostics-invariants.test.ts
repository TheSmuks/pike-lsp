import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  assertInvariant,
  canPublishDiagnosticsRevision,
  canPublishDiagnosticsVersion,
} from './invariants.js';
import { buildStaleFallbackEntry } from '../../features/diagnostics/index.js';

type Operation = { kind: 'bump' } | { kind: 'publish'; validatedVersion: number };
type RevisionOperation =
  | { kind: 'claim' }
  | { kind: 'publish'; candidateRevision: number }
  | { kind: 'noop' };

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

  it('stale fallback always marks parseFailed and preserves degraded diagnostics shape', () => {
    assertInvariant(
      'diagnostics-stale-fallback-malformed',
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.string({ minLength: 1, maxLength: 80 }),
        (version, message) => {
          const entry = buildStaleFallbackEntry(
            undefined,
            version,
            [
              {
                severity: 1,
                source: 'pike',
                message,
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 1 },
                },
              },
            ],
            `hash-${version}`,
            [version]
          );

          assert.equal(entry.analysisState?.parseFailed, true);
          assert.equal(entry.analysisState?.isStale, true);
          assert.equal(entry.version, version);
          assert.equal(Array.isArray(entry.diagnostics), true);
          assert.equal(entry.diagnostics.length > 0, true);
        }
      )
    );
  });

  it('only latest claimed revision can publish and published revisions never regress', () => {
    const revisionOperationArbitrary: fc.Arbitrary<RevisionOperation> = fc.oneof(
      fc.constant({ kind: 'claim' as const }),
      fc.record({
        kind: fc.constant('publish' as const),
        candidateRevision: fc.integer({ min: 0, max: 20_000 }),
      }),
      fc.constant({ kind: 'noop' as const })
    );

    assertInvariant(
      'diagnostics-revision-monotonic',
      fc.property(
        fc.array(revisionOperationArbitrary, { minLength: 1, maxLength: 250 }),
        operations => {
          let latestRevision = 0;
          let lastPublishedRevision = 0;

          for (const operation of operations) {
            if (operation.kind === 'claim') {
              latestRevision += 1;
              continue;
            }

            if (operation.kind === 'noop') {
              continue;
            }

            const canPublish = canPublishDiagnosticsRevision(
              operation.candidateRevision,
              latestRevision
            );
            if (!canPublish) {
              continue;
            }

            assert.equal(operation.candidateRevision, latestRevision);
            assert.equal(operation.candidateRevision >= lastPublishedRevision, true);
            lastPublishedRevision = operation.candidateRevision;
          }
        }
      )
    );
  });
});
