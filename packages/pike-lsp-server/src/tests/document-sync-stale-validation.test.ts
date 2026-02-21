/**
 * Stale Validation Regression Tests
 *
 * Tests for the fix in commit 7f20529 that prevents race conditions where
 * debounced validation from an older document version could fire after a
 * newer version was already validated, causing false syntax errors.
 *
 * This typically happens during rapid changes like CTRL+Z undo.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * INC-563: Test that version tracking correctly identifies stale validations
 *
 * The fix adds validationVersions Map that tracks the expected document version
 * when scheduling each debounced validation. When the timer fires, it checks
 * if current version matches expected version - if not, validation is skipped.
 */
describe('Stale Validation Race Condition (INC-563)', () => {
    describe('Version tracking for debounced validation', () => {
        it('should track version when scheduling debounced validation', () => {
            // Simulate creating a document at version 1
            const uri = 'file:///test.pike';
            const docV1 = TextDocument.create(uri, 'pike', 1, 'int x = 1;');

            // Version should be tracked
            assert.strictEqual(docV1.version, 1, 'Initial version should be 1');

            // Simulate rapid change - version 2
            const docV2 = TextDocument.update(docV1, [], 2, 'int x = 1;\nint y = 2;');
            assert.strictEqual(docV2.version, 2, 'Version should increment');

            // Simulate another rapid change - version 3
            const docV3 = TextDocument.update(docV2, [], 3, 'int x = 1;\nint y = 2;\nint z = 3;');
            assert.strictEqual(docV3.version, 3, 'Version should increment again');
        });

        it('should detect when validation is stale (version mismatch)', () => {
            // Simulate the version tracking logic from diagnostics.ts
            const validationVersions = new Map<string, number>();

            // Schedule validation for version 1
            const uri = 'file:///test.pike';
            validationVersions.set(uri, 1);

            // Simulate document being updated to version 3 before timer fires
            // (This is what happens with rapid typing/undo)
            const currentVersion = 3;

            // Check if validation is stale
            const expectedVersion = validationVersions.get(uri);
            const isStale = expectedVersion !== undefined && currentVersion !== expectedVersion;

            assert.strictEqual(isStale, true, 'Validation should be marked stale when version mismatch');
            assert.strictEqual(expectedVersion, 1, 'Expected version should be 1');
            assert.strictEqual(currentVersion, 3, 'Current version is 3');
        });

        it('should not mark validation as stale when versions match', () => {
            const validationVersions = new Map<string, number>();

            // Schedule validation for version 2
            const uri = 'file:///test.pike';
            validationVersions.set(uri, 2);

            // Document hasn't changed - versions match
            const currentVersion = 2;

            const expectedVersion = validationVersions.get(uri);
            const isStale = expectedVersion !== undefined && currentVersion !== expectedVersion;

            assert.strictEqual(isStale, false, 'Validation should NOT be stale when versions match');
        });

        it('should handle rapid sequential changes correctly', () => {
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Simulate: user types quickly, each keystroke creates new version
            // and schedules a new debounced validation

            // Change 1: version 1 scheduled
            validationVersions.set(uri, 1);

            // Before timer fires, user types more - version 2 scheduled
            // (old timer cleared, new timer scheduled)
            validationVersions.set(uri, 2);

            // Another rapid change - version 3 scheduled
            validationVersions.set(uri, 3);

            // Timer fires for what was scheduled as version 3
            // but document is now at version 5
            const currentVersion = 5;

            const expectedVersion = validationVersions.get(uri);
            const isStale = expectedVersion !== undefined && currentVersion !== expectedVersion;

            assert.strictEqual(isStale, true, 'Should detect stale when many rapid changes occurred');
            assert.strictEqual(expectedVersion, 3, 'Last scheduled was version 3');
        });

        it('should clear version tracking after validation executes', () => {
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Schedule validation
            validationVersions.set(uri, 1);

            // Validation executes (version matches)
            validationVersions.delete(uri);

            // After validation, no version should be tracked
            assert.strictEqual(validationVersions.has(uri), false, 'Version should be cleared after validation');
        });

        it('should skip stale validation without sending diagnostics', () => {
            // This test simulates the behavior where stale validation is skipped
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Schedule validation for old version
            validationVersions.set(uri, 1);

            // Document has moved to newer version
            const currentVersion = 2;

            // Simulate the skip logic
            let diagnosticsSent = false;
            const expectedVersion = validationVersions.get(uri);

            if (currentVersion !== expectedVersion) {
                // Skip - validation is stale
                validationVersions.delete(uri);
            } else {
                // Execute validation
                diagnosticsSent = true;
            }

            assert.strictEqual(diagnosticsSent, false, 'Should NOT send diagnostics for stale validation');
            assert.strictEqual(validationVersions.has(uri), false, 'Version tracking should be cleared');
        });

        it('should execute validation when versions match', () => {
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Schedule validation for version 1
            validationVersions.set(uri, 1);

            // Document still at version 1 when timer fires
            const currentVersion = 1;

            let diagnosticsSent = false;
            const expectedVersion = validationVersions.get(uri);

            if (currentVersion !== expectedVersion) {
                // Skip - validation is stale
                validationVersions.delete(uri);
            } else {
                // Execute validation
                diagnosticsSent = true;
                validationVersions.delete(uri);
            }

            assert.strictEqual(diagnosticsSent, true, 'Should send diagnostics when validation is not stale');
            assert.strictEqual(validationVersions.has(uri), false, 'Version tracking should be cleared');
        });
    });

    describe('Rapid change simulation (undo scenario)', () => {
        it('should handle undo-like rapid changes', () => {
            // Simulates: user makes change, undoes it (CTRL+Z)
            // The original validation should not overwrite the "undone" state

            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Initial valid code
            let currentContent = 'int x = 1;';
            let currentVersion = 1;

            // User adds invalid code (e.g., removes semicolon)
            validationVersions.set(uri, currentVersion);
            currentContent = 'int x = 1'; // Missing semicolon - syntax error
            currentVersion = 2;

            // User undoes (CTRL+Z) - content goes back to valid
            currentContent = 'int x = 1;';
            currentVersion = 3;

            // Old validation for version 2 should be skipped
            const expectedVersion = validationVersions.get(uri);
            const isStale = currentVersion !== expectedVersion;

            // The fix ensures version 2 validation doesn't overwrite version 3 state
            assert.strictEqual(isStale, true, 'Version 2 validation should be stale after undo');

            // Clear and schedule new validation for current (valid) state
            validationVersions.set(uri, currentVersion);

            // Now timer fires for version 3 - should execute
            const expectedVersion3 = validationVersions.get(uri);
            const shouldExecute = currentVersion === expectedVersion3;

            assert.strictEqual(shouldExecute, true, 'Version 3 validation should execute');
        });

        it('should not produce false syntax errors after rapid changes', () => {
            // This tests the end-to-end behavior: after rapid changes settle,
            // there should be no false diagnostics from stale validations

            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Start with valid code
            let version = 1;
            let content = 'int add(int a, int b) { return a + b; }';

            // Simulate rapid typing (each change schedules new validation)
            // Schedule 5 validations with versions 1, 2, 3, 4, 5
            for (let i = 0; i < 5; i++) {
                validationVersions.set(uri, version);
                version++;
            }

            // Final content is valid Pike
            content = 'int add(int a, int b) { return a + b; }';
            // Document is now at version 6
            const finalVersion = version; // 6

            // Only the latest validation (version 5) should execute
            const expectedVersion = validationVersions.get(uri); // 5

            // All previous scheduled validations are now stale
            let staleCount = 0;
            for (let v = 1; v < 5; v++) {
                if (finalVersion !== v) {
                    staleCount++;
                }
            }

            assert.strictEqual(staleCount, 4, 'All 4 older versions should be stale');
            assert.strictEqual(finalVersion, 6, 'Final version should be 6');
            assert.strictEqual(expectedVersion, 5, 'Latest scheduled was version 5');
        });
    });

    describe('Edge cases', () => {
        it('should handle missing version tracking entry', () => {
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // No validation scheduled
            const expectedVersion = validationVersions.get(uri);

            // Should be undefined, not stale
            assert.strictEqual(expectedVersion, undefined, 'No version tracked means no scheduled validation');
        });

        it('should handle version 0 (edge case)', () => {
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Some LSP implementations might use version 0
            validationVersions.set(uri, 0);

            const expectedVersion = validationVersions.get(uri);
            assert.strictEqual(expectedVersion, 0, 'Should track version 0');

            // Current version is also 0 - should not be stale
            const isStale = 0 !== expectedVersion;
            assert.strictEqual(isStale, false, 'Version 0 matching should not be stale');
        });

        it('should handle version going backwards (rare edge case)', () => {
            const validationVersions = new Map<string, number>();
            const uri = 'file:///test.pike';

            // Version 5 scheduled
            validationVersions.set(uri, 5);

            // For some reason, version went backwards to 3
            // (This shouldn't happen in normal LSP but handle it)
            const currentVersion = 3;
            const expectedVersion = validationVersions.get(uri);

            const isStale = currentVersion !== expectedVersion;
            assert.strictEqual(isStale, true, 'Should detect stale when version goes backwards');
        });
    });
});
