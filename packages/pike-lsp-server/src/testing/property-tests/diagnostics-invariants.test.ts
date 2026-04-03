import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { assertInvariant, canPublishDiagnosticsVersion } from './invariants.js';
import {
  buildStaleFallbackEntry,
  canPublishDiagnosticsRevision,
  nextValidationRevision,
} from '../../features/diagnostics/index.js';

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

  it('only latest unpublished revision can publish diagnostics', () => {
    type RevisionOp =
      | { kind: 'schedule' }
      | { kind: 'publish'; revision: number }
      | { kind: 'mark-published'; revision: number };

    const opArbitrary: fc.Arbitrary<RevisionOp> = fc.oneof(
      fc.constant({ kind: 'schedule' as const }),
      fc.record({
        kind: fc.constant('publish' as const),
        revision: fc.integer({ min: 0, max: 500 }),
      }),
      fc.record({
        kind: fc.constant('mark-published' as const),
        revision: fc.integer({ min: 0, max: 500 }),
      })
    );

    assertInvariant(
      'diagnostics-revision-monotonic-publish-rights',
      fc.property(fc.array(opArbitrary, { minLength: 1, maxLength: 220 }), operations => {
        let latestScheduledRevision: number | undefined;
        let latestPublishedRevision: number | undefined;

        for (const operation of operations) {
          if (operation.kind === 'schedule') {
            latestScheduledRevision = nextValidationRevision(latestScheduledRevision);
            continue;
          }

          if (operation.kind === 'mark-published') {
            latestPublishedRevision = Math.max(latestPublishedRevision ?? 0, operation.revision);
            continue;
          }

          const allowed = canPublishDiagnosticsRevision(
            operation.revision,
            latestScheduledRevision,
            latestPublishedRevision
          );

          if (!allowed) {
            continue;
          }

          assert.equal(operation.revision, latestScheduledRevision);
          assert.equal(operation.revision > (latestPublishedRevision ?? 0), true);

          latestPublishedRevision = operation.revision;
        }
      })
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
});
