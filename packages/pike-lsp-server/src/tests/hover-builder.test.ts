
import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { buildHoverContent } from '../features/utils/hover-builder.js';

describe('Hover Builder', () => {
    it('generates basic documentation', () => {
        const symbol: any = {
            name: 'my_func',
            kind: 'function',
            returnType: { name: 'void' },
            documentation: {
                text: 'Does something.'
            }
        };

        const content = buildHoverContent(symbol);
        assert.ok(content);
        assert.ok(content.includes('Does something.'));
    });

    it('adds documentation link for stdlib symbols', () => {
        const symbol: any = {
            name: 'write_file',
            kind: 'function',
            returnType: { name: 'int' },
            documentation: {
                text: 'Writes a file.'
            }
        };

        // We pass 'Stdio' as the parent scope
        const content = buildHoverContent(symbol, 'Stdio');
        assert.ok(content);
        assert.ok(content.includes('[Online Documentation]'));
        assert.ok(content.includes('https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/write_file.html'));
    });

     it('adds documentation link for stdlib classes', () => {
        const symbol: any = {
            name: 'File',
            kind: 'class',
            documentation: {
                text: 'File object.'
            }
        };

        // We pass 'Stdio' as the parent scope
        const content = buildHoverContent(symbol, 'Stdio');
        assert.ok(content);
        assert.ok(content.includes('https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/File.html'));
    });

    it('displays inheritance information', () => {
        const symbol: any = {
            name: 'inherited_func',
            kind: 'function',
            returnType: { name: 'void' },
            inherited: true,
            inheritedFrom: 'ParentClass'
        };

        const content = buildHoverContent(symbol);
        assert.ok(content);
        assert.ok(content.includes('*Inherited from*: `ParentClass`'));
    });
});
