import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createLogger, DEFAULT_LOG_FILE, resolveDebugLogFilePath } from '../utils/debug-logger.js';

const testProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;

function getEnv(name: string): string | undefined {
  return testProcess?.env?.[name];
}

function setEnv(name: string, value: string): void {
  if (!testProcess?.env) {
    throw new Error('Test environment does not expose process.env');
  }
  testProcess.env[name] = value;
}

function unsetEnv(name: string): void {
  if (!testProcess?.env) {
    throw new Error('Test environment does not expose process.env');
  }
  delete testProcess.env[name];
}

describe('debug logger', () => {
  const envVar = 'PIKE_LSP_LOG_FILE';
  const previousValue = getEnv(envVar);

  beforeEach(() => {
    if (typeof previousValue === 'string') {
      setEnv(envVar, previousValue);
    } else {
      unsetEnv(envVar);
    }
  });

  afterEach(() => {
    if (typeof previousValue === 'string') {
      setEnv(envVar, previousValue);
    } else {
      unsetEnv(envVar);
    }
  });

  it('uses PIKE_LSP_LOG_FILE when provided', () => {
    setEnv(envVar, '/tmp/custom-debug-log.txt');
    expect(resolveDebugLogFilePath()).toBe('/tmp/custom-debug-log.txt');
  });

  it('falls back to default log path when env var is unset or blank', () => {
    unsetEnv(envVar);
    expect(resolveDebugLogFilePath()).toBe(DEFAULT_LOG_FILE);

    setEnv(envVar, '   ');
    expect(resolveDebugLogFilePath()).toBe(DEFAULT_LOG_FILE);
  });

  it('uses resolved env log path when logger is created without explicit path', () => {
    setEnv(envVar, '/tmp/debug-from-env.log');

    const calls: Array<{ path: string; data: string }> = [];
    const logger = createLogger(undefined, {
      appendFileSync: (path, data) => {
        calls.push({ path: String(path), data });
      },
    });

    logger('hello');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/tmp/debug-from-env.log');
    expect(calls[0]?.data).toContain('hello');
  });

  it('invokes failure callback instead of throwing when append fails', () => {
    const failures: Array<{ path: string; error: unknown }> = [];
    const expectedError = new Error('EACCES: write failed');

    const logger = createLogger('/missing/path/debug.log', {
      appendFileSync: () => {
        throw expectedError;
      },
      onWriteFailure: (path, error) => {
        failures.push({ path, error });
      },
    });

    expect(() => logger('test message')).not.toThrow();
    expect(failures).toHaveLength(1);
    expect(failures[0]?.path).toBe('/missing/path/debug.log');
    expect(failures[0]?.error).toBe(expectedError);
  });
});
