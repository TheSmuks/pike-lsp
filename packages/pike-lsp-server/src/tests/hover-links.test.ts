
import { describe, it } from 'bun:test';
import * as assert from 'node:assert';
import { buildHoverContent } from '../features/utils/hover-builder.js';
import type { PikeSymbol, PikeMethod, PikeClass } from '@pike-lsp/pike-bridge';

describe('Hover Links', () => {
    it('should generate documentation link for top-level module', () => {
        const symbol: PikeSymbol = {
            name: 'Stdio',
            kind: 'module',
            modifiers: [],
        };

        const markdown = buildHoverContent(symbol);
        assert.ok(markdown?.includes('[Online Documentation](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio.html)'));
    });

    it('should generate documentation link for class in module', () => {
        const symbol: PikeClass = {
            name: 'File',
            kind: 'class',
            modifiers: [],
            children: [],
            inherits: []
        };

        const markdown = buildHoverContent(symbol, 'Stdio');
        assert.ok(markdown?.includes('[Online Documentation](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/File.html)'));
    });

    it('should generate documentation link for method in class', () => {
        const symbol: PikeMethod = {
            name: 'read',
            kind: 'method',
            modifiers: [],
            argNames: [],
            argTypes: [],
        };

        const markdown = buildHoverContent(symbol, 'Stdio.File');
        assert.ok(markdown?.includes('[Online Documentation](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/File/read.html)'));
    });

    it('should generate correct seealso links', () => {
        const symbol: PikeMethod = {
            name: 'write',
            kind: 'method',
            modifiers: [],
            argNames: [],
            argTypes: [],
            // @ts-ignore - 'documentation' property is not defined in the PikeMethod interface,
            // but it's used here to test that buildHoverContent handles it dynamically at runtime
            // (checked at hover-builder.ts:518). This allows extending symbol types without
            // modifying the core interface.
            documentation: {
                text: 'Write data.',
                seealso: ['Stdio.File', 'read']
            }
        };

        const markdown = buildHoverContent(symbol, 'Stdio.File');
        // Stdio.File -> predef_3A_3A/Stdio/File.html
        assert.ok(markdown?.includes('(https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/File.html)'));
    });
});
