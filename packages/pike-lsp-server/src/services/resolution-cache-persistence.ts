import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Logger } from '@pike-lsp/core';

const log = new Logger('ResolutionCachePersistence');

const CACHE_DIR_NAME = 'pike-lsp';
const CACHE_FILE_NAME = 'resolution-cache.json';
const CACHE_SCHEMA_VERSION = 1;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface PersistedCache {
  version: number;
  pikeVersion?: string;
  timestamp: number;
  data: string;
}

function getCacheDir(): string {
  const xdgCache = process.env['XDG_CACHE_HOME'];
  const baseDir = xdgCache || path.join(os.homedir(), '.cache');
  return path.join(baseDir, CACHE_DIR_NAME);
}

function getCacheFilePath(): string {
  return path.join(getCacheDir(), CACHE_FILE_NAME);
}

function isEnoentError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export async function saveResolutionCache(
  serializedData: string,
  pikeVersion?: string
): Promise<void> {
  const cacheFile = getCacheFilePath();

  try {
    const cacheDir = getCacheDir();
    await fs.promises.mkdir(cacheDir, { recursive: true });

    const payload: PersistedCache = {
      version: CACHE_SCHEMA_VERSION,
      timestamp: Date.now(),
      data: serializedData,
    };
    if (pikeVersion) {
      payload.pikeVersion = pikeVersion;
    }

    await fs.promises.writeFile(cacheFile, JSON.stringify(payload), 'utf-8');

    log.debug('Resolution cache saved', {
      path: cacheFile,
      pikeVersion,
      sizeBytes: JSON.stringify(payload).length,
    });
  } catch (error) {
    log.warn('Failed to save resolution cache', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function loadResolutionCache(currentPikeVersion?: string): Promise<string | null> {
  const cacheFile = getCacheFilePath();

  try {
    const content = await fs.promises.readFile(cacheFile, 'utf-8');
    const parsed = JSON.parse(content) as unknown;

    if (typeof parsed !== 'object' || parsed === null) {
      log.debug('Resolution cache has invalid format, discarding');
      return null;
    }

    const cache = parsed as Record<string, unknown>;

    if (cache['version'] !== CACHE_SCHEMA_VERSION) {
      log.debug('Resolution cache version mismatch, discarding', {
        expected: CACHE_SCHEMA_VERSION,
        found: cache['version'],
      });
      return null;
    }

    if (
      typeof cache['pikeVersion'] === 'string' &&
      currentPikeVersion &&
      cache['pikeVersion'] !== currentPikeVersion
    ) {
      log.debug('Resolution cache Pike version mismatch, discarding', {
        cached: cache['pikeVersion'],
        current: currentPikeVersion,
      });
      return null;
    }

    if (typeof cache['timestamp'] === 'number') {
      const age = Date.now() - cache['timestamp'];
      if (age > MAX_CACHE_AGE_MS) {
        log.debug('Resolution cache expired, discarding', {
          ageDays: Math.floor(age / (24 * 60 * 60 * 1000)),
        });
        return null;
      }
    }

    if (typeof cache['data'] !== 'string') {
      log.debug('Resolution cache has invalid data field, discarding');
      return null;
    }

    log.debug('Resolution cache loaded', {
      path: cacheFile,
      pikeVersion: cache['pikeVersion'],
      ageDays:
        typeof cache['timestamp'] === 'number'
          ? Math.floor((Date.now() - cache['timestamp']) / (24 * 60 * 60 * 1000))
          : 'unknown',
    });

    return cache['data'];
  } catch (error) {
    if (isEnoentError(error)) {
      log.debug('No resolution cache file found (first run)');
    } else {
      log.warn('Failed to load resolution cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

export async function deleteResolutionCache(): Promise<void> {
  const cacheFile = getCacheFilePath();
  try {
    await fs.promises.unlink(cacheFile);
  } catch (error) {
    if (isEnoentError(error)) {
      log.debug('Resolution cache file not found (already deleted or first run)');
    } else {
      log.warn('Failed to delete resolution cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
