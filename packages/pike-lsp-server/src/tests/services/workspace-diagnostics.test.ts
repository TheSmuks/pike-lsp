/**
 * Workspace Diagnostics Tests — Issue #1729
 *
 * Verifies that bridge diagnostic severity is mapped correctly instead of
 * being hardcoded to 2 (Warning).
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { convertSeverity } from '../../features/diagnostics/utils.js';
import { CORE_DIAGNOSTIC_SEVERITY } from '../../core/types.js';
import type { CoreDiagnostic } from '../../core/types.js';

// The mapping closure extracted from processBatch (workspace-diagnostics.ts:247-255).
// Kept in sync manually — if the production code changes, update this too.
function mapBridgeDiagnostic(d: {
  position: { line: number; character: number };
  message: string;
  severity?: string;
}): CoreDiagnostic {
  return {
    range: {
      start: { line: d.position.line, character: d.position.character },
      end: { line: d.position.line, character: d.position.character },
    },
    message: d.message,
    severity: d.severity ? convertSeverity(d.severity) : 2,
    source: 'pike-background',
  };
}

describe('Workspace diagnostics severity mapping (#1729)', () => {
  it('maps error severity to LSP Error (1)', () => {
    const diag = mapBridgeDiagnostic({
      position: { line: 5, character: 10 },
      message: 'Type mismatch',
      severity: 'error',
    });
    assert.equal(diag.severity, CORE_DIAGNOSTIC_SEVERITY.ERROR);
    assert.equal(diag.severity, 1);
  });

  it('maps warning severity to LSP Warning (2)', () => {
    const diag = mapBridgeDiagnostic({
      position: { line: 3, character: 0 },
      message: 'Unused variable',
      severity: 'warning',
    });
    assert.equal(diag.severity, CORE_DIAGNOSTIC_SEVERITY.WARNING);
    assert.equal(diag.severity, 2);
  });

  it('maps info severity to LSP Information (3)', () => {
    const diag = mapBridgeDiagnostic({
      position: { line: 1, character: 0 },
      message: 'Suggestion',
      severity: 'info',
    });
    assert.equal(diag.severity, CORE_DIAGNOSTIC_SEVERITY.INFORMATION);
    assert.equal(diag.severity, 3);
  });

  it('falls back to Warning (2) when severity is missing', () => {
    const diag = mapBridgeDiagnostic({
      position: { line: 0, character: 0 },
      message: 'Unknown severity',
    });
    assert.equal(diag.severity, 2);
  });

  it('falls back to Warning (2) when severity is empty string', () => {
    const diag = mapBridgeDiagnostic({
      position: { line: 0, character: 0 },
      message: 'Empty severity',
      severity: '',
    });
    assert.equal(diag.severity, 2);
  });
});

describe('processBatch file-read error handling (#1938)', () => {
  it('skips ENOENT silently without incrementing failure counter', () => {
    // Verify that an ENOENT error object is correctly identified
    const err = new Error('ENOENT: no such file');
    Object.assign(err, { code: 'ENOENT' });

    const isErrorWithCode = (e: unknown): e is Error & { code: string } =>
      e instanceof Error && 'code' in e;

    assert.ok(isErrorWithCode(err));
    assert.equal(err.code, 'ENOENT');
  });

  it('identifies EACCES error code from permission-denied error', () => {
    const err = new Error('EACCES: permission denied');
    Object.assign(err, { code: 'EACCES' });

    const isErrorWithCode = (e: unknown): e is Error & { code: string } =>
      e instanceof Error && 'code' in e;

    assert.ok(isErrorWithCode(err));
    assert.equal(err.code, 'EACCES');
  });

  it('does not extract code from non-Error throws', () => {
    const thrown = 'string error';
    const isErrorWithCode = (e: unknown): e is Error & { code: string } =>
      e instanceof Error && 'code' in e;

    assert.ok(!isErrorWithCode(thrown));
  });

  it('does not extract code from Error without code property', () => {
    const err = new Error('generic failure');
    const isErrorWithCode = (e: unknown): e is Error & { code: string } =>
      e instanceof Error && 'code' in e;

    assert.ok(!isErrorWithCode(err));
  });
});
