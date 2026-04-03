import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { RXMLASTParser, RXMLTagNode, RXMLPikeCodeNode, RXMLCommentNode } from '../features/rxml/rxml-ast-parser.js';

describe('RXML AST Parser', () => {
  const parser = new RXMLASTParser();

  it('should parse simple tag', () => {
    const doc = parser.parse('<div>content</div>');
    assert.equal(doc.nodes.length, 1);
    assert.equal((doc.nodes[0] as RXMLTagNode).name, 'div');
    assert.equal((doc.nodes[0] as RXMLTagNode).children[0].type, 'text');
  });

  it('should parse self-closing tag', () => {
    const doc = parser.parse('<br />');
    assert.equal(doc.nodes.length, 1);
    assert.equal((doc.nodes[0] as RXMLTagNode).name, 'br');
    assert.equal((doc.nodes[0] as RXMLTagNode).selfClosing, true);
  });

  it('should parse nested tags', () => {
    const doc = parser.parse('<outer><inner>text</inner></outer>');
    assert.equal(doc.nodes.length, 1);
    const outer = doc.nodes[0] as RXMLTagNode;
    assert.equal(outer.name, 'outer');
    assert.equal(outer.children.length, 1);
    assert.equal((outer.children[0] as RXMLTagNode).name, 'inner');
  });

  it('should parse attributes', () => {
    const doc = parser.parse('<tag attr="value">text</tag>');
    const tag = doc.nodes[0] as RXMLTagNode;
    assert.equal(tag.attributes.length, 1);
    assert.equal(tag.attributes[0].name, 'attr');
    assert.equal(tag.attributes[0].value, 'value');
  });

  it('should parse comments', () => {
    const doc = parser.parse('<!-- comment -->');
    assert.equal(doc.nodes.length, 1);
    assert.equal(doc.nodes[0].type, 'comment');
    assert.equal((doc.nodes[0] as RXMLCommentNode).content, 'comment');
  });

  it('should skip content inside comments', () => {
    const doc = parser.parse('<!-- <not> a tag </not> -->');
    assert.equal(doc.nodes.length, 1);
    assert.equal(doc.nodes[0].type, 'comment');
  });

  it('should parse pike code regions', () => {
    const doc = parser.parse('<pike>write("hello");</pike>');
    assert.equal(doc.nodes.length, 1);
    assert.equal(doc.nodes[0].type, 'pike-code');
    assert.equal((doc.nodes[0] as RXMLPikeCodeNode).content, 'write("hello");');
  });

  it('should handle complex mixed content', () => {
    const input = `
<use tag="mytag">
  <mytag>
    <inner attr="value">
      <pike>write("hello");</pike>
    </inner>
  </mytag>
</use>
    `.trim();
    
    const doc = parser.parse(input);
    assert.equal(doc.nodes.length, 1);
    const useTag = doc.nodes[0] as RXMLTagNode;
    assert.equal(useTag.name, 'use');
    assert.equal(useTag.attributes.length, 1);
    assert.equal(useTag.attributes[0].name, 'tag');
  });
});
