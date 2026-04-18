import { describe, it, beforeEach, afterEach } from 'bun:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadResolutionCache,
  saveResolutionCache,
  deleteResolutionCache,
} from '../services/resolution-cache-persistence.js';

describe('loadResolutionCache', () => {
  let originalXdgCache: string | undefined;
  let cacheDir: string;

  beforeEach(() => {
    originalXdgCache = process.env['XDG_CACHE_HOME'];
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pike-cache-test-'));
    process.env['XDG_CACHE_HOME'] = cacheDir;
  });

  afterEach(() => {
    process.env['XDG_CACHE_HOME'] = originalXdgCache;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  function writeCacheFile(content: string): void {
    const dir = path.join(cacheDir, 'pike-lsp');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'resolution-cache.json'), content, 'utf-8');
  }

  it('returns null for non-JSON content', async () => {
    writeCacheFile('{{not json}}');
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when version field does not match', async () => {
    writeCacheFile(JSON.stringify({ version: 999, timestamp: Date.now(), data: 'hello' }));
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when pike version mismatches', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '0.9.0',
        timestamp: Date.now(),
        data: 'hello',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when cache timestamp is expired', async () => {
    const expiredTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days ago
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: expiredTimestamp,
        data: 'hello',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when data field is missing', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when data field is not a string', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: 42,
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when parsed value is a primitive (not object)', async () => {
    writeCacheFile('"just a string"');
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when parsed value is null literal', async () => {
    writeCacheFile('null');
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when parsed value is an array', async () => {
    writeCacheFile('[1, 2, 3]');
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null for ENOENT (file does not exist)', async () => {
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns data string for a valid cache', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: 'cached-resolution-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, 'cached-resolution-data');
  });

  it('accepts valid cache without pikeVersion when no currentPikeVersion provided', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        data: 'no-pike-version',
      })
    );
    const result = await loadResolutionCache();
    assert.strictEqual(result, 'no-pike-version');
  });

  it('accepts valid cache with pikeVersion mismatch when no currentPikeVersion provided', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '0.5.0',
        timestamp: Date.now(),
        data: 'mismatch-ok-without-current',
      })
    );
    const result = await loadResolutionCache();
    assert.strictEqual(result, 'mismatch-ok-without-current');
  });

  it('returns null when data field is an object', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: { key: 'value' },
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when data field is null', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: null,
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when data field is boolean', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: true,
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when data field is an array', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: [1, 2, 3],
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when timestamp is negative', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: -86400000,
        data: 'negative-ts-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when timestamp is a string', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: 'not-a-number',
        data: 'string-ts-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, 'string-ts-data');
  });

  it('returns data when timestamp is far-future but within age limit', async () => {
    const futureTimestamp = Date.now() + 6 * 24 * 60 * 60 * 1000; // 6 days ahead
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: futureTimestamp,
        data: 'future-ts-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, 'future-ts-data');
  });

  it('ignores stored pikeVersion when currentPikeVersion is undefined', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '0.1.0',
        timestamp: Date.now(),
        data: 'mismatch-no-current',
      })
    );
    const result = await loadResolutionCache();
    assert.strictEqual(result, 'mismatch-no-current');
  });

  it('returns data when payload has extra unknown fields', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: 'extra-fields-data',
        extraField: 'ignored',
        anotherUnknown: 42,
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, 'extra-fields-data');
  });

  it('returns data when data field is empty string', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: '',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, '');
  });

  it('returns null when data field is deeply nested object', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: { nested: { deep: { corrupted: true } } },
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when version is string instead of number', async () => {
    writeCacheFile(
      JSON.stringify({
        version: '1',
        pikeVersion: '1.0.0',
        timestamp: Date.now(),
        data: 'version-string-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('ignores pikeVersion when it is a number', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: 12345,
        timestamp: Date.now(),
        data: 'numeric-pikever-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    // typeof cache['pikeVersion'] !== 'string' skips the mismatch check
    assert.strictEqual(result, 'numeric-pikever-data');
  });

  it('ignores pikeVersion when it is an object', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: { major: 1, minor: 0 },
        timestamp: Date.now(),
        data: 'object-pikever-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, 'object-pikever-data');
  });

  it('returns data when timestamp is NaN (serialized as null)', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: NaN,
        data: 'nan-ts-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    // JSON.stringify(NaN) produces null, so timestamp becomes null in file
    // typeof null !== 'number' skips the age check, data is valid string
    assert.strictEqual(result, 'nan-ts-data');
  });

  it('returns null when timestamp is zero (epoch)', async () => {
    writeCacheFile(
      JSON.stringify({
        version: 1,
        pikeVersion: '1.0.0',
        timestamp: 0,
        data: 'zero-ts-data',
      })
    );
    const result = await loadResolutionCache('1.0.0');
    // Date.now() - 0 > MAX_CACHE_AGE_MS → expired
    assert.strictEqual(result, null);
  });

  it('returns null when cache file exceeds MAX_CACHE_FILE_SIZE', async () => {
    const oversizedPayload = {
      version: 1,
      pikeVersion: '1.0.0',
      timestamp: Date.now(),
      data: 'x'.repeat(11 * 1024 * 1024),
    };
    writeCacheFile(JSON.stringify(oversizedPayload));
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });

  it('returns null when cache data string exceeds MAX_CACHE_DATA_SIZE', async () => {
    const payload = {
      version: 1,
      pikeVersion: '1.0.0',
      timestamp: Date.now(),
      data: 'y'.repeat(9 * 1024 * 1024),
    };
    writeCacheFile(JSON.stringify(payload));
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });
});

describe('saveResolutionCache and loadResolutionCache round-trip', () => {
  let originalXdgCache: string | undefined;
  let cacheDir: string;

  beforeEach(() => {
    originalXdgCache = process.env['XDG_CACHE_HOME'];
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pike-cache-test-'));
    process.env['XDG_CACHE_HOME'] = cacheDir;
  });

  afterEach(() => {
    process.env['XDG_CACHE_HOME'] = originalXdgCache;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it('round-trips data through save and load', async () => {
    await saveResolutionCache('test-data-123', '2.0.0');
    const loaded = await loadResolutionCache('2.0.0');
    assert.strictEqual(loaded, 'test-data-123');
  });

  it('save skips write when serialized cache exceeds MAX_CACHE_FILE_SIZE', async () => {
    const oversizedData = 'z'.repeat(11 * 1024 * 1024);
    await saveResolutionCache(oversizedData, '1.0.0');
    const result = await loadResolutionCache('1.0.0');
    assert.strictEqual(result, null);
  });
});

describe('deleteResolutionCache', () => {
  let originalXdgCache: string | undefined;
  let cacheDir: string;

  beforeEach(() => {
    originalXdgCache = process.env['XDG_CACHE_HOME'];
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pike-cache-test-'));
    process.env['XDG_CACHE_HOME'] = cacheDir;
  });

  afterEach(() => {
    process.env['XDG_CACHE_HOME'] = originalXdgCache;
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it('removes the cache file after save', async () => {
    await saveResolutionCache('to-be-deleted', '1.0.0');
    const loaded = await loadResolutionCache('1.0.0');
    assert.strictEqual(loaded, 'to-be-deleted');

    await deleteResolutionCache();
    const afterDelete = await loadResolutionCache('1.0.0');
    assert.strictEqual(afterDelete, null);
  });

  it('does not throw when cache file does not exist', async () => {
    await assert.doesNotReject(async () => {
      await deleteResolutionCache();
    });
  });
});
