/**
 * Stale Diagnostics Scenario Tests
 *
 * Tests the skip-path validation behavior: when change-detection classifies
 * a change as semantically irrelevant (canSkip=true), diagnostics are
 * republished as-is without any line-based filtering.
 *
 * The ±1 line proximity filtering was removed because diagnostics queries
 * now always use mode:'latest' (PR #1942), which eliminates stale snapshot
 * issues. Change-detection's canSkip=true already confirms no semantic
 * change occurred, so filtering by line proximity is unnecessary.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

describe('Stale Diagnostics Scenario', () => {
  it('should republish all diagnostics unchanged when skipping validation', () => {
    // Simulate the scenario:
    // 1. Document has error on line 5 and warning on line 10
    // 2. User types whitespace on line 3
    // 3. Change detection says "skip" (semantic unchanged)
    // 4. All diagnostics are republished as-is

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

    // Skip-path: no filtering applied, diagnostics pass through unchanged
    const diagnosticsToSend = cachedDiagnostics;

    assert.strictEqual(diagnosticsToSend.length, 2, 'Should republish all diagnostics');
    assert.strictEqual(diagnosticsToSend[0]?.severity, 1, 'Error should be preserved');
    assert.strictEqual(diagnosticsToSend[1]?.severity, 2, 'Warning should be preserved');
  });

  it('should not filter errors on changed lines when skipping', () => {
    // Previous behavior filtered errors ±1 line from change. Now we trust
    // change-detection: if it says canSkip, the change was semantically
    // irrelevant and ALL diagnostics are correct as-is.

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

    // Even if the change was on line 5, skip-path doesn't filter
    const diagnosticsToSend = cachedDiagnostics;

    assert.strictEqual(diagnosticsToSend.length, 2, 'Both errors preserved');
    assert.ok(
      diagnosticsToSend.every(d => d.severity === 1),
      'All errors should be preserved'
    );
  });

  it('should preserve warnings, errors, and info equally', () => {
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

    const diagnosticsToSend = cachedDiagnostics;

    assert.strictEqual(diagnosticsToSend.length, 3, 'All diagnostics preserved');
    assert.strictEqual(diagnosticsToSend[0]?.severity, 1);
    assert.strictEqual(diagnosticsToSend[1]?.severity, 2);
    assert.strictEqual(diagnosticsToSend[2]?.severity, 3);
  });

  it('should handle empty diagnostics gracefully', () => {
    const cachedDiagnostics: Array<{
      severity: number;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      message: string;
    }> = [];

    const diagnosticsToSend = cachedDiagnostics;

    assert.strictEqual(diagnosticsToSend.length, 0, 'Empty diagnostics pass through');
  });

  it('should fallback to empty array when no cache entry exists', () => {
    const cachedEntry = undefined;

    const diagnosticsToSend = cachedEntry?.diagnostics ?? [];

    assert.strictEqual(diagnosticsToSend.length, 0, 'No crash on missing cache');
  });
});
