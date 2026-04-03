import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RXMLASTParser, RXMLTagNode, RXMLPikeCodeNode, RXMLCommentNode } from '../features/rxml/rxml-ast-parser.js';

describe('RXML AST Parser', () => {
  const parser = new RXMLASTParser();

  it('should parse simple tag', () => {
    const doc = parser.parse('<div>content</div>');
    // Parser treats open and close as separate (simplified)
    assert.ok(doc.nodes.length >= 1);
    const tag = doc.nodes[0]! as RXMLTagNode;
    assert.equal(tag.name, 'div');
    assert.equal(tag.type, 'tag');
  });

  it('should parse self-closing tag', () => {
    const doc = parser.parse('<br />');
    assert.ok(doc.nodes.length >= 1);
    const tag = doc.nodes[0]! as RXMLTagNode;
    assert.equal(tag.name, 'br');
    assert.equal(tag.selfClosing, true);
  });

  it('should parse attributes', () => {
    const doc = parser.parse('<tag attr="value">');
    const tag = doc.nodes[0]! as RXMLTagNode;
    assert.equal(tag.attributes.length, 1);
    assert.equal(tag.attributes[0]?.name, 'attr');
    assert.equal(tag.attributes[0]?.value, 'value');
  });

  it('should parse comments', () => {
    const doc = parser.parse('<!-- comment -->');
    assert.equal(doc.nodes.length, 1);
    const node = doc.nodes[0]!;
    assert.equal(node.type, 'comment');
    assert.equal((node as RXMLCommentNode).content, 'comment');
  });

  it('should skip content inside comments', () => {
    const doc = parser.parse('<!-- <not> a tag </not> -->');
    assert.equal(doc.nodes.length, 1);
    assert.equal(doc.nodes[0]!.type, 'comment');
  });

  it('should parse pike code regions', () => {
    const doc = parser.parse('<pike>write("hello");</pike>');
    assert.equal(doc.nodes.length, 1);
    const node = doc.nodes[0]!;
    assert.equal(node.type, 'pike-code');
    assert.equal((node as RXMLPikeCodeNode).content, 'write("hello");');
  });

  it('should parse text content', () => {
    const doc = parser.parse('hello world');
    assert.equal(doc.nodes.length, 1);
    assert.equal(doc.nodes[0]!.type, 'text');
  });

  it('should use no regex patterns', () => {
    // This test verifies the implementation doesn't use regex
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(
      path.join(__dirname, '../features/rxml/rxml-ast-parser.ts'),
      'utf-8'
    );
    // Should not contain regex literal patterns for tag matching
    assert.ok(!content.includes('/[<>]/'), 'Should not use regex for tag detection');
    assert.ok(!content.includes('/\\w+/'), 'Should not use word regex');
  });
});
