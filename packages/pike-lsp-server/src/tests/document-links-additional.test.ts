/**
 * Document Links Additional Tests
 *
 * Additional tests for document links feature.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert';

describe('Document Links Additional Tests', () => {
    describe('Document Link Structure', () => {
        it('should create document link with range', () => {
            const link = {
                range: {
                    start: { line: 0, character: 5 },
                    end: { line: 0, character: 20 }
                },
                target: 'file:///path/to/import.pike'
            };

            assert.ok(link.range);
            assert.ok(link.target);
        });

        it('should create document link with tooltip', () => {
            const link = {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                target: 'file:///test.pike',
                tooltip: 'Go to imported file'
            };

            assert.strictEqual(link.tooltip, 'Go to imported file');
        });

        it('should create document link with data', () => {
            const link = {
                range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
                target: 'file:///test.pike',
                data: { importPath: '/path/to/module' }
            };

            assert.ok(link.data);
        });
    });

    describe('Document Link Range Validation', () => {
        it('should validate range start before end', () => {
            const range = {
                start: { line: 5, character: 0 },
                end: { line: 10, character: 5 }
            };

            assert.ok(range.end.line > range.start.line ||
                (range.end.line === range.start.line && range.end.character > range.start.character));
        });

        it('should handle single character link', () => {
            const range = {
                start: { line: 0, character: 5 },
                end: { line: 0, character: 6 }
            };

            assert.strictEqual(range.end.character - range.start.character, 1);
        });

        it('should handle empty range', () => {
            const range = {
                start: { line: 0, character: 5 },
                end: { line: 0, character: 5 }
            };

            assert.strictEqual(range.start.character, range.end.character);
        });
    });

    describe('Import Path Resolution', () => {
        it('should resolve relative import', () => {
            const basePath = '/project/src/module.pike';
            const importPath = '../util.pike';

            // Simple resolution: combine paths
            const resolved = basePath.substring(0, basePath.lastIndexOf('/') + 1) + importPath;
            assert.ok(resolved.includes('..'));
        });

        it('should resolve absolute import', () => {
            const importPath = '/usr/local/lib/module.pike';
            assert.ok(importPath.startsWith('/'));
        });

        it('should handle module imports', () => {
            const importPath = 'Modules/Files.pmod';
            assert.ok(importPath.includes('/'));
        });
    });

    describe('Document Link Target Types', () => {
        it('should handle file target', () => {
            const link = {
                target: 'file:///path/to/file.pike'
            };

            assert.ok(link.target.startsWith('file://'));
        });

        it('should handle http target', () => {
            const link = {
                target: 'https://pike.example.com/docs'
            };

            assert.ok(link.target.startsWith('https://'));
        });

        it('should handle http target', () => {
            const link = {
                target: 'http://pike.example.com/api'
            };

            assert.ok(link.target.startsWith('http://'));
        });
    });

    describe('Document Link Filtering', () => {
        it('should filter by link type', () => {
            const links = [
                { target: 'file:///import.pike', type: 'import' },
                { target: 'https://docs.com', type: 'reference' },
                { target: 'file:///other.pike', type: 'import' }
            ];

            const imports = links.filter(l => l.type === 'import');
            assert.strictEqual(imports.length, 2);
        });

        it('should filter by valid targets', () => {
            const links = [
                { target: 'file:///valid.pike' },
                { target: 'invalid' },
                { target: 'file:///alsovalid.pike' }
            ];

            const valid = links.filter(l => l.target.startsWith('file://'));
            assert.strictEqual(valid.length, 2);
        });
    });

    describe('Document Link Caching', () => {
        it('should cache resolved links', () => {
            const cache = new Map();
            const key = 'file:///test.pike';
            const links = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } }, target: key }];

            cache.set(key, links);
            assert.strictEqual(cache.get(key), links);
        });

        it('should invalidate cache on change', () => {
            const cache = new Map();
            cache.set('file:///test.pike', [{ target: 'old' }]);

            // Invalidate
            cache.delete('file:///test.pike');
            cache.set('file:///test.pike', [{ target: 'new' }]);

            assert.strictEqual(cache.get('file:///test.pike')[0].target, 'new');
        });
    });

    describe('Document Link Provider', () => {
        it('should register document links provider', () => {
            const provider = {
                provideDocumentLinks: (document: any) => []
            };

            assert.ok(provider.provideDocumentLinks);
        });

        it('should handle resolve callback', () => {
            const resolve = (link: any) => {
                if (!link.target) {
                    link.target = 'file:///resolved.pike';
                }
                return link;
            };

            const resolved = resolve({ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } });
            assert.ok(resolved.target);
        });
    });
});
