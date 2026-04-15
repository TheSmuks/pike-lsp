import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { CompilationCache } from '../services/compilation-cache.js';

type TestResult = { errors: number };

function makeOptions(overrides?: { clock?: () => number }) {
  return { maxSize: 100, ...overrides };
}

describe('CompilationCache.deserialize', () => {
  it('round-trips valid serialize/deserialize preserving entries', () => {
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store('file:///a.pike', 'int x;', { errors: 0 }, ['file:///b.pike'], 500);
    cache.store('file:///b.pike', 'int y;', { errors: 1 }, [], 1000);

    const serialized = cache.serialize();
    const restored = CompilationCache.deserialize<TestResult>(serialized, makeOptions());

    assert.strictEqual(restored.size, 2);

    const entryA = restored.get('file:///a.pike', 'int x;');
    assert.ok(entryA);
    assert.deepStrictEqual(entryA.result, { errors: 0 });
    assert.deepStrictEqual(entryA.dependencies, ['file:///b.pike']);
    assert.strictEqual(entryA.timestamp, 500);

    const entryB = restored.get('file:///b.pike', 'int y;');
    assert.ok(entryB);
    assert.deepStrictEqual(entryB.result, { errors: 1 });
  });

  it('returns empty cache for malformed JSON', () => {
    const cache = CompilationCache.deserialize<TestResult>('{ not valid json }}}', makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('returns empty cache for non-JSON string', () => {
    const cache = CompilationCache.deserialize<TestResult>('just some random text', makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('returns empty cache when entries is an object instead of array', () => {
    const payload = JSON.stringify({ entries: { 'file:///a.pike': 'data' } });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('returns empty cache when entries is a string instead of array', () => {
    const payload = JSON.stringify({ entries: 'not-array' });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('returns empty cache when entries is a number', () => {
    const payload = JSON.stringify({ entries: 42 });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with missing code field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with missing result field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'int x;', dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with non-string code field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 123, result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with non-array dependencies', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'int x;', result: { errors: 0 }, dependencies: 'bad', timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with non-string items in dependencies', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'int x;', result: { errors: 0 }, dependencies: [42], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with non-number timestamp', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: {
            code: 'int x;',
            result: { errors: 0 },
            dependencies: [],
            timestamp: 'not-a-number',
          },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with missing uri field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          entry: { code: 'int x;', result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries with non-string uri field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 12345,
          entry: { code: 'int x;', result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('keeps valid entries and skips invalid ones in mixed payload', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///valid.pike',
          entry: { code: 'int x;', result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
        {
          uri: 'file:///missing-code.pike',
          entry: { result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
        {
          uri: 'file:///also-valid.pike',
          entry: {
            code: 'int y;',
            result: { errors: 2 },
            dependencies: ['file:///valid.pike'],
            timestamp: 200,
          },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 2);

    const valid = cache.get('file:///valid.pike', 'int x;');
    assert.ok(valid);
    assert.deepStrictEqual(valid.result, { errors: 0 });

    const alsoValid = cache.get('file:///also-valid.pike', 'int y;');
    assert.ok(alsoValid);
    assert.deepStrictEqual(alsoValid.result, { errors: 2 });
  });

  it('restores dependency edges visible in getStats after deserialization', () => {
    const cache = new CompilationCache<TestResult>(makeOptions());
    cache.store(
      'file:///a.pike',
      'int a;',
      { errors: 0 },
      ['file:///b.pike', 'file:///c.pike'],
      100
    );
    cache.store('file:///b.pike', 'int b;', { errors: 0 }, ['file:///c.pike'], 200);
    cache.store('file:///c.pike', 'int c;', { errors: 0 }, [], 300);

    const originalStats = cache.getStats();

    const serialized = cache.serialize();
    const restored = CompilationCache.deserialize<TestResult>(serialized, makeOptions());
    const restoredStats = restored.getStats();

    assert.strictEqual(restoredStats.trackedFiles, originalStats.trackedFiles);
    assert.strictEqual(restoredStats.trackedDependencyEdges, originalStats.trackedDependencyEdges);
    assert.strictEqual(restoredStats.trackedFiles, 2); // a and b have dependencies
    assert.strictEqual(restoredStats.trackedDependencyEdges, 3); // a->b, a->c, b->c
  });

  it('returns empty cache for empty entries array', () => {
    const payload = JSON.stringify({ entries: [] });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('returns empty cache for null top-level value', () => {
    const payload = 'null';
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 0);
  });

  it('skips entries when validateResult returns true for valid result', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'int x;', result: { errors: 0 }, dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, {
      maxSize: 100,
      validateResult: (r: unknown) =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as Record<string, unknown>)['errors'] === 'number',
    });
    assert.strictEqual(cache.size, 1);
    const entry = cache.get('file:///a.pike', 'int x;');
    assert.ok(entry);
    assert.deepStrictEqual(entry.result, { errors: 0 });
  });

  it('skips entries with corrupted result shape when validateResult rejects them', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'int x;', result: 'not-an-object', dependencies: [], timestamp: 100 },
        },
        {
          uri: 'file:///b.pike',
          entry: { code: 'int y;', result: { errors: 0 }, dependencies: [], timestamp: 200 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, {
      maxSize: 100,
      validateResult: (r: unknown) => typeof r === 'object' && r !== null && 'errors' in r,
    });
    assert.strictEqual(cache.size, 1);
    const entry = cache.get('file:///b.pike', 'int y;');
    assert.ok(entry);
    assert.deepStrictEqual(entry.result, { errors: 0 });
  });

  it('accepts all entries when validateResult is not provided', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'int x;', result: { corrupt: true }, dependencies: [], timestamp: 100 },
        },
      ],
    });
    const cache = CompilationCache.deserialize<TestResult>(payload, makeOptions());
    assert.strictEqual(cache.size, 1);
  });
});
