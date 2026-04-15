import { describe, it, expect } from 'bun:test';

// Reproduce the isEnoentError logic to verify correctness.
// The actual function is private in resolution-cache-persistence.ts,
// so we test the same logic here to confirm the pattern works for all
// error types mentioned in the issue (generic Error, TypeError, etc.).

function isEnoentError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

describe('isEnoentError', () => {
  it('returns true for Error with code ENOENT', () => {
    const err = new Error('not found') as Error & { code: string };
    err.code = 'ENOENT';
    expect(isEnoentError(err)).toBe(true);
  });

  it('returns false for Error with code EACCES', () => {
    const err = new Error('permission denied') as Error & { code: string };
    err.code = 'EACCES';
    expect(isEnoentError(err)).toBe(false);
  });

  it('returns false for generic Error without code', () => {
    const err = new Error('something went wrong');
    expect(isEnoentError(err)).toBe(false);
  });

  it('returns false for TypeError (no code property)', () => {
    const err = new TypeError('unexpected type');
    expect(isEnoentError(err)).toBe(false);
  });

  it('returns false for string thrown as error', () => {
    expect(isEnoentError('ENOENT: file not found')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isEnoentError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isEnoentError(undefined)).toBe(false);
  });

  it('returns false for plain object with code ENOENT (not Error instance)', () => {
    expect(isEnoentError({ code: 'ENOENT', message: 'not found' })).toBe(false);
  });
});
