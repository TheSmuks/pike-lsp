import { describe, expect, it } from 'bun:test';
import {
  classifyBridgeStartupError,
  createVersionErrorDetails,
  formatBridgeStartupError,
} from '../../utils/bridge-startup-errors.js';

describe('classifyBridgeStartupError', () => {
  // =========================================================================
  // ENOENT — Pike not found
  // =========================================================================
  describe('pike-not-found', () => {
    it('classifies ENOENT with pike in path as pike-not-found', () => {
      const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      err.path = '/usr/local/bin/pike';

      const result = classifyBridgeStartupError(
        err,
        '/usr/local/bin/pike',
        '/path/to/analyzer.pike'
      );

      expect(result.kind).toBe('pike-not-found');
      expect(result.message).toContain('Pike executable not found');
      expect(result.suggestion).toContain('/usr/local/bin/pike');
      expect(result.pikePath).toBe('/usr/local/bin/pike');
      expect(result.diagnostic).toContain('ENOENT');
    });

    it('classifies ENOENT without path as pike-not-found', () => {
      const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';

      const result = classifyBridgeStartupError(err, 'pike', '/path/to/analyzer.pike');

      expect(result.kind).toBe('pike-not-found');
      expect(result.suggestion).toContain('pike');
    });
  });

  // =========================================================================
  // ENOENT — Analyzer script not found
  // =========================================================================
  describe('script-not-found', () => {
    it('classifies ENOENT with analyzer.pike in path as script-not-found', () => {
      const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      err.path = '/path/to/analyzer.pike';

      const result = classifyBridgeStartupError(err, '/usr/bin/pike', '/path/to/analyzer.pike');

      expect(result.kind).toBe('script-not-found');
      expect(result.message).toContain('analyzer script not found');
      expect(result.suggestion).toContain('/path/to/analyzer.pike');
      expect(result.scriptPath).toBe('/path/to/analyzer.pike');
    });
  });

  // =========================================================================
  // EACCES/EPERM — Permission denied
  // =========================================================================
  describe('pike-not-executable', () => {
    it('classifies EACCES with pike in path as pike-not-executable', () => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      err.path = '/usr/bin/pike';

      const result = classifyBridgeStartupError(err, '/usr/bin/pike');

      expect(result.kind).toBe('pike-not-executable');
      expect(result.message).toContain('permission denied');
      expect(result.suggestion).toContain('execute permission');
      expect(result.pikePath).toBe('/usr/bin/pike');
    });

    it('classifies EPERM as pike-not-executable', () => {
      const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
      err.code = 'EPERM';
      err.path = '/usr/bin/pike';

      const result = classifyBridgeStartupError(err, '/usr/bin/pike');

      expect(result.kind).toBe('pike-not-executable');
    });
  });

  describe('script-not-executable', () => {
    it('classifies EACCES with analyzer.pike in path as script-not-executable', () => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      err.path = '/path/to/analyzer.pike';

      const result = classifyBridgeStartupError(err, '/usr/bin/pike', '/path/to/analyzer.pike');

      expect(result.kind).toBe('script-not-executable');
      expect(result.message).toContain('permission denied');
      expect(result.suggestion).toContain('read and execute permissions');
    });
  });

  // =========================================================================
  // Pipe failure
  // =========================================================================
  describe('pipe-failure', () => {
    it('classifies pipe-related errors', () => {
      const err = new Error('Failed to create stdin/stdout pipes for Pike subprocess');

      const result = classifyBridgeStartupError(err);

      expect(result.kind).toBe('pipe-failure');
      expect(result.message).toContain('communication pipes');
      expect(result.suggestion).toContain('system resource limit');
    });
  });

  // =========================================================================
  // Timeout
  // =========================================================================
  describe('timeout', () => {
    it('classifies timeout errors', () => {
      const err = new Error('Pike subprocess startup timed out');

      const result = classifyBridgeStartupError(err);

      expect(result.kind).toBe('timeout');
      expect(result.message).toContain('timed out');
      expect(result.suggestion).toContain('timeout');
    });
  });

  // =========================================================================
  // Unknown
  // =========================================================================
  describe('unknown', () => {
    it('classifies non-Error objects as unknown', () => {
      const result = classifyBridgeStartupError('string error');

      expect(result.kind).toBe('unknown');
      expect(result.message).toContain('unknown error');
      expect(result.diagnostic).toBe('string error');
    });

    it('classifies unrecognized error codes as unknown', () => {
      const err = new Error('Some other error') as NodeJS.ErrnoException;
      err.code = 'SOMECODE';

      const result = classifyBridgeStartupError(err);

      expect(result.kind).toBe('unknown');
      expect(result.diagnostic).toBe('Some other error');
    });
  });
});

describe('createVersionErrorDetails', () => {
  it('creates error details for unsupported version', () => {
    const current = { major: 7, minor: 8, build: 123, string: 'Pike v7.8.123' };
    const required = { major: 8, minor: 0, build: 1116, string: 'Pike v8.0.1116' };

    const result = createVersionErrorDetails(current, required);

    expect(result.kind).toBe('version-unsupported');
    expect(result.message).toContain('not supported');
    expect(result.suggestion).toContain('8.0.1116 or higher');
    expect(result.suggestion).toContain('7.8.123');
    expect(result.currentVersion).toEqual(current);
    expect(result.requiredVersion).toEqual(required);
  });

  it('uses MIN_SUPPORTED_VERSION when required not provided', () => {
    const current = { major: 7, minor: 0, build: 0, string: 'Pike v7.0.0' };

    const result = createVersionErrorDetails(current);

    expect(result.kind).toBe('version-unsupported');
    expect(result.requiredVersion).toBeDefined();
    expect(result.requiredVersion?.major).toBe(8);
  });
});

describe('formatBridgeStartupError', () => {
  it('formats error with all fields', () => {
    const details = {
      kind: 'pike-not-found' as const,
      message: 'Pike not found',
      suggestion: 'Install Pike',
      diagnostic: 'ENOENT: spawn failed',
      pikePath: '/usr/bin/pike',
      scriptPath: '/path/to/analyzer.pike',
    };

    const result = formatBridgeStartupError(details);

    expect(result).toContain('[VALIDATE] Pike not found');
    expect(result).toContain('Suggestion: Install Pike');
    expect(result).toContain('Pike path: /usr/bin/pike');
    expect(result).toContain('Script path: /path/to/analyzer.pike');
    expect(result).toContain('Diagnostic: ENOENT: spawn failed');
  });

  it('formats error with minimal fields', () => {
    const details = {
      kind: 'unknown' as const,
      message: 'Unknown error',
      suggestion: 'Check logs',
    };

    const result = formatBridgeStartupError(details);

    expect(result).toContain('[VALIDATE] Unknown error');
    expect(result).toContain('Suggestion: Check logs');
    expect(result).not.toContain('Pike path:');
    expect(result).not.toContain('Script path:');
  });
});
