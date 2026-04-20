import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { DocumentCacheEntry } from '../core/types.js';
import {
  DocumentCache,
  computeContentHash,
  computeLineHashes,
  computeSemanticLineHash,
  stripLineComments,
} from '../services/document-cache.js';

function makeEntry(overrides?: Partial<DocumentCacheEntry>): DocumentCacheEntry {
  return {
    version: 1,
    symbols: [],
    diagnostics: [],
    symbolPositions: new Map(),
    symbolNames: new Map(),
    ...overrides,
  };
}

describe('computeContentHash', () => {
  it('returns deterministic hex string for same input', () => {
    const h1 = computeContentHash('hello world');
    const h2 = computeContentHash('hello world');
    assert.strictEqual(h1, h2);
  });

  it('returns 8-character hex string', () => {
    const h = computeContentHash('test');
    assert.strictEqual(h.length, 8);
    assert.ok(/^[0-9a-f]{8}$/.test(h), `Expected hex, got: ${h}`);
  });

  it('produces different hashes for different inputs', () => {
    const inputs = ['foo', 'bar', 'baz', 'foo\nbar', 'foo\nbaz'];
    const hashes = new Set(inputs.map(computeContentHash));
    // At minimum, 'foo'/'bar'/'baz' must all differ
    assert.ok(hashes.size >= 3, `Expected at least 3 distinct hashes, got ${hashes.size}`);
  });

  it('handles empty string', () => {
    const h = computeContentHash('');
    assert.strictEqual(h.length, 8);
    assert.ok(/^[0-9a-f]{8}$/.test(h));
  });

  it('handles unicode content', () => {
    const h1 = computeContentHash('café résumé');
    const h2 = computeContentHash('cafe resume');
    assert.notStrictEqual(h1, h2);
  });

  it('handles large content without error', () => {
    const big = 'x'.repeat(100_000);
    const h = computeContentHash(big);
    assert.strictEqual(h.length, 8);
  });
});

describe('computeLineHashes', () => {
  it('returns one hash per line', () => {
    const lines = ['a', 'b', 'c'];
    const hashes = computeLineHashes(lines.join('\n'));
    assert.strictEqual(hashes.length, 3);
  });

  it('handles empty string (single element for split)', () => {
    const hashes = computeLineHashes('');
    assert.strictEqual(hashes.length, 1);
  });

  it('handles trailing newline', () => {
    const hashes = computeLineHashes('a\nb\n');
    // 'a\nb\n'.split('\n') => ['a', 'b', '']
    assert.strictEqual(hashes.length, 3);
  });

  it('is deterministic', () => {
    const content = 'int x;\nint y;';
    assert.deepStrictEqual(computeLineHashes(content), computeLineHashes(content));
  });

  it('produces same hash for lines differing only in comments', () => {
    const content = 'int x; // foo\nint x; // bar';
    const hashes = computeLineHashes(content);
    assert.strictEqual(hashes[0], hashes[1]);
  });
});

describe('stripLineComments', () => {
  it('strips // comment from end of line', () => {
    assert.strictEqual(stripLineComments('int x; // assign'), 'int x;');
  });

  it('trims whitespace', () => {
    assert.strictEqual(stripLineComments('  int x;  '), 'int x;');
  });

  it('returns empty string for comment-only line', () => {
    assert.strictEqual(stripLineComments('  // just a comment  '), '');
  });

  it('returns empty string for whitespace-only line', () => {
    assert.strictEqual(stripLineComments('   '), '');
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(stripLineComments(''), '');
  });

  it('passes through line with no comment marker', () => {
    assert.strictEqual(stripLineComments('int x = 42;'), 'int x = 42;');
  });

  it('known bug: does not handle // inside string literals', () => {
    // This documents the existing bug — stripLineComments blindly strips
    // after the first // even inside a string literal.
    // The result should be 'string s = "hello // world";' but the current
    // implementation returns 'string s = "hello '.
    const result = stripLineComments('string s = "hello // world";');
    assert.strictEqual(result, 'string s = "hello');
  });
});

describe('computeSemanticLineHash', () => {
  it('is deterministic', () => {
    const h1 = computeSemanticLineHash('int x;');
    const h2 = computeSemanticLineHash('int x;');
    assert.strictEqual(h1, h2);
  });

  it('ignores trailing comments', () => {
    const h1 = computeSemanticLineHash('int x; // a');
    const h2 = computeSemanticLineHash('int x; // b');
    assert.strictEqual(h1, h2);
  });

  it('ignores leading/trailing whitespace', () => {
    const h1 = computeSemanticLineHash('int x;');
    const h2 = computeSemanticLineHash('  int x;  ');
    assert.strictEqual(h1, h2);
  });

  it('returns positive 32-bit unsigned integer', () => {
    const h = computeSemanticLineHash('test');
    assert.ok(Number.isInteger(h), 'Expected integer');
    assert.ok(h >= 0 && h <= 0xffffffff, `Expected u32, got: ${h}`);
  });
});

describe('DocumentCache', () => {
  it('set/get/has lifecycle', () => {
    const cache = new DocumentCache();
    const entry = makeEntry();
    cache.set('file:///test.pike', entry);

    assert.strictEqual(cache.has('file:///test.pike'), true);
    assert.strictEqual(cache.get('file:///test.pike'), entry);
    assert.strictEqual(cache.size, 1);
  });

  it('delete removes entry', () => {
    const cache = new DocumentCache();
    cache.set('file:///a.pike', makeEntry());

    assert.strictEqual(cache.delete('file:///a.pike'), true);
    assert.strictEqual(cache.has('file:///a.pike'), false);
    assert.strictEqual(cache.get('file:///a.pike'), undefined);
    assert.strictEqual(cache.size, 0);
  });

  it('delete returns false for missing entry', () => {
    const cache = new DocumentCache();
    assert.strictEqual(cache.delete('file:///nope.pike'), false);
  });

  it('get returns undefined for missing entry', () => {
    const cache = new DocumentCache();
    assert.strictEqual(cache.get('file:///nope.pike'), undefined);
  });

  it('clear removes all entries', () => {
    const cache = new DocumentCache();
    cache.set('file:///a.pike', makeEntry());
    cache.set('file:///b.pike', makeEntry());
    assert.strictEqual(cache.size, 2);

    cache.clear();
    assert.strictEqual(cache.size, 0);
    assert.strictEqual(cache.has('file:///a.pike'), false);
  });

  it('entries and keys iterate correctly', () => {
    const cache = new DocumentCache();
    const e1 = makeEntry({ version: 1 });
    const e2 = makeEntry({ version: 2 });
    cache.set('file:///a.pike', e1);
    cache.set('file:///b.pike', e2);

    const keys = [...cache.keys()];
    assert.deepStrictEqual(keys.sort(), ['file:///a.pike', 'file:///b.pike']);

    const entries = [...cache.entries()];
    assert.strictEqual(entries.length, 2);
    const map = new Map(entries);
    assert.strictEqual(map.get('file:///a.pike')!.version, 1);
    assert.strictEqual(map.get('file:///b.pike')!.version, 2);
  });

  it('set overwrites previous entry', () => {
    const cache = new DocumentCache();
    cache.set('file:///a.pike', makeEntry({ version: 1 }));
    cache.set('file:///a.pike', makeEntry({ version: 2 }));

    assert.strictEqual(cache.size, 1);
    assert.strictEqual(cache.get('file:///a.pike')!.version, 2);
  });

  it('waitFor resolves immediately when nothing pending', async () => {
    const cache = new DocumentCache();
    // Should not throw or hang
    await cache.waitFor('file:///nope.pike');
  });

  it('waitFor resolves after pending promise completes', async () => {
    const cache = new DocumentCache();
    let resolved = false;
    const p = new Promise<void>(r => {
      setTimeout(() => {
        resolved = true;
        r();
      }, 10);
    });

    cache.setPending('file:///test.pike', p);
    await cache.waitFor('file:///test.pike');
    assert.ok(resolved);
  });

  it('setPending auto-cleans after resolution', async () => {
    const cache = new DocumentCache();
    const p = Promise.resolve();
    cache.setPending('file:///test.pike', p);

    await cache.waitFor('file:///test.pike');
    // Give microtask queue a chance to run the .finally callback
    await new Promise(r => setTimeout(r, 0));
    // After resolution, waitFor should resolve immediately (no pending)
    await cache.waitFor('file:///test.pike');
  });

  it('waitFor swallows errors from failed pending promises', async () => {
    const cache = new DocumentCache();
    const p = Promise.reject(new Error('boom')).catch(() => {});
    cache.setPending('file:///test.pike', p);

    // Should not throw
    await cache.waitFor('file:///test.pike');
  });
});

describe('DocumentCache LRU eviction', () => {
  it('evicts oldest entry when maxSize exceeded', () => {
    const cache = new DocumentCache(3);
    cache.set('file:///a.pike', makeEntry({ version: 1 }));
    cache.set('file:///b.pike', makeEntry({ version: 2 }));
    cache.set('file:///c.pike', makeEntry({ version: 3 }));
    cache.set('file:///d.pike', makeEntry({ version: 4 }));

    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.get('file:///a.pike'), undefined);
    assert.strictEqual(cache.get('file:///b.pike')!.version, 2);
    assert.strictEqual(cache.get('file:///d.pike')!.version, 4);
  });

  it('get() refreshes LRU position', () => {
    const cache = new DocumentCache(3);
    cache.set('file:///a.pike', makeEntry({ version: 1 }));
    cache.set('file:///b.pike', makeEntry({ version: 2 }));
    cache.set('file:///c.pike', makeEntry({ version: 3 }));

    // Refresh 'a' to most-recent
    cache.get('file:///a.pike');

    // Add 4th entry — should evict 'b' (now oldest)
    cache.set('file:///d.pike', makeEntry({ version: 4 }));

    assert.strictEqual(cache.get('file:///b.pike'), undefined);
    assert.strictEqual(cache.get('file:///a.pike')!.version, 1);
  });

  it('default maxSize accepts 2000 entries without eviction', () => {
    const cache = new DocumentCache();
    for (let i = 0; i < 2000; i++) {
      cache.set(`file:///${i}.pike`, makeEntry());
    }
    assert.strictEqual(cache.size, 2000);
    assert.ok(cache.has('file:///0.pike'));
    assert.ok(cache.has('file:///1999.pike'));
  });

  it('custom maxSize constrains cache', () => {
    const cache = new DocumentCache(5);
    for (let i = 0; i < 7; i++) {
      cache.set(`file:///${i}.pike`, makeEntry());
    }
    assert.strictEqual(cache.size, 5);
    // First 2 should have been evicted
    assert.strictEqual(cache.has('file:///0.pike'), false);
    assert.strictEqual(cache.has('file:///1.pike'), false);
    // Last 5 remain
    assert.ok(cache.has('file:///2.pike'));
    assert.ok(cache.has('file:///6.pike'));
  });

  it('entries() reflects post-eviction state', () => {
    const cache = new DocumentCache(2);
    cache.set('file:///a.pike', makeEntry({ version: 1 }));
    cache.set('file:///b.pike', makeEntry({ version: 2 }));
    cache.set('file:///c.pike', makeEntry({ version: 3 }));

    const entries = Array.from(cache.entries());
    const keys = entries.map(([k]) => k).sort();
    assert.deepStrictEqual(keys, ['file:///b.pike', 'file:///c.pike']);
  });

  it('overwriting existing key does not evict', () => {
    const cache = new DocumentCache(3);
    cache.set('file:///a.pike', makeEntry({ version: 1 }));
    cache.set('file:///b.pike', makeEntry({ version: 2 }));
    cache.set('file:///c.pike', makeEntry({ version: 3 }));

    const newEntry = makeEntry({ version: 99 });
    cache.set('file:///a.pike', newEntry);

    assert.strictEqual(cache.size, 3);
    assert.strictEqual(cache.get('file:///a.pike')!.version, 99);
    assert.strictEqual(cache.get('file:///b.pike')!.version, 2);
  });
});
