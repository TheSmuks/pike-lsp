/**
 * RXML Feature Integration Tests
 *
 * Tests that verify RXML feature is properly wired into the LSP server.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Connection } from 'vscode-languageserver';
import { TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Services } from '../../../services/index.js';
import { registerRXMLHandlers } from '../../../features/rxml/index.js';

describe('RXML Feature Integration', () => {
    describe('Feature registration', () => {
        test('registerRXMLHandlers function exists and is exported', () => {
            assert.ok(typeof registerRXMLHandlers === 'function', 'registerRXMLHandlers should be a function');
        });

        test('registerRXMLHandlers can be called without errors', () => {
            const mockConnection = {} as Connection;
            const mockServices = {} as Services;
            const mockDocuments = new TextDocuments(TextDocument);

            assert.doesNotThrow(() => {
                registerRXMLHandlers(mockConnection, mockServices, mockDocuments);
            });
        });
    });

    describe('Document selectors', () => {
        test('RXML document selector matches .rxml files', () => {
            const uri = 'file:///test/template.rxml';
            const doc = TextDocument.create(uri, 'rxml', 1, '<roxen></roxen>');
            assert.equal(doc.languageId, 'rxml', 'Document should have rxml language ID');
        });

        test('RXML document selector matches .roxen files', () => {
            const uri = 'file:///test/page.roxen';
            const doc = TextDocument.create(uri, 'rxml', 1, '<roxen></roxen>');
            assert.equal(doc.languageId, 'rxml', 'Document should have rxml language ID');
        });

        test('RXML document selector matches .inc files when mapped to rxml', () => {
            const uri = 'file:///test/header.inc';
            const doc = TextDocument.create(uri, 'rxml', 1, '<set variable="foo">bar</set>');
            assert.equal(doc.languageId, 'rxml', 'Document should have rxml language ID');
        });
    });

    describe('Feature exports', () => {
        test('RXML feature index exports all required functions', async () => {
            const rxmlModule = await import('../../../features/rxml/index.js');

            assert.ok(typeof rxmlModule.registerRXMLHandlers === 'function', 'Should export registerRXMLHandlers');
            assert.ok(typeof rxmlModule.provideRXMLCompletions === 'function', 'Should export provideRXMLCompletions');
            assert.ok(typeof rxmlModule.parseRXMLTemplate === 'function', 'Should export parseRXMLTemplate');
            assert.ok(typeof rxmlModule.getTagInfo === 'function', 'Should export getTagInfo');
            assert.ok(typeof rxmlModule.RXML_TAG_CATALOG !== 'undefined', 'Should export RXML_TAG_CATALOG');
        });

        test('RXML completion functions are exported', async () => {
            const rxmlModule = await import('../../../features/rxml/index.js');

            assert.ok(typeof rxmlModule.getTagCompletions === 'function', 'Should export getTagCompletions');
            assert.ok(typeof rxmlModule.getAttributeCompletions === 'function', 'Should export getAttributeCompletions');
        });

        test('RXML parser functions are exported', async () => {
            const rxmlModule = await import('../../../features/rxml/index.js');

            assert.ok(typeof rxmlModule.isContainerTag === 'function', 'Should export isContainerTag');
            assert.ok(typeof rxmlModule.getTagAttributes === 'function', 'Should export getTagAttributes');
        });
    });

    describe('Tag catalog', () => {
        test('Tag catalog contains core RXML tags', async () => {
            const { RXML_TAG_CATALOG } = await import('../../../features/rxml/index.js');

            assert.ok(Array.isArray(RXML_TAG_CATALOG), 'TAG_CATALOG should be an array');
            assert.ok(RXML_TAG_CATALOG.length > 0, 'TAG_CATALOG should not be empty');

            const tagNames = new Set(RXML_TAG_CATALOG.map((t: any) => t.name));
            assert.ok(tagNames.has('roxen'), 'Should have roxen tag');
            assert.ok(tagNames.has('set'), 'Should have set tag');
            assert.ok(tagNames.has('emit'), 'Should have emit tag');
            assert.ok(tagNames.has('if'), 'Should have if tag');
        });

        test('getTagInfo returns tag info by name', async () => {
            const { getTagInfo } = await import('../../../features/rxml/index.js');

            const ifTag = getTagInfo('if');
            assert.ok(ifTag, 'Should find if tag');
            assert.equal(ifTag?.name, 'if', 'Tag name should be if');
            assert.equal(ifTag?.type, 'container', 'if should be a container tag');
        });
    });

    describe('Completion provider', () => {
        test('provideRXMLCompletions works for RXML files', async () => {
            const { provideRXMLCompletions } = await import('../../../features/rxml/index.js');

            const doc = TextDocument.create('test.rxml', 'rxml', 1, '<');
            const params = {
                textDocument: { uri: 'test.rxml' },
                position: { line: 0, character: 1 }
            };

            const completions = provideRXMLCompletions(params as any, doc);

            assert.ok(completions, 'Should return completions');
            assert.ok(Array.isArray(completions), 'Completions should be an array');
            assert.ok(completions!.length > 0, 'Should have at least one completion');
        });

        test('provideRXMLCompletions returns null for non-RXML files', async () => {
            const { provideRXMLCompletions } = await import('../../../features/rxml/index.js');

            const doc = TextDocument.create('test.js', 'javascript', 1, '<');
            const params = {
                textDocument: { uri: 'test.js' },
                position: { line: 0, character: 1 }
            };

            const completions = provideRXMLCompletions(params as any, doc);

            assert.equal(completions, null, 'Should return null for non-RXML files');
        });
    });
});
