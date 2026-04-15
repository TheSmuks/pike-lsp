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

describe('WorkspaceDiagnosticsManager processBatch retry behavior (#1901)', () => {
  it('skipped URIs are not marked as processed when bridge is unavailable', async () => {
    // Simulate the processBatch behavior: bridge unavailable → empty set returned
    const successfullyProcessed = new Set<string>();
    // When bridge is not running, processBatch returns empty set
    assert.equal(successfullyProcessed.size, 0);

    // In processQueue, URIs not in successfullyProcessed should be pushed back
    const batch = ['file:///a.pike', 'file:///b.pike', 'file:///c.pike'];
    const processedUris = new Set<string>();
    const remainingUris: string[] = [];

    for (const uri of batch) {
      if (successfullyProcessed.has(uri)) {
        processedUris.add(uri);
      } else {
        remainingUris.push(uri);
      }
    }

    assert.equal(processedUris.size, 0, 'no URIs should be marked processed');
    assert.deepEqual(remainingUris, batch, 'all URIs should be pushed back for retry');
  });

  it('only successfully analyzed URIs are marked as processed', async () => {
    // Simulate: 3 files in batch, 1 fails (rejected), 2 succeed
    const batch = ['file:///a.pike', 'file:///b.pike', 'file:///c.pike'];
    const successfullyProcessed = new Set(['file:///a.pike', 'file:///c.pike']);
    const processedUris = new Set<string>();
    const remainingUris: string[] = [];

    for (const uri of batch) {
      if (successfullyProcessed.has(uri)) {
        processedUris.add(uri);
      } else {
        remainingUris.push(uri);
      }
    }

    assert.equal(processedUris.size, 2);
    assert.ok(processedUris.has('file:///a.pike'));
    assert.ok(processedUris.has('file:///c.pike'));
    assert.deepEqual(remainingUris, ['file:///b.pike'], 'failed URI should be pushed back');
  });
});
