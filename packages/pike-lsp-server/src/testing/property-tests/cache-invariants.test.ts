import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { DocumentCache } from '../../services/document-cache.js';
import { assertInvariant, shouldWriteVersionedResult } from './invariants.js';
import { documentUriArbitrary } from './generators.js';

describe('Property Invariant: no stale cache writes', () => {
  it('never allows stale version to overwrite newer cached entry', () => {
    assertInvariant(
      'no-stale-cache-writes',
      fc.property(
        documentUriArbitrary(),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 25 }),
        (uri, baseVersion, gap) => {
          const cache = new DocumentCache();
          const staleVersion = baseVersion;
          const liveVersion = baseVersion + gap;

          cache.set(uri, {
            version: liveVersion,
            symbols: [],
            diagnostics: [],
            symbolPositions: new Map(),
            symbolNames: new Map(),
          });

          if (shouldWriteVersionedResult(staleVersion, liveVersion)) {
            cache.set(uri, {
              version: staleVersion,
              symbols: [],
              diagnostics: [],
              symbolPositions: new Map(),
              symbolNames: new Map(),
            });
          }

          const finalEntry = cache.get(uri);
          assert.ok(finalEntry);
          assert.equal(finalEntry.version, liveVersion);
        }
      )
    );
  });
});

describe('Property Invariant: cache size bounded by maxSize', () => {
  it('cache.size never exceeds constructor maxSize for any sequence of operations', () => {
    assertInvariant(
      'cache-size-bounded',
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.array(
          fc.oneof(
            { arbitrary: documentUriArbitrary(), weight: 2 },
            { arbitrary: fc.constant(undefined), weight: 1 }
          ),
          { minLength: 1, maxLength: 50 }
        ),
        (maxSize, uris) => {
          const cache = new DocumentCache(maxSize);
          for (const uri of uris) {
            if (uri !== undefined) {
              cache.set(uri, {
                version: 1,
                symbols: [],
                diagnostics: [],
                symbolPositions: new Map(),
                symbolNames: new Map(),
              });
            }
          }
          assert.ok(cache.size <= maxSize, `size ${cache.size} exceeds maxSize ${maxSize}`);
        }
      )
    );
  });
});
