/**
 * File Watching Tests
 *
 * Issue #184: Tests for incremental file watching and workspace updates.
 * Verifies that file changes trigger proper index updates.
 */

// @ts-ignore - Bun test types
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { WorkspaceIndex } from '../../workspace-index.js';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('File Watching (Issue #184)', () => {
    let bridge: PikeBridge | null = null;
    let workspaceIndex: WorkspaceIndex;
    let tempDir: string;
    let testFilePath: string;

    beforeEach(async () => {
        // Create temporary directory for test files
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pike-lsp-file-watch-'));
        testFilePath = path.join(tempDir, 'test.pike');

        // Initialize workspace index
        bridge = new PikeBridge();
        const available = await bridge.checkPike();
        if (!available) {
            bridge = null;
            return;
        }
        await bridge.start();
        await new Promise(resolve => setTimeout(resolve, 200));

        workspaceIndex = new WorkspaceIndex(bridge);
    });

    afterEach(async () => {
        if (bridge) {
            await bridge.stop();
        }
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('isPikeFile utility', () => {
        it('should identify .pike files', () => {
            const { isPikeFile } = require('../../features/file-watcher.js');
            expect(isPikeFile('file:///path/to/file.pike')).toBe(true);
        });

        it('should identify .pmod files', () => {
            const { isPikeFile } = require('../../features/file-watcher.js');
            expect(isPikeFile('file:///path/to/module.pmod')).toBe(true);
        });

        it('should identify .cmod files', () => {
            const { isPikeFile } = require('../../features/file-watcher.js');
            expect(isPikeFile('file:///path/to/file.cmod')).toBe(true);
        });

        it('should reject non-Pike files', () => {
            const { isPikeFile } = require('../../features/file-watcher.js');
            expect(isPikeFile('file:///path/to/file.js')).toBe(false);
            expect(isPikeFile('file:///path/to/file.txt')).toBe(false);
            expect(isPikeFile('file:///path/to/file.pike.txt')).toBe(false);
        });
    });

    describe('workspaceIndex.removeDocument', () => {
        it('should remove document from index', async () => {
            if (!bridge) return;

            const uri = `file://${testFilePath}`;
            const content = `
class TestClass {
    void test_method() { }
}
`;
            // Index the document
            await workspaceIndex.indexDocument(uri, content, 1);

            // Verify it's indexed
            expect(workspaceIndex.getDocumentSymbols(uri).length).toBeGreaterThan(0);

            // Remove the document
            workspaceIndex.removeDocument(uri);

            // Verify it's removed
            expect(workspaceIndex.getDocumentSymbols(uri)).toEqual([]);
        });

        it('should handle removing non-existent document', () => {
            const uri = 'file:///nonexistent/file.pike';
            // Should not throw
            expect(() => workspaceIndex.removeDocument(uri)).not.toThrow();
        });
    });

    describe('workspaceIndex re-indexing', () => {
        it('should update symbols when document content changes', async () => {
            if (!bridge) return;

            const uri = `file://${testFilePath}`;
            const originalContent = `
class OriginalClass {
    void original_method() { }
}
`;
            const updatedContent = `
class UpdatedClass {
    void updated_method() { }
}
`;

            // Index original content
            await workspaceIndex.indexDocument(uri, originalContent, 1);
            const originalSymbols = workspaceIndex.getDocumentSymbols(uri);
            expect(originalSymbols.some(s => s.name === 'OriginalClass')).toBe(true);

            // Re-index with updated content
            await workspaceIndex.indexDocument(uri, updatedContent, 2);
            const updatedSymbols = workspaceIndex.getDocumentSymbols(uri);
            expect(updatedSymbols.some(s => s.name === 'OriginalClass')).toBe(false);
            expect(updatedSymbols.some(s => s.name === 'UpdatedClass')).toBe(true);
        });
    });

    describe('getPikeFileWatchPatterns', () => {
        it('should return correct file watch patterns', () => {
            const { getPikeFileWatchPatterns } = require('../../features/file-watcher.js');
            const patterns = getPikeFileWatchPatterns();

            expect(patterns).toEqual([
                { pattern: '**/*.pike', kind: 'file' },
                { pattern: '**/*.pmod', kind: 'file' },
                { pattern: '**/*.cmod', kind: 'file' },
            ]);
        });
    });

    describe('FileChangeType constants', () => {
        it('should have correct FileChangeType values', () => {
            const fileWatcher = require('../../features/file-watcher.js');
            expect(fileWatcher.FileChangeType).toEqual({
                Created: 1,
                Changed: 2,
                Deleted: 3,
            });
        });
    });
});
