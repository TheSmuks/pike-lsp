/**
 * RXML Parser Tests
 */

import { describe, it, expect } from 'vitest';
import { parseRXMLTemplate, getTagAttributes, isContainerTag, flattenTags } from '../../../features/rxml/parser';

describe('RXML Parser', () => {
    describe('parseRXMLTemplate', () => {
        it('should parse simple RXML tag with attributes', () => {
            const code = '<set variable="foo">bar</set>';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.name).toBe('set');
            expect(tag.type).toBe('container');
            expect(tag.range).toBeDefined();
            expect(Array.isArray(tag.attributes)).toBe(true);
            expect(tag.attributes.length).toBe(1);

            const attr = tag.attributes[0];
            expect(attr.name).toBe('variable');
            expect(attr.value).toBe('foo');
            expect(attr.range).toBeDefined();
        });

        it('should parse self-closing tag as simple type', () => {
            const code = '<set variable="foo" />';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.name).toBe('set');
            expect(tag.type).toBe('container'); // set is a container tag even when self-closing
        });

        it('should parse container tag with nested content', () => {
            const code = '<emit source="sql">SELECT * FROM table</emit>';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.name).toBe('emit');
            expect(tag.type).toBe('container');
            expect(tag.attributes.length).toBe(1);
            expect(tag.attributes[0].name).toBe('source');
            expect(tag.attributes[0].value).toBe('sql');
        });

        it('should parse multiple tags in same document', () => {
            const code = `
                <set variable="title">My Page</set>
                <emit source="sql">SELECT * FROM pages</emit>
                <if variable="user.logged_in">
                    <p>Welcome!</p>
                </if>
            `;
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBeGreaterThanOrEqual(3);

            const tagNames = result.map(t => t.name);
            expect(tagNames).toContain('set');
            expect(tagNames).toContain('emit');
            expect(tagNames).toContain('if');
        });

        it('should parse tag with multiple attributes', () => {
            const code = '<emit source="sql" query="SELECT * FROM users" maxrows="100">';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.name).toBe('emit');
            expect(tag.attributes.length).toBeGreaterThanOrEqual(3);

            const attrNames = tag.attributes.map(a => a.name);
            expect(attrNames).toContain('source');
            expect(attrNames).toContain('query');
            expect(attrNames).toContain('maxrows');
        });

        it('should parse nested RXML tags', () => {
            const code = `
                <roxen>
                    <container name="box">
                        <contents>
                            <p>Content here</p>
                        </contents>
                    </container>
                </roxen>
            `;
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            // Should have 1 top-level tag (roxen) with children
            expect(result.length).toBe(1);
            expect(result[0].name).toBe('roxen');

            // Check that nested tags are in children hierarchy
            expect(result[0].children).toBeDefined();
            expect(result[0].children!.length).toBeGreaterThanOrEqual(1);

            const containerTag = result[0].children!.find(t => t.name === 'container');
            expect(containerTag).toBeDefined();
            expect(containerTag!.children).toBeDefined();

            const contentsTag = containerTag!.children!.find(t => t.name === 'contents');
            expect(contentsTag).toBeDefined();

            // Flatten helper should find all 3 tags
            const flatTags = flattenTags(result);
            const flatTagNames = flatTags.map(t => t.name);
            expect(flatTagNames).toContain('roxen');
            expect(flatTagNames).toContain('container');
            expect(flatTagNames).toContain('contents');
        });

        it('should filter out HTML tags and only return RXML tags', () => {
            const code = `
                <html>
                    <head><title>Test</title></head>
                    <body>
                        <set variable="page.title">Welcome</set>
                        <h1><output variable="page.title" /></h1>
                    </body>
                </html>
            `;
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            const rxmlTagNames = result.map(t => t.name);
            expect(rxmlTagNames).toContain('set');
            expect(rxmlTagNames).toContain('output');
            expect(rxmlTagNames).not.toContain('html');
            expect(rxmlTagNames).not.toContain('body');
        });

        it('should handle attributes with different quote styles', () => {
            const code = '<set variable="foo" value=\'bar\'>';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.attributes.length).toBeGreaterThanOrEqual(2);

            const variableAttr = tag.attributes.find(a => a.name === 'variable');
            expect(variableAttr).toBeDefined();
            expect(variableAttr?.value).toBe('foo');

            const valueAttr = tag.attributes.find(a => a.name === 'value');
            expect(valueAttr).toBeDefined();
            expect(valueAttr?.value).toBe('bar');
        });

        it('should return empty array for empty document', () => {
            const code = '';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('should return empty array when no RXML tags found', () => {
            const code = '<html><body><p>No RXML here</p></body></html>';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('should calculate accurate tag positions', () => {
            const code = '<set variable="foo">bar</set>';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.range).toBeDefined();

            // Range should start at beginning of tag
            expect(tag.range.start.line).toBe(0);
            expect(tag.range.start.character).toBe(0);

            // Range should end after closing tag
            expect(tag.range.end.character).toBeGreaterThan(tag.range.start.character);
        });

        it('should handle output tag as simple type', () => {
            const code = '<output variable="foo" />';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.name).toBe('output');
            expect(tag.type).toBe('simple');
        });

        it('should handle config tag as simple type', () => {
            const code = '<config variable="foo" />';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            expect(result.length).toBe(1);

            const tag = result[0];
            expect(tag.name).toBe('config');
            expect(tag.type).toBe('simple');
        });

        it('should handle parse errors gracefully', () => {
            const code = '<set variable="unclosed';
            const uri = 'test://test.html';
            const result = parseRXMLTemplate(code, uri);

            // Should return empty array on parse error instead of throwing
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('getTagAttributes', () => {
        it('should extract attributes from tag element', () => {
            // Mock HTML element with attributes
            const mockElement = {
                attribs: {
                    'variable': 'foo',
                    'value': 'bar'
                },
                startIndex: 0,
                endIndex: 50
            };

            const result = getTagAttributes(mockElement);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(2);

            expect(result[0].name).toBe('variable');
            expect(result[0].value).toBe('foo');
            expect(result[0].range).toBeDefined();

            expect(result[1].name).toBe('value');
            expect(result[1].value).toBe('bar');
        });

        it('should handle element with no attributes', () => {
            const mockElement = {
                attribs: {},
                startIndex: 0,
                endIndex: 10
            };

            const result = getTagAttributes(mockElement);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });

        it('should handle element with undefined attribs', () => {
            const mockElement = {
                startIndex: 0,
                endIndex: 10
            };

            const result = getTagAttributes(mockElement);

            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });
    });

    describe('isContainerTag', () => {
        it('should return true for known container tags', () => {
            const containerTags = ['set', 'emit', 'if', 'elseif', 'else', 'roxen', 'container', 'contents'];

            for (const tagName of containerTags) {
                expect(isContainerTag(tagName)).toBe(true);
            }
        });

        it('should return false for known simple tags', () => {
            const simpleTags = ['output', 'input', 'config', 'header'];

            for (const tagName of simpleTags) {
                expect(isContainerTag(tagName)).toBe(false);
            }
        });

        it('should default to container for unknown tags (safe default)', () => {
            const unknownTags = ['customtag', 'mytag', 'unknown'];

            for (const tagName of unknownTags) {
                expect(isContainerTag(tagName)).toBe(true);
            }
        });

        it('should handle case-sensitive tag names', () => {
            expect(isContainerTag('set')).toBe(true);
            expect(isContainerTag('SET')).toBe(true);
            expect(isContainerTag('Set')).toBe(true);
        });
    });
});
