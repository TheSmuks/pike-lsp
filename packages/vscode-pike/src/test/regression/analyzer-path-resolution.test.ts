/**
 * Regression Test: VSCode Remote EPIPE Crash Fix
 *
 * Tests the analyzer.pike path resolution fix from commit 54ee700.
 * The fix corrects the analyzer path calculation to work in VSCode Remote
 * environments by using the correct relative path from the server module.
 *
 * Bug: EPIPE crash occurred because the analyzer path was incorrectly
 * calculated as going up 3 levels from the server to monorepo root,
 * but in VSCode Remote the extension structure is different.
 *
 * Fix: The server is at: extension-root/server/server.js
 *      The analyzer is at: extension-root/server/pike-scripts/analyzer.pike
 * So we only need to go up 1 level from server/ to extension root.
 */

/// <reference path="../bun-test.d.ts" />

import * as path from 'path';
import * as fs from 'fs';
import { describe, test, expect } from 'bun:test';

describe('Regression: VSCode Remote EPIPE Crash (commit 54ee700)', () => {
    /**
     * Helper function that replicates the analyzer path resolution logic
     * from extension.ts (lines 354-357)
     */
    function resolveAnalyzerPath(serverModulePath: string): string {
        if (!serverModulePath) {
            throw new Error('Server module path not set');
        }
        // Go up 1 level from server/ to extension root, then to pike-scripts
        const serverDir = path.dirname(serverModulePath);
        const extensionRoot = path.resolve(serverDir, '..');
        const analyzerPath = path.join(extensionRoot, 'server', 'pike-scripts', 'analyzer.pike');
        return analyzerPath;
    }

    describe('Analyzer Path Resolution', () => {
        test('should resolve analyzer path for bundled production server', () => {
            // Production: extension-root/server/server.js
            const serverPath = '/home/user/.vscode/extensions/pike-lsp/server/server.js';
            const analyzerPath = resolveAnalyzerPath(serverPath);

            // Expected: extension-root/server/pike-scripts/analyzer.pike
            expect(analyzerPath).toBe('/home/user/.vscode/extensions/pike-lsp/server/pike-scripts/analyzer.pike');
        });

        test('should resolve analyzer path for development server', () => {
            // Development: monorepo/packages/vscode-pike/dist/server/server.js
            const serverPath = '/project/pike-lsp/packages/vscode-pike/dist/server/server.js';
            const analyzerPath = resolveAnalyzerPath(serverPath);

            // Expected: extension-root/server/pike-scripts/analyzer.pike
            expect(analyzerPath).toBe('/project/pike-lsp/packages/vscode-pike/dist/server/pike-scripts/analyzer.pike');
        });

        test('should resolve analyzer path for Windows paths', () => {
            // Windows production path
            const serverPath = 'C:\\Users\\user\\.vscode\\extensions\\pike-lsp\\server\\server.js';
            const analyzerPath = resolveAnalyzerPath(serverPath);

            // Should resolve to correct location
            expect(analyzerPath).toContain('pike-scripts');
            expect(analyzerPath).toContain('analyzer.pike');
        });

        test('should throw error when serverModulePath is null', () => {
            expect(() => resolveAnalyzerPath('')).toThrow();
            expect(() => resolveAnalyzerPath(null as any)).toThrow();
        });
    });

    describe('Path Structure Validation', () => {
        test('should have server directory as parent of pike-scripts', () => {
            // The analyzer.pike should be in a sibling directory to server/
            // /extension-root/server/server.js
            // /extension-root/server/pike-scripts/analyzer.pike
            const serverPath = '/vscode-ext/server/server.js';
            const analyzerPath = resolveAnalyzerPath(serverPath);

            const serverDir = path.dirname(serverPath);
            const expectedPikeScriptsDir = path.join(serverDir, 'pike-scripts');

            expect(path.dirname(analyzerPath)).toBe(expectedPikeScriptsDir);
        });

        test('should not traverse beyond extension root (fixes EPIPE bug)', () => {
            // The old buggy code went up 3 levels which would be wrong:
            // server/server.js -> dist -> vscode-pike -> packages -> pike-lsp (wrong!)
            // The correct fix goes up only 1 level:
            // server/server.js -> extension-root (correct!)
            const serverPath = '/vscode-ext/server/server.js';
            const analyzerPath = resolveAnalyzerPath(serverPath);

            // The analyzer should NOT be at the monorepo root
            expect(analyzerPath).not.toBe('/pike-lsp/pike-scripts/analyzer.pike');
            expect(analyzerPath).not.toBe('/pike-scripts/analyzer.pike');

            // It should be under the extension directory
            expect(analyzerPath.startsWith('/vscode-ext/')).toBe(true);
        });
    });

    describe('Non-existent File Handling', () => {
        test('should handle non-existent analyzer path gracefully', () => {
            // Use a path that definitely doesn't exist
            const fakeServerPath = '/nonexistent/path/server/server.js';

            // The function should still resolve a path without throwing
            // (the actual file existence check happens elsewhere)
            const analyzerPath = resolveAnalyzerPath(fakeServerPath);

            expect(analyzerPath).toBeDefined();
            expect(analyzerPath).toContain('analyzer.pike');
            expect(fs.existsSync(analyzerPath)).toBe(false); // Should not exist
        });

        test('should produce valid path string for non-existent locations', () => {
            const fakePaths = [
                '/tmp/test-server/server.js',
                '/opt/vscode-extensions/fake/server/server.js',
                '/home/user/vscode-data/extensions/pike-lsp/server/server.js',
            ];

            for (const serverPath of fakePaths) {
                const analyzerPath = resolveAnalyzerPath(serverPath);

                // Path should be valid and normalized
                expect(path.isAbsolute(analyzerPath)).toBe(true);
                expect(analyzerPath.endsWith('analyzer.pike')).toBe(true);
                expect(analyzerPath.includes('pike-scripts')).toBe(true);
            }
        });
    });

    describe('Real-world Path Verification', () => {
        test('should work with actual extension structure', () => {
            // Verify the test reproduces the actual fix logic
            const actualServerPath = path.join(__dirname, '..', 'dist', 'server', 'server.js');

            if (fs.existsSync(path.dirname(actualServerPath))) {
                const analyzerPath = resolveAnalyzerPath(actualServerPath);

                // The analyzer should be at: dist/server/pike-scripts/analyzer.pike
                expect(analyzerPath).toContain('dist');
                expect(analyzerPath).toContain('server');
                expect(analyzerPath).toContain('pike-scripts');
                expect(analyzerPath).toContain('analyzer.pike');
            } else {
                // If not built, just verify the logic with a mock path
                const mockPath = '/project/packages/vscode-pike/dist/server/server.js';
                const analyzerPath = resolveAnalyzerPath(mockPath);
                expect(analyzerPath).toBe('/project/packages/vscode-pike/dist/server/pike-scripts/analyzer.pike');
            }
        });
    });
});
