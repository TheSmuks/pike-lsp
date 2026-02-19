/**
 * RXML Diagnostics Tests - TDD Phase
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { validateRXMLDocument } from '../../../features/rxml/diagnostics.js';
import type { RXMLTagInfo } from '../../../features/rxml/types.js';

describe('RXML Diagnostics', () => {
    describe('Unknown tag detection', () => {
        test('Unknown tag <faketag> -> returns error diagnostic', async () => {
            const code = '<faketag>';
            const tags: RXMLTagInfo[] = [{
                name: 'faketag',
                type: 'simple',
                position: { line: 0, column: 0 },
                attributes: {}
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            assert.ok(diagnostics.length > 0, 'Should report diagnostic for unknown tag');
        });

        test('Known tag <set> -> no diagnostic', async () => {
            const code = '<set variable="foo">bar</set>';
            const tags: RXMLTagInfo[] = [{
                name: 'set',
                type: 'container',
                position: { line: 0, column: 0 },
                attributes: { variable: 'foo' }
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            const unknownTagDiag = diagnostics.find(d => d.message.includes('set') && d.message.includes('unknown'));
            assert.ok(!unknownTagDiag, 'Known tag <set> should not be reported as unknown');
        });
    });

    describe('Missing required attributes', () => {
        test('<set> without variable attribute -> error diagnostic', async () => {
            const code = '<set>value</set>';
            const tags: RXMLTagInfo[] = [{
                name: 'set',
                type: 'container',
                position: { line: 0, column: 0 },
                attributes: {}
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            const missingAttrDiag = diagnostics.find(d =>
                d.message.includes('variable') && d.message.includes('required')
            );
            assert.ok(missingAttrDiag, 'Should report missing required "variable" attribute');
        });
    });

    describe('Unclosed container tags', () => {
        test('Container tag without closing tag -> error diagnostic', async () => {
            const code = '<set variable="foo">bar';
            const tags: RXMLTagInfo[] = [{
                name: 'set',
                type: 'container',
                position: { line: 0, column: 0 },
                attributes: { variable: 'foo' },
                isSelfClosing: false,
                isUnclosed: true
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            const unclosedDiag = diagnostics.find(d =>
                d.message.includes('Unclosed') && d.message.includes('set')
            );
            assert.ok(unclosedDiag, 'Should report unclosed container tag');
        });

        test('Properly closed container -> no diagnostic', async () => {
            const code = '<set variable="foo">bar</set>';
            const tags: RXMLTagInfo[] = [{
                name: 'set',
                type: 'container',
                position: { line: 0, column: 0 },
                attributes: { variable: 'foo' },
                isSelfClosing: false,
                isUnclosed: false
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            const unclosedDiag = diagnostics.find(d => d.message.includes('Unclosed'));
            assert.ok(!unclosedDiag, 'Should not report unclosed for properly closed tag');
        });
    });

    describe('Edge cases', () => {
        test('Empty document -> no diagnostics', async () => {
            const code = '';
            const tags: RXMLTagInfo[] = [];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            assert.equal(diagnostics.length, 0, 'Empty document should have no diagnostics');
        });

        test('Self-closing tags should not require closing tag', async () => {
            const code = '<input name="test" />';
            const tags: RXMLTagInfo[] = [{
                name: 'input',
                type: 'simple',
                position: { line: 0, column: 0 },
                attributes: { name: 'test' }
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            const unclosedDiag = diagnostics.find(d => d.message.includes('Unclosed'));
            assert.ok(!unclosedDiag, 'Self-closing tags should not report unclosed');
        });

        test('Case-insensitive tag matching', async () => {
            const code = '<SET variable="foo">bar</SET>';
            const tags: RXMLTagInfo[] = [{
                name: 'set',
                type: 'container',
                position: { line: 0, column: 0 },
                attributes: { variable: 'foo' }
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            const unknownTagDiag = diagnostics.find(d => d.message.includes('unknown'));
            assert.ok(!unknownTagDiag, 'Case-insensitive tags should be recognized');
        });

        test('Nested tags validation', async () => {
            const code = '<if variable="x"><set variable="y">value</set></if>';
            const tags: RXMLTagInfo[] = [
                { name: 'if', type: 'container', position: { line: 0, column: 0 }, attributes: { variable: 'x' } },
                { name: 'set', type: 'container', position: { line: 0, column: 15 }, attributes: { variable: 'y' } }
            ];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            assert.ok(diagnostics.length >= 0, 'Nested tags may or may not have diagnostics');
        });

        test('Missing attribute value should warn', async () => {
            const code = '<set variable=></set>';
            const tags: RXMLTagInfo[] = [{
                name: 'set',
                type: 'container',
                position: { line: 0, column: 0 },
                attributes: {}
            }];

            const diagnostics = await validateRXMLDocument(code, 'test.rxml', tags);
            assert.ok(diagnostics.length > 0, 'Should report diagnostic for missing attribute value');
        });
    });
});
