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
