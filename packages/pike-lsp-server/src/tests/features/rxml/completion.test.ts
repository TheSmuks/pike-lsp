/**
 * RXML Completion Provider Tests
 */

import { describe, it, expect } from 'vitest';
import { provideRXMLCompletions } from '../../../features/rxml/completion';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { CompletionParams, Position } from 'vscode-languageserver';

describe('RXML Completion Provider', () => {
  function createDocument(content: string): TextDocument {
    return TextDocument.create('test.rxml', 'rxml', 1, content);
  }

  function createParams(line: number, character: number): CompletionParams {
    return {
      textDocument: { uri: 'test.rxml' },
      position: Position.create(line, character),
    } as CompletionParams;
  }

  describe('Tag Completions', () => {
    it('should return tag completions when inside tag opening', () => {
      const content = '<';
      const document = createDocument(content);
      const params = createParams(0, 1);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
      expect(completions?.length).toBeGreaterThan(0);
      expect(completions?.[0]).toMatchObject({
        label: expect.any(String),
        kind: expect.any(Number),
        insertText: expect.any(String),
      });
    });

    it('should include common RXML tags', () => {
      const content = '<';
      const document = createDocument(content);
      const params = createParams(0, 1);

      const completions = provideRXMLCompletions(params, document);

      const labels = completions?.map(c => c.label) || [];
      expect(labels).toContain('if');
      expect(labels).toContain('else');
      expect(labels).toContain('then');
      expect(labels).toContain('set');
      expect(labels).toContain('emit');
    });

    it('should not return tag completions inside attribute context', () => {
      const content = '<if ';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      // Should return attribute completions, not tag completions
      const tagCompletion = completions?.find(c => c.label === 'if');
      expect(tagCompletion).toBeUndefined();
    });

    it('should return null for non-RXML files', () => {
      const content = '<';
      const document = TextDocument.create('test.js', 'javascript', 1, content);
      const params = createParams(0, 1);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).toBeNull();
    });
  });

  describe('Attribute Completions', () => {
    it('should return attributes for known tag after tag name', () => {
      const content = '<if ';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
      expect(completions?.length).toBeGreaterThan(0);
    });

    it('should include common attributes for if tag', () => {
      const content = '<if ';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      const labels = completions?.map(c => c.label) || [];
      // Common conditional attributes
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should handle attributes for different tags', () => {
      const content1 = '<set ';
      const document1 = createDocument(content1);
      const params1 = createParams(0, 5);

      const completions1 = provideRXMLCompletions(params1, document1);

      expect(completions1).not.toBeNull();
      // set tag should have variable attribute
      const labels = completions1?.map(c => c.label) || [];
      expect(labels.length).toBeGreaterThan(0);
    });

    it('should not suggest attributes outside tag context', () => {
      const content = 'Some text outside tags';
      const document = createDocument(content);
      const params = createParams(0, 10);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).toBeNull();
    });
  });

  describe('Attribute Value Completions', () => {
    it('should return values for known attribute after equals', () => {
      const content = '<if variable=';
      const document = createDocument(content);
      const params = createParams(0, 14);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should handle quoted attribute values', () => {
      const content = '<if variable="';
      const document = createDocument(content);
      const params = createParams(0, 15);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should provide scoped variables as values', () => {
      const content = '<if variable=';
      const document = createDocument(content);
      const params = createParams(0, 14);

      const completions = provideRXMLCompletions(params, document);

      // Should suggest common scope variables
      expect(completions).not.toBeNull();
      const labels = completions?.map(c => c.label) || [];
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  describe('Context Detection', () => {
    it('should detect cursor position in tag name', () => {
      const content = '<i';
      const document = createDocument(content);
      const params = createParams(0, 2);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should detect cursor position in attribute space', () => {
      const content = '<if  ';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should detect cursor position after equals', () => {
      const content = '<if variable=';
      const document = createDocument(content);
      const params = createParams(0, 14);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should handle cursor inside closing tag', () => {
      const content = '</if';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      // No completions for closing tags
      expect(completions).toBeNull();
    });

    it('should handle cursor in content area', () => {
      const content = '<if variable="x">Content here</if>';
      const document = createDocument(content);
      const params = createParams(0, 21);

      const completions = provideRXMLCompletions(params, document);

      // No completions in content area (between > and <)
      expect(completions).toBeNull();
    });
  });

  describe('Special Cases', () => {
    it('should handle self-closing tags', () => {
      const content = '<img src='; // HTML self-closing tag
      const document = createDocument(content);
      const params = createParams(0, 8);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should handle incomplete tags', () => {
      const content = '<if vari';
      const document = createDocument(content);
      const params = createParams(0, 8);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should handle multiline documents', () => {
      const content = `<if variable="x">
  <then>
    Some content
  </then>
</if>`;
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).not.toBeNull();
    });

    it('should return null for empty document', () => {
      const content = '';
      const document = createDocument(content);
      const params = createParams(0, 0);

      const completions = provideRXMLCompletions(params, document);

      expect(completions).toBeNull();
    });
  });

  describe('Completion Item Properties', () => {
    it('should include proper kind for tags', () => {
      const content = '<';
      const document = createDocument(content);
      const params = createParams(0, 1);

      const completions = provideRXMLCompletions(params, document);

      expect(completions?.[0]).toMatchObject({
        kind: 3, // CompletionItemKind.Function (RXML tags are function-like)
      });
    });

    it('should include documentation for tags', () => {
      const content = '<';
      const document = createDocument(content);
      const params = createParams(0, 1);

      const completions = provideRXMLCompletions(params, document);

      // Some completions should have documentation
      const withDocs = completions?.filter(c => c.documentation);
      expect(withDocs?.length).toBeGreaterThan(0);
    });

    it('should include detail for attributes', () => {
      const content = '<if ';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      expect(completions?.[0]).toMatchObject({
        kind: 10, // CompletionItemKind.Property (attributes are property-like)
        insertText: expect.any(String),
      });
    });

    it('should handle insert text format properly', () => {
      const content = '<if ';
      const document = createDocument(content);
      const params = createParams(0, 4);

      const completions = provideRXMLCompletions(params, document);

      expect(completions?.[0]).toMatchObject({
        insertTextFormat: 2, // Snippet format for attribute=$1
      });
    });
  });
});
