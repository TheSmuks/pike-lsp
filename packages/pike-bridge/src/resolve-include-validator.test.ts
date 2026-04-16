// @ts-ignore - Bun test types
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { assertString, assertNumber } from './response-validator.js';
import { BridgeResponseError } from './response-validator.js';

/** Extracted validator logic from resolveInclude in bridge-analysis.ts */
function validate(raw: unknown): void {
  const r = raw as Record<string, unknown>;
  assertString(r['path'], 'path', 'resolve_include');
  assertNumber(r['exists'], 'exists', 'resolve_include');
  assertString(r['originalPath'], 'originalPath', 'resolve_include');
}

describe('resolveInclude validator', () => {
  it('should accept valid IncludeResolveResult with exists=1', () => {
    assert.doesNotThrow(() =>
      validate({
        path: '/foo/bar.pike',
        exists: 1,
        originalPath: 'bar.pike',
      })
    );
  });

  it('should accept valid IncludeResolveResult with exists=0', () => {
    assert.doesNotThrow(() =>
      validate({
        path: '/foo/bar.pike',
        exists: 0,
        originalPath: 'bar.pike',
      })
    );
  });

  it('should reject non-number exists with string', () => {
    assert.throws(
      () =>
        validate({
          path: '/foo/bar.pike',
          exists: 'true',
          originalPath: 'bar.pike',
        }),
      (err: unknown) => {
        assert.ok(err instanceof BridgeResponseError);
        assert.strictEqual(err.method, 'resolve_include');
        assert.strictEqual(err.field, 'exists');
        return true;
      }
    );
  });

  it('should reject non-number exists with boolean', () => {
    assert.throws(
      () =>
        validate({
          path: '/foo/bar.pike',
          exists: true,
          originalPath: 'bar.pike',
        }),
      (err: unknown) => {
        assert.ok(err instanceof BridgeResponseError);
        assert.strictEqual(err.field, 'exists');
        return true;
      }
    );
  });

  it('should reject non-string originalPath', () => {
    assert.throws(
      () =>
        validate({
          path: '/foo/bar.pike',
          exists: 1,
          originalPath: null,
        }),
      (err: unknown) => {
        assert.ok(err instanceof BridgeResponseError);
        assert.strictEqual(err.method, 'resolve_include');
        assert.strictEqual(err.field, 'originalPath');
        return true;
      }
    );
  });

  it('should reject non-string originalPath with number', () => {
    assert.throws(
      () =>
        validate({
          path: '/foo/bar.pike',
          exists: 1,
          originalPath: 42,
        }),
      (err: unknown) => {
        assert.ok(err instanceof BridgeResponseError);
        assert.strictEqual(err.field, 'originalPath');
        return true;
      }
    );
  });

  it('should reject non-string path', () => {
    assert.throws(
      () =>
        validate({
          path: null,
          exists: 1,
          originalPath: 'bar.pike',
        }),
      (err: unknown) => {
        assert.ok(err instanceof BridgeResponseError);
        assert.strictEqual(err.field, 'path');
        return true;
      }
    );
  });
});
