/**
 * Resolution cache validation and error recovery paths (#1747)
 *
 * Tests loadResolutionCache() validation branches:
 * - wrong schema version
 * - pike version mismatch
 * - expired cache
 * - invalid data field type
 * - non-object parse result
 * - missing data field
 * - ENOENT returns null
 * - valid cache returns data
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadResolutionCache,
  saveResolutionCache,
  deleteResolutionCache,
} from '../services/resolution-cache-persistence.js';

const CACHE_SCHEMA_VERSION = 1;

async function withTempCacheHome(run: (cacheHome: string) => Promise<void>): Promise<void> {
  const previous = process.env['XDG_CACHE_HOME'];
  const cacheHome = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pike-lsp-cache-test-'));
  process.env['XDG_CACHE_HOME'] = cacheHome;
  try {
    await run(cacheHome);
  } finally {
    await fs.promises.rm(cacheHome, { recursive: true, force: true });
    if (previous === undefined) {
      delete process.env['XDG_CACHE_HOME'];
    } else {
      process.env['XDG_CACHE_HOME'] = previous;
    }
  }
}

function writeCacheFile(cacheHome: string, content: string): Promise<void> {
  const cacheDir = path.join(cacheHome, 'pike-lsp');
  const cacheFile = path.join(cacheDir, 'resolution-cache.json');
  return fs.promises
    .mkdir(cacheDir, { recursive: true })
    .then(() => fs.promises.writeFile(cacheFile, content, 'utf-8'));
}

function makeValidCache(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: CACHE_SCHEMA_VERSION,
    timestamp: Date.now(),
    data: '{"resolved":true}',
    ...overrides,
  });
}

describe('Resolution cache validation and error recovery', () => {
  it('ENOENT returns null without error', async () => {
    await withTempCacheHome(async () => {
      // No cache file written — loadResolutionCache should return null gracefully
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('non-JSON content returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, '{{{{not json');
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('wrong schema version returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, makeValidCache({ version: 999 }));
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('pike version mismatch returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, makeValidCache({ pikeVersion: '8.0.1000' }));
      const result = await loadResolutionCache('8.0.1200');
      assert.strictEqual(result, null);
    });
  });

  it('expired timestamp returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      await writeCacheFile(cacheHome, makeValidCache({ timestamp: eightDaysAgo }));
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('missing data field returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(
        cacheHome,
        JSON.stringify({
          version: CACHE_SCHEMA_VERSION,
          timestamp: Date.now(),
        })
      );
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('non-string data field returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, makeValidCache({ data: 42 }));
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('non-object parse result returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, '"just a string"');
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('array parse result returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, '[1, 2, 3]');
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('null parse result returns null', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, 'null');
      const result = await loadResolutionCache();
      assert.strictEqual(result, null);
    });
  });

  it('valid cache returns data string', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, makeValidCache());
      const result = await loadResolutionCache();
      assert.strictEqual(result, '{"resolved":true}');
    });
  });

  it('valid cache with matching pike version returns data', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, makeValidCache({ pikeVersion: '8.0.1200' }));
      const result = await loadResolutionCache('8.0.1200');
      assert.strictEqual(result, '{"resolved":true}');
    });
  });

  it('save and load round-trip preserves data', async () => {
    await withTempCacheHome(async () => {
      const data = JSON.stringify({ stdlibCache: { 'Stdio.File': { found: 1 } }, moduleCache: {} });
      await saveResolutionCache(data, '8.0.1116');
      const loaded = await loadResolutionCache('8.0.1116');
      assert.strictEqual(loaded, data);
    });
  });

  it('deleteResolutionCache causes subsequent load to return null', async () => {
    await withTempCacheHome(async () => {
      await saveResolutionCache('{"test":true}', '8.0.1116');
      const before = await loadResolutionCache('8.0.1116');
      assert.ok(before);

      await deleteResolutionCache();
      const after = await loadResolutionCache('8.0.1116');
      assert.strictEqual(after, null);
    });
  });

  it('pike version mismatch when cache has version but caller does not still loads', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(cacheHome, makeValidCache({ pikeVersion: '8.0.1116' }));
      // caller passes no pikeVersion — should not trigger mismatch check
      const result = await loadResolutionCache();
      assert.strictEqual(result, '{"resolved":true}');
    });
  });

  it('missing timestamp field does not reject cache', async () => {
    await withTempCacheHome(async cacheHome => {
      await writeCacheFile(
        cacheHome,
        JSON.stringify({
          version: CACHE_SCHEMA_VERSION,
          data: '{"no-ts":true}',
        })
      );
      const result = await loadResolutionCache();
      assert.strictEqual(result, '{"no-ts":true}');
    });
  });
});
