import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We need to import the module under test to test behavior
// Since isEnoentError is private, we test through the public API

describe('ResolutionCachePersistence', () => {
  const originalReadFile = fs.promises.readFile;
  const originalUnlink = fs.promises.unlink;
  const originalWriteFile = fs.promises.writeFile;
  const originalMkdir = fs.promises.mkdir;

  afterEach(() => {
    fs.promises.readFile = originalReadFile;
    fs.promises.unlink = originalUnlink;
    fs.promises.writeFile = originalWriteFile;
    fs.promises.mkdir = originalMkdir;
  });

  describe('loadResolutionCache - ENOENT handling', () => {
    it('should return null silently when file does not exist (ENOENT)', async () => {
      const enoentErr = new Error('ENOENT: no such file');
      Object.defineProperty(enoentErr, 'code', { value: 'ENOENT' });
      fs.promises.readFile = mock(async () => {
        throw enoentErr;
      });

      // Dynamic import to get fresh module
      const { loadResolutionCache } =
        await import('../../services/resolution-cache-persistence.js');
      const result = await loadResolutionCache();
      expect(result).toBeNull();
    });

    it('should return null for non-ENOENT errors (generic Error)', async () => {
      const genericErr = new Error('permission denied');
      // No 'code' property - simulates a non-ErrnoException error
      fs.promises.readFile = mock(async () => {
        throw genericErr;
      });

      const { loadResolutionCache } =
        await import('../../services/resolution-cache-persistence.js');
      const result = await loadResolutionCache();
      // Should still return null, but should NOT be treated as ENOENT
      expect(result).toBeNull();
    });

    it('should return null for non-Error throws (e.g. string)', async () => {
      fs.promises.readFile = mock(async () => {
        throw 'unexpected string error';
      });

      const { loadResolutionCache } =
        await import('../../services/resolution-cache-persistence.js');
      const result = await loadResolutionCache();
      expect(result).toBeNull();
    });

    it('should return null for ENOENT with code but not instanceof Error', async () => {
      // Object with code ENOENT but not an Error instance
      const notAnError = { code: 'ENOENT', message: 'fake' };
      fs.promises.readFile = mock(async () => {
        throw notAnError;
      });

      const { loadResolutionCache } =
        await import('../../services/resolution-cache-persistence.js');
      const result = await loadResolutionCache();
      // Should NOT treat as ENOENT since it's not an Error instance
      expect(result).toBeNull();
    });
  });

  describe('deleteResolutionCache - ENOENT handling', () => {
    it('should not throw when file does not exist (ENOENT)', async () => {
      const enoentErr = new Error('ENOENT: no such file');
      Object.defineProperty(enoentErr, 'code', { value: 'ENOENT' });
      fs.promises.unlink = mock(async () => {
        throw enoentErr;
      });

      const { deleteResolutionCache } =
        await import('../../services/resolution-cache-persistence.js');
      // Should not throw
      await expect(deleteResolutionCache()).resolves.toBeUndefined();
    });

    it('should not throw for non-ENOENT errors', async () => {
      const permErr = new Error('EACCES: permission denied');
      Object.defineProperty(permErr, 'code', { value: 'EACCES' });
      fs.promises.unlink = mock(async () => {
        throw permErr;
      });

      const { deleteResolutionCache } =
        await import('../../services/resolution-cache-persistence.js');
      await expect(deleteResolutionCache()).resolves.toBeUndefined();
    });
  });
});
