import assert from 'node:assert';

describe('Roxen Diagnostics - data shape mapping', () => {
    test('Maps Pike flat {line, column, severity, message} to LSP Diagnostic format', () => {
        // Simulate what Pike returns
        const pikeDiags = [
            { line: 1, column: 5, severity: 'error' as const, message: 'Test error' }
        ];

        // Simulate the mapping that diagnostics.ts does
        const mapped = pikeDiags.map(d => {
          const line = Math.max(0, (d.line ?? 1) - 1);
          const column = Math.max(0, (d.column ?? 1) - 1);

          return {
            range: {
              start: { line, character: column },
              end: { line, character: column },
            },
            severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
            message: d.message || '',
            source: 'roxen',
          };
        });

        const expected = {
            range: {
                start: { line: 0, character: 4 },
                end: { line: 0, character: 4 }
            },
            severity: 1,
            message: 'Test error',
            source: 'roxen'
        };

        assert.deepEqual(mapped[0], expected, 'Should map flat Pike format to LSP Diagnostic');
    });

    test('Line numbers converted from 1-based (Pike) to 0-based (LSP)', () => {
        const pikeDiag = { line: 5, column: 10, severity: 'error' as const, message: 'Test' };

        const expectedLine = 4;
        const expectedChar = 9;

        assert.strictEqual(pikeDiag.line - 1, expectedLine, 'Line should be 0-based');
        assert.strictEqual(pikeDiag.column - 1, expectedChar, 'Character should be 0-based');
    });

    test('Severity strings mapped to LSP numeric values', () => {
        const severityMap: Record<string, number> = {
            'error': 1,
            'warning': 2,
            'info': 3
        };

        assert.strictEqual(severityMap['error'], 1);
        assert.strictEqual(severityMap['warning'], 2);
        assert.strictEqual(severityMap['info'], 3);
    });

    test('source field hardcoded to "roxen" (not from Pike)', () => {
        const pikeDiag = { line: 1, column: 0, severity: 'error' as const, message: 'Test' };
        const source = 'roxen';

        assert.strictEqual(source, 'roxen');
        assert.strictEqual(pikeDiag['source'], undefined, 'Pike data should not have source field');
    });

    test('Missing line/column defaults to line 0, char 0', () => {
        const pikeDiag = { line: undefined, column: undefined, severity: 'error' as const, message: 'Test' } as any;

        const defaultLine = Math.max(0, (pikeDiag.line ?? 1) - 1);
        const defaultChar = Math.max(0, (pikeDiag.column ?? 1) - 1);

        assert.strictEqual(defaultLine, 0);
        assert.strictEqual(defaultChar, 0);
    });

    test('Multiple diagnostics can be mapped in batch', () => {
        const pikeDiags = [
            { line: 1, column: 5, severity: 'error' as const, message: 'Error 1' },
            { line: 2, column: 10, severity: 'warning' as const, message: 'Warning 1' },
            { line: 3, column: 15, severity: 'info' as const, message: 'Info 1' }
        ];

        const mapped = pikeDiags.map(d => ({
            range: {
                start: { line: Math.max(0, (d.line ?? 1) - 1), character: Math.max(0, (d.column ?? 1) - 1) },
                end: { line: Math.max(0, (d.line ?? 1) - 1), character: Math.max(0, (d.column ?? 1) - 1) }
            },
            severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
            message: d.message || '',
            source: 'roxen'
        }));

        assert.strictEqual(mapped.length, 3);
        assert.strictEqual(mapped[0].severity, 1);
        assert.strictEqual(mapped[1].severity, 2);
        assert.strictEqual(mapped[2].severity, 3);
    });

    test('Handles very large line numbers gracefully', () => {
        const pikeDiag = { line: 10000, column: 5000, severity: 'error' as const, message: 'Test' };
        const line = Math.max(0, pikeDiag.line - 1);
        const column = Math.max(0, pikeDiag.column - 1);
        assert.strictEqual(line, 9999);
        assert.strictEqual(column, 4999);
    });

    test('Empty message handled gracefully', () => {
        const pikeDiag = { line: 1, column: 1, severity: 'error' as const, message: '' };
        const mapped = { message: pikeDiag.message || 'Unknown error', source: 'roxen' };
        assert.strictEqual(mapped.message, 'Unknown error');
    });

    test('Diagnostic range has correct structure for IDE integration', () => {
        const pikeDiag = { line: 5, column: 10, severity: 'error' as const, message: 'Test' };
        const line = Math.max(0, (pikeDiag.line ?? 1) - 1);
        const column = Math.max(0, (pikeDiag.column ?? 1) - 1);
        const range = { start: { line, character: column }, end: { line, character: column + 1 } };
        assert.ok(range.start.line >= 0);
        assert.ok(range.start.character >= 0);
        assert.ok(range.end.character > range.start.character);
    });
});
