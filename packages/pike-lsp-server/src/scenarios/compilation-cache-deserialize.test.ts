import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { CompilationCache } from '../services/compilation-cache.js';
import type { CompilationCacheOptions } from '../services/compilation-cache.js';

const defaultOptions: CompilationCacheOptions<string> = { maxSize: 100 };

describe('CompilationCache.deserialize', () => {
  it('round-trips through serialize and deserialize', () => {
    const original = new CompilationCache<string>(defaultOptions);
    original.store('file:///a.pike', 'code-a', 'result-a', ['file:///b.pike'], 1000);
    original.store('file:///b.pike', 'code-b', 'result-b', [], 2000);

    const serialized = original.serialize();
    const restored = CompilationCache.deserialize<string>(serialized, defaultOptions);

    assert.strictEqual(restored.size, 2);
    assert.strictEqual(restored.get('file:///a.pike', 'code-a')?.result, 'result-a');
    assert.strictEqual(restored.get('file:///b.pike', 'code-b')?.result, 'result-b');
  });

  it('restores dependency edges visible in getStats after deserialize', () => {
    const original = new CompilationCache<string>(defaultOptions);
    original.store(
      'file:///a.pike',
      'code-a',
      'result-a',
      ['file:///b.pike', 'file:///c.pike'],
      1000
    );
    original.store('file:///b.pike', 'code-b', 'result-b', ['file:///c.pike'], 2000);

    const serialized = original.serialize();
    const restored = CompilationCache.deserialize<string>(serialized, defaultOptions);

    const stats = restored.getStats();
    assert.strictEqual(stats.trackedFiles, 2);
    assert.strictEqual(stats.trackedDependencyEdges, 3);
  });

  it('returns empty cache for malformed JSON', () => {
    const result = CompilationCache.deserialize<string>('not json{{', defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache for non-JSON string', () => {
    const result = CompilationCache.deserialize<string>('just some random text', defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache for JSON primitive (string)', () => {
    const result = CompilationCache.deserialize<string>('"just a string"', defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache for JSON null', () => {
    const result = CompilationCache.deserialize<string>('null', defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache for JSON array', () => {
    const result = CompilationCache.deserialize<string>('[1,2,3]', defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache for empty entries array', () => {
    const payload = JSON.stringify({ entries: [] });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache when entries is an object instead of array', () => {
    const payload = JSON.stringify({
      entries: { 'file:///a.pike': { uri: 'file:///a.pike', entry: {} } },
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache when entries is a string instead of array', () => {
    const payload = JSON.stringify({ entries: 'not-array' });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache when entries is a number', () => {
    const payload = JSON.stringify({ entries: 42 });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('returns empty cache when entries is missing', () => {
    const payload = JSON.stringify({ foo: 'bar' });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with missing code field', () => {
    const payload = JSON.stringify({
      entries: [{ uri: 'file:///a.pike', entry: { result: 'r', dependencies: [], timestamp: 1 } }],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with missing result field', () => {
    const payload = JSON.stringify({
      entries: [{ uri: 'file:///a.pike', entry: { code: 'c', dependencies: [], timestamp: 1 } }],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with non-string dependencies', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'r', dependencies: [42], timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with non-number timestamp', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'r', dependencies: [], timestamp: 'not-a-number' },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with non-string code field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 123, result: 'r', dependencies: [], timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with non-array dependencies', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'r', dependencies: 'bad', timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with missing uri field', () => {
    const payload = JSON.stringify({
      entries: [{ entry: { code: 'c', result: 'r', dependencies: [], timestamp: 1 } }],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips entry with non-string uri field', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 12345,
          entry: { code: 'c', result: 'r', dependencies: [], timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 0);
  });

  it('skips non-record entry and keeps valid entries', () => {
    const payload = JSON.stringify({
      entries: [
        'invalid-entry',
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'r', dependencies: [], timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 1);
    assert.strictEqual(result.get('file:///a.pike', 'c')?.result, 'r');
  });

  it('keeps valid entries and skips invalid ones in mixed payload', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///valid.pike',
          entry: { code: 'int x;', result: 'result-valid', dependencies: [], timestamp: 100 },
        },
        {
          uri: 'file:///missing-code.pike',
          entry: { result: 'r', dependencies: [], timestamp: 100 },
        },
        {
          uri: 'file:///also-valid.pike',
          entry: {
            code: 'int y;',
            result: 'result-also',
            dependencies: ['file:///valid.pike'],
            timestamp: 200,
          },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 2);

    const valid = result.get('file:///valid.pike', 'int x;');
    assert.ok(valid);
    assert.strictEqual(valid.result, 'result-valid');

    const alsoValid = result.get('file:///also-valid.pike', 'int y;');
    assert.ok(alsoValid);
    assert.strictEqual(alsoValid.result, 'result-also');
  });

  it('accepts all entries when validateResult is not provided', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'corrupt', dependencies: [], timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, defaultOptions);
    assert.strictEqual(result.size, 1);
  });

  it('keeps entries when validateResult accepts them', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'valid', dependencies: [], timestamp: 1 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, {
      maxSize: 100,
      validateResult: (r: unknown) => typeof r === 'string' && r.length > 0,
    });
    assert.strictEqual(result.size, 1);
    const entry = result.get('file:///a.pike', 'c');
    assert.ok(entry);
    assert.strictEqual(entry.result, 'valid');
  });

  it('skips entries when validateResult rejects them', () => {
    const payload = JSON.stringify({
      entries: [
        {
          uri: 'file:///a.pike',
          entry: { code: 'c', result: 'bad', dependencies: [], timestamp: 1 },
        },
        {
          uri: 'file:///b.pike',
          entry: { code: 'c', result: 'good', dependencies: [], timestamp: 2 },
        },
      ],
    });
    const result = CompilationCache.deserialize<string>(payload, {
      maxSize: 100,
      validateResult: (r: unknown) => typeof r === 'string' && r !== 'bad',
    });
    assert.strictEqual(result.size, 1);
    const entry = result.get('file:///b.pike', 'c');
    assert.ok(entry);
    assert.strictEqual(entry.result, 'good');
  });
});
