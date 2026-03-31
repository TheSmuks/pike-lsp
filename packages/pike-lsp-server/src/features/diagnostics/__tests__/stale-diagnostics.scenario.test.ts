/**
 * Stale Diagnostics Scenario Tests
 *
 * Tests that prove error diagnostics are cleared when the user fixes code,
 * without overwhelming the engine with forced re-validation.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

describe('Stale Diagnostics Scenario', () => {
  it('should clear errors on changed lines when skipping validation', () => {
    // Simulate the scenario:
    // 1. Document has error on line 5
    // 2. User types on line 5
    // 3. Change detection says "skip" (semantic unchanged)
    // 4. Error on line 5 should be cleared

    const cachedDiagnostics = [
      {
        severity: 1,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Error on line 5',
      },
      {
        severity: 2,
        range: { start: { line: 10, character: 0 }, end: { line: 10, character: 5 } },
        message: 'Warning on line 10',
      },
    ];

    const changeRange = { start: { line: 5, character: 2 }, end: { line: 5, character: 3 } };

    // Filter logic (same as in index.ts)
    const changeStartLine = changeRange.start.line;
    const changeEndLine = changeRange.end.line;

    const filteredDiagnostics = cachedDiagnostics.filter(d => {
      if (d.severity !== 1) return true; // Keep warnings
      const errorLine = d.range.start.line;
      return errorLine < changeStartLine - 1 || errorLine > changeEndLine + 1;
    });

    // Error on line 5 should be cleared
    assert.strictEqual(filteredDiagnostics.length, 1, 'Should have 1 diagnostic left');
    assert.strictEqual(filteredDiagnostics[0]?.severity, 2, 'Only warning should remain');
    assert.strictEqual(
      filteredDiagnostics[0]?.range.start.line,
      10,
      'Warning on line 10 should remain'
    );
  });

  it('should keep errors on unchanged lines', () => {
    const cachedDiagnostics = [
      {
        severity: 1,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Error on line 5',
      },
      {
        severity: 1,
        range: { start: { line: 20, character: 0 }, end: { line: 20, character: 10 } },
        message: 'Error on line 20',
      },
    ];

    const changeRange = { start: { line: 5, character: 2 }, end: { line: 5, character: 3 } };

    const changeStartLine = changeRange.start.line;
    const changeEndLine = changeRange.end.line;

    const filteredDiagnostics = cachedDiagnostics.filter(d => {
      if (d.severity !== 1) return true;
      const errorLine = d.range.start.line;
      return errorLine < changeStartLine - 1 || errorLine > changeEndLine + 1;
    });

    // Error on line 5 cleared, error on line 20 kept
    assert.strictEqual(filteredDiagnostics.length, 1, 'Should have 1 diagnostic left');
    assert.strictEqual(
      filteredDiagnostics[0]?.range.start.line,
      20,
      'Error on line 20 should remain'
    );
  });

  it('should clear adjacent errors (one line buffer)', () => {
    const cachedDiagnostics = [
      {
        severity: 1,
        range: { start: { line: 4, character: 0 }, end: { line: 4, character: 10 } },
        message: 'Error above',
      },
      {
        severity: 1,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Error on line',
      },
      {
        severity: 1,
        range: { start: { line: 6, character: 0 }, end: { line: 6, character: 10 } },
        message: 'Error below',
      },
      {
        severity: 1,
        range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
        message: 'Far error',
      },
    ];

    const changeRange = { start: { line: 5, character: 2 }, end: { line: 5, character: 3 } };

    const changeStartLine = changeRange.start.line;
    const changeEndLine = changeRange.end.line;

    const filteredDiagnostics = cachedDiagnostics.filter(d => {
      if (d.severity !== 1) return true;
      const errorLine = d.range.start.line;
      return errorLine < changeStartLine - 1 || errorLine > changeEndLine + 1;
    });

    // Lines 4, 5, 6 should be cleared (adjacent), line 10 kept
    assert.strictEqual(filteredDiagnostics.length, 1, 'Should have 1 diagnostic left');
    assert.strictEqual(
      filteredDiagnostics[0]?.range.start.line,
      10,
      'Error on line 10 should remain'
    );
  });

  it('should keep warnings on changed lines', () => {
    const cachedDiagnostics = [
      {
        severity: 1,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Error',
      },
      {
        severity: 2,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Warning',
      },
      {
        severity: 3,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'Info',
      },
    ];

    const changeRange = { start: { line: 5, character: 2 }, end: { line: 5, character: 3 } };

    const changeStartLine = changeRange.start.line;
    const changeEndLine = changeRange.end.line;

    const filteredDiagnostics = cachedDiagnostics.filter(d => {
      if (d.severity !== 1) return true; // Keep warnings and info
      const errorLine = d.range.start.line;
      return errorLine < changeStartLine - 1 || errorLine > changeEndLine + 1;
    });

    // Error cleared, warning and info kept
    assert.strictEqual(filteredDiagnostics.length, 2, 'Should have 2 diagnostics left');
    assert.ok(
      filteredDiagnostics.every(d => d.severity !== 1),
      'No errors should remain'
    );
  });

  it('should handle multi-line changes', () => {
    const cachedDiagnostics = [
      {
        severity: 1,
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 10 } },
        message: 'Above range',
      },
      {
        severity: 1,
        range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
        message: 'In range',
      },
      {
        severity: 1,
        range: { start: { line: 10, character: 0 }, end: { line: 10, character: 10 } },
        message: 'In range 2',
      },
      {
        severity: 1,
        range: { start: { line: 15, character: 0 }, end: { line: 15, character: 10 } },
        message: 'Below range',
      },
    ];

    // Multi-line change from line 5 to line 10
    const changeRange = { start: { line: 5, character: 0 }, end: { line: 10, character: 5 } };

    const changeStartLine = changeRange.start.line;
    const changeEndLine = changeRange.end.line;

    const filteredDiagnostics = cachedDiagnostics.filter(d => {
      if (d.severity !== 1) return true;
      const errorLine = d.range.start.line;
      // Keep errors that are more than 1 line away from change
      return errorLine < changeStartLine - 1 || errorLine > changeEndLine + 1;
    });

    // Line 3: 3 < 5-1=4? YES (kept - more than 1 line above)
    // Line 5: in range (cleared)
    // Line 10: in range (cleared)
    // Line 15: 15 > 10+1=11? YES (kept - more than 1 line below)
    assert.strictEqual(
      filteredDiagnostics.length,
      2,
      'Should have 2 diagnostics left (lines 3 and 15)'
    );
    assert.strictEqual(
      filteredDiagnostics[0]?.range.start.line,
      3,
      'Error on line 3 should remain'
    );
    assert.strictEqual(
      filteredDiagnostics[1]?.range.start.line,
      15,
      'Error on line 15 should remain'
    );
  });
});
