import { describe, expect, it } from 'bun:test';
import {
  classifyBridgeStartupError,
  formatBridgeStartupError,
} from '../utils/bridge-startup-errors.js';

describe('Bridge Startup Error Guidance - Scenarios', () => {
  describe('GIVEN user has Pike not installed', () => {
    it('WHEN bridge startup fails with ENOENT THEN provides installation guidance', () => {
      const err = new Error('spawn ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      err.path = 'pike';

      const details = classifyBridgeStartupError(err, 'pike');

      expect(details.kind).toBe('pike-not-found');
      expect(details.message).toBe('Pike executable not found');
      expect(details.suggestion).toContain('Install Pike');
      expect(details.suggestion).toContain('pike');
      expect(details.diagnostic).toContain('ENOENT');

      const formatted = formatBridgeStartupError(details);
      expect(formatted).toContain('[VALIDATE] Pike executable not found');
      expect(formatted).toContain('Suggestion:');
      expect(formatted).toContain('Install Pike');
    });
  });

  describe('GIVEN user has wrong Pike version', () => {
    it('WHEN version check fails THEN provides upgrade guidance', () => {
      const current = { major: 7, minor: 8, build: 123, string: 'Pike v7.8.123' };
      const required = { major: 8, minor: 0, build: 1116, string: 'Pike v8.0.1116' };

      const details = {
        kind: 'version-unsupported' as const,
        message: 'Pike version is not supported',
        suggestion: `Pike ${required.string} or higher is required. Current version: ${current.string}. Please upgrade Pike.`,
        diagnostic: `Version mismatch: required ${required.string}, found ${current.string}`,
        currentVersion: current,
        requiredVersion: required,
      };

      expect(details.kind).toBe('version-unsupported');
      expect(details.suggestion).toContain('8.0.1116 or higher');
      expect(details.suggestion).toContain('7.8.123');
      expect(details.suggestion).toContain('upgrade Pike');
    });
  });

  describe('GIVEN analyzer script is missing', () => {
    it('WHEN bridge startup fails with script ENOENT THEN provides script path guidance', () => {
      const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      err.path = '/path/to/pike-scripts/analyzer.pike';

      const details = classifyBridgeStartupError(
        err,
        '/usr/bin/pike',
        '/path/to/pike-scripts/analyzer.pike'
      );

      expect(details.kind).toBe('script-not-found');
      expect(details.message).toBe('Pike analyzer script not found');
      expect(details.suggestion).toContain('LSP server is installed correctly');
      expect(details.suggestion).toContain('/path/to/pike-scripts/analyzer.pike');
      expect(details.scriptPath).toBe('/path/to/pike-scripts/analyzer.pike');
    });
  });

  describe('GIVEN user lacks execute permissions', () => {
    it('WHEN bridge startup fails with EACCES THEN provides permission guidance', () => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      err.path = '/usr/local/bin/pike';

      const details = classifyBridgeStartupError(err, '/usr/local/bin/pike');

      expect(details.kind).toBe('pike-not-executable');
      expect(details.message).toContain('permission denied');
      expect(details.suggestion).toContain('file permissions');
      expect(details.suggestion).toContain('/usr/local/bin/pike');
      expect(details.suggestion).toContain('execute permission');
    });

    it('WHEN analyzer script lacks execute permission THEN provides script permission guidance', () => {
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      err.path = '/path/to/analyzer.pike';

      const details = classifyBridgeStartupError(err, '/usr/bin/pike', '/path/to/analyzer.pike');

      expect(details.kind).toBe('script-not-executable');
      expect(details.suggestion).toContain('read and execute permissions');
      expect(details.suggestion).toContain('/path/to/analyzer.pike');
    });
  });

  describe('GIVEN pipe creation fails', () => {
    it('WHEN bridge startup fails with pipe error THEN provides system resource guidance', () => {
      const err = new Error('Failed to create stdin/stdout pipes for Pike subprocess');

      const details = classifyBridgeStartupError(err);

      expect(details.kind).toBe('pipe-failure');
      expect(details.message).toContain('communication pipes');
      expect(details.suggestion).toContain('system resource limit');
      expect(details.suggestion).toContain('restart');
    });
  });

  describe('GIVEN bridge startup times out', () => {
    it('WHEN bridge startup exceeds timeout THEN provides timeout guidance', () => {
      const err = new Error('Pike subprocess startup timed out');

      const details = classifyBridgeStartupError(err);

      expect(details.kind).toBe('timeout');
      expect(details.message).toContain('timed out');
      expect(details.suggestion).toContain('system resources');
      expect(details.suggestion).toContain('timeout');
    });
  });

  describe('GIVEN error is unrecognized', () => {
    it('WHEN bridge startup fails with unknown error THEN provides general guidance', () => {
      const err = new Error('Something completely unexpected happened');

      const details = classifyBridgeStartupError(err);

      expect(details.kind).toBe('unknown');
      expect(details.message).toContain('Pike bridge failed to start');
      expect(details.suggestion).toContain('LSP logs');
      expect(details.suggestion).toContain('properly configured');
      expect(details.diagnostic).toBe('Something completely unexpected happened');
    });
  });
});
