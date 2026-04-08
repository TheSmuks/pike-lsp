/**
 * E2E Tests for Mixed Content Integration (HTML + RXML + Pike)
 *
 * Issue #1227
 *
 * Verifies end-to-end handling of mixed content documents that combine
 * Pike code with embedded HTML and RXML in multiline string literals.
 *
 * Test categories:
 * 1. HTML + Pike mixed content parsing
 * 2. RXML + Pike mixed content parsing
 * 3. HTML + RXML + Pike combined
 * 4. Edge cases: unclosed tags, empty content, malformed markup
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import {
  calculateRXMLConfidence,
  detectRXMLMarkers,
  findRXMLStringAtPosition,
  mergeSymbolTrees,
  mapDocumentToContentPosition,
  mapContentToDocumentPosition,
  createPositionMapping,
  getRXMLTagCompletions,
  getRXMLAttributeCompletions,
  type RXMLStringLiteral,
} from '../features/rxml/mixed-content.js';
import type { DocumentSymbol } from 'vscode-languageserver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRXMLString(overrides: Partial<RXMLStringLiteral>): RXMLStringLiteral {
  return {
    content: '',
    range: {
      start: { line: 5, character: 12 },
      end: { line: 10, character: 4 },
    },
    fullRange: {
      start: { line: 5, character: 10 },
      end: { line: 10, character: 5 },
    },
    confidence: 0.8,
    markers: [],
    ...overrides,
  };
}

function makePikeSymbol(name: string, line: number): DocumentSymbol {
  return {
    name,
    kind: 12,
    range: {
      start: { line, character: 0 },
      end: { line: line + 5, character: 5 },
    },
    selectionRange: {
      start: { line, character: 0 },
      end: { line, character: name.length },
    },
    children: [],
  };
}

// ---------------------------------------------------------------------------
// 1. HTML + Pike Mixed Content
// ---------------------------------------------------------------------------

describe('E2E: HTML + Pike mixed content', () => {
  it('should detect HTML fragments embedded in Pike multiline strings', () => {
    const htmlContent = `
      <html>
        <head><title>Test Page</title></head>
        <body>
          <h1>Welcome</h1>
          <p>Hello from Pike!</p>
        </body>
      </html>
    `;
    const confidence = calculateRXMLConfidence(htmlContent);
    // Plain HTML without RXML tags should have low RXML confidence
    expect(confidence).toBeLessThan(0.5);
  });

  it('should position-map between Pike document and embedded HTML content', () => {
    const rxml = makeRXMLString({
      content: '<div class="main">\n  <p>Hello</p>\n</div>',
      range: { start: { line: 3, character: 20 }, end: { line: 5, character: 8 } },
      fullRange: { start: { line: 3, character: 17 }, end: { line: 5, character: 9 } },
    });

    const mapping = createPositionMapping(rxml);

    // Content line 0 maps to document line 3
    const docPos = mapContentToDocumentPosition({ line: 0, character: 5 }, mapping);
    expect(docPos.line).toBe(3);
    expect(docPos.character).toBe(25); // 5 + characterOffset 20

    // Content line 1 maps to document line 4
    const docPos2 = mapContentToDocumentPosition({ line: 1, character: 5 }, mapping);
    expect(docPos2.line).toBe(4);
    expect(docPos2.character).toBe(5);
  });

  it('should merge Pike symbols with HTML-containing strings in symbol tree', () => {
    const pikeSymbols = [makePikeSymbol('render_page', 1), makePikeSymbol('handle_request', 10)];

    const htmlStrings = [
      makeRXMLString({
        content: '<div><p>Output</p></div>',
        confidence: 0.1, // Low confidence — no RXML markers
        markers: [],
      }),
    ];

    const merged = mergeSymbolTrees(pikeSymbols, htmlStrings);
    // All Pike symbols preserved
    expect(merged.some(s => s.name === 'render_page')).toBe(true);
    expect(merged.some(s => s.name === 'handle_request')).toBe(true);
    // Low confidence HTML should not produce RXML Template
    expect(merged.find(s => s.name === 'RXML Template')).toBeUndefined();
  });

  it('should find string at position when cursor is inside HTML region', () => {
    const htmlString = makeRXMLString({
      content: '<div>Content here</div>',
      range: { start: { line: 2, character: 10 }, end: { line: 2, character: 33 } },
    });

    const found = findRXMLStringAtPosition({ line: 2, character: 20 }, [htmlString]);
    expect(found).not.toBeNull();
    expect(found!.content).toContain('<div>');
  });
});

// ---------------------------------------------------------------------------
// 2. RXML + Pike Mixed Content
// ---------------------------------------------------------------------------

describe('E2E: RXML + Pike mixed content', () => {
  it('should assign high confidence to RXML with standard tags', () => {
    const rxmlContent = `
      <roxen>
        <set variable="var.x">42</set>
        <emit source="sql" query="SELECT id FROM users">
          <row><column name="id"/></row>
        </emit>
        <if variable="var.x > 0">
          <contents/>
        </if>
      </roxen>
    `;
    const confidence = calculateRXMLConfidence(rxmlContent);
    expect(confidence).toBeGreaterThan(0.6);
  });

  it('should detect all RXML markers in combined content', () => {
    const content = `
      <set variable="var.title">My Page</set>
      <emit source="db" query="SELECT * FROM pages">
        <row>
          <column name="title"/>
        </row>
      </emit>
      <if variable="var.admin">
        <foreach variable="list">
          <contents/>
        </foreach>
      </if>
    `;
    const markers = detectRXMLMarkers(content);
    const names = markers.map(m => m.name);

    expect(names).toContain('set');
    expect(names).toContain('emit');
    expect(names).toContain('if');
    expect(names).toContain('foreach');
  });

  it('should merge RXML markers as children under RXML Template symbol', () => {
    const pikeSymbols = [makePikeSymbol('simpletag_page', 0)];

    const rxmlStrings = [
      makeRXMLString({
        content: "<set variable='var.x'>1</set>\n<emit source='sql'>SELECT 1</emit>",
        confidence: 0.85,
        markers: [
          { type: 'tag', name: 'set', position: { line: 0, character: 1 } },
          { type: 'tag', name: 'emit', position: { line: 1, character: 1 } },
        ],
      }),
    ];

    const merged = mergeSymbolTrees(pikeSymbols, rxmlStrings);

    const rxmlContainer = merged.find(s => s.name === 'RXML Template');
    expect(rxmlContainer).toBeDefined();
    expect(rxmlContainer!.children!.map(c => c.name)).toContain('set');
    expect(rxmlContainer!.children!.map(c => c.name)).toContain('emit');
  });

  it('should provide tag completions in RXML context', () => {
    const rxml = makeRXMLString({
      content: '<set variable="x">val</set>',
    });
    const tags = getRXMLTagCompletions(rxml, { line: 0, character: 0 });
    expect(tags).toContain('set');
    expect(tags).toContain('emit');
    expect(tags).toContain('if');
    expect(tags).toContain('roxen');
  });

  it('should provide attribute completions for RXML tags', () => {
    expect(getRXMLAttributeCompletions('set')).toContain('variable');
    expect(getRXMLAttributeCompletions('set')).toContain('scope');
    expect(getRXMLAttributeCompletions('emit')).toContain('source');
    expect(getRXMLAttributeCompletions('emit')).toContain('query');
  });
});

// ---------------------------------------------------------------------------
// 3. HTML + RXML + Pike Combined
// ---------------------------------------------------------------------------

describe('E2E: HTML + RXML + Pike combined', () => {
  const combinedContent = `
    <html>
      <head><title><roxen><set variable="var.title">Welcome</set><insert variable="var.title"/></roxen></title></head>
      <body>
        <roxen>
          <emit source="sql" query="SELECT name FROM users">
            <row><p><column name="name"/></p></row>
          </emit>
          <if variable="var.admin">
            <set variable="var.show_admin">1</set>
          </if>
        </roxen>
      </body>
    </html>
  `;

  it('should detect RXML markers within HTML scaffolding', () => {
    const markers = detectRXMLMarkers(combinedContent);
    const names = markers.map(m => m.name);
    expect(names).toContain('roxen');
    expect(names).toContain('set');
    expect(names).toContain('emit');
    expect(names).toContain('if');
  });

  it('should assign high confidence to HTML+RXML combined content', () => {
    const confidence = calculateRXMLConfidence(combinedContent);
    expect(confidence).toBeGreaterThan(0.5);
  });

  it('should correctly merge Pike, HTML, and RXML into unified symbol tree', () => {
    const pikeSymbols = [
      makePikeSymbol('render_template', 0),
      makePikeSymbol('process_request', 20),
    ];

    const combinedStrings = [
      makeRXMLString({
        content: combinedContent,
        confidence: 0.9,
        markers: [
          { type: 'tag', name: 'roxen', position: { line: 1, character: 28 } },
          { type: 'tag', name: 'set', position: { line: 1, character: 37 } },
          { type: 'tag', name: 'emit', position: { line: 5, character: 11 } },
          { type: 'tag', name: 'if', position: { line: 8, character: 11 } },
        ],
      }),
    ];

    const merged = mergeSymbolTrees(pikeSymbols, combinedStrings);

    // Pike symbols preserved
    expect(merged.some(s => s.name === 'render_template')).toBe(true);
    expect(merged.some(s => s.name === 'process_request')).toBe(true);

    // RXML Template container exists
    const rxmlContainer = merged.find(s => s.name === 'RXML Template');
    expect(rxmlContainer).toBeDefined();

    // All RXML markers are children
    const childNames = rxmlContainer!.children!.map(c => c.name);
    expect(childNames).toContain('roxen');
    expect(childNames).toContain('set');
    expect(childNames).toContain('emit');
    expect(childNames).toContain('if');
  });

  it('should map positions correctly in combined content', () => {
    const combined = makeRXMLString({
      content: '<div>\n<set variable="x">1</set>\n</div>',
      range: { start: { line: 10, character: 15 }, end: { line: 12, character: 7 } },
      fullRange: { start: { line: 10, character: 12 }, end: { line: 12, character: 8 } },
    });

    const mapping = createPositionMapping(combined);

    // Line 0 in content → line 10 in doc, with char offset
    const docPos = mapContentToDocumentPosition({ line: 0, character: 3 }, mapping);
    expect(docPos.line).toBe(10);
    expect(docPos.character).toBe(18); // 3 + 15

    // Line 1 in content → line 11 in doc, no char offset
    const docPos2 = mapContentToDocumentPosition({ line: 1, character: 2 }, mapping);
    expect(docPos2.line).toBe(11);
    expect(docPos2.character).toBe(2);

    // Reverse: document line 11 → content line 1
    const contentPos = mapDocumentToContentPosition({ line: 11, character: 5 }, combined);
    expect(contentPos).not.toBeNull();
    expect(contentPos!.line).toBe(1);
    expect(contentPos!.character).toBe(5);
  });

  it('should find correct string at position among multiple mixed strings', () => {
    const htmlOnly = makeRXMLString({
      content: '<div>HTML only</div>',
      range: { start: { line: 1, character: 10 }, end: { line: 1, character: 29 } },
      confidence: 0.1,
    });

    const rxmlInHtml = makeRXMLString({
      content: '<div><roxen><set variable="x">1</set></roxen></div>',
      range: { start: { line: 5, character: 10 }, end: { line: 5, character: 55 } },
      confidence: 0.9,
    });

    // Position inside RXML string
    const found = findRXMLStringAtPosition({ line: 5, character: 30 }, [htmlOnly, rxmlInHtml]);
    expect(found).not.toBeNull();
    expect(found!.confidence).toBe(0.9);
    expect(found!.content).toContain('roxen');

    // Position inside HTML-only string
    const found2 = findRXMLStringAtPosition({ line: 1, character: 20 }, [htmlOnly, rxmlInHtml]);
    expect(found2).not.toBeNull();
    expect(found2!.content).toContain('HTML only');
  });
});

// ---------------------------------------------------------------------------
// 4. Edge Cases: Unclosed Tags, Empty Content, Malformed Markup
// ---------------------------------------------------------------------------

describe('E2E: Edge cases for mixed content', () => {
  it('should handle unclosed RXML tags without crashing', () => {
    const unclosed = '<set variable="x">value<emit source="db">';
    expect(() => {
      const markers = detectRXMLMarkers(unclosed);
      const confidence = calculateRXMLConfidence(unclosed);
      return { markers, confidence };
    }).not.toThrow();
  });

  it('should handle empty RXML string content', () => {
    const empty = makeRXMLString({ content: '', markers: [], confidence: 0 });
    expect(() => {
      detectRXMLMarkers(empty.content);
      calculateRXMLConfidence(empty.content);
    }).not.toThrow();
  });

  it('should handle whitespace-only content', () => {
    const whitespace = '   \n  \n   ';
    const confidence = calculateRXMLConfidence(whitespace);
    expect(confidence).toBe(0);

    const markers = detectRXMLMarkers(whitespace);
    expect(markers).toHaveLength(0);
  });

  it('should handle malformed HTML tags mixed with valid RXML', () => {
    const malformed = '<set variable="x"><div class=><emit source="db" /></div></set>';
    const markers = detectRXMLMarkers(malformed);
    const names = markers.map(m => m.name);
    expect(names).toContain('set');
    expect(names).toContain('emit');
  });

  it('should handle deeply nested tags', () => {
    const nested = `
      <roxen>
        <if variable="var.x">
          <foreach variable="items">
            <set variable="var.count">0</set>
            <emit source="db">
              <row>
                <column name="id"/>
              </row>
            </emit>
          </foreach>
        </if>
      </roxen>
    `;
    const markers = detectRXMLMarkers(nested);
    const names = markers.map(m => m.name);
    expect(names).toContain('roxen');
    expect(names).toContain('if');
    expect(names).toContain('foreach');
    expect(names).toContain('set');
    expect(names).toContain('emit');
    expect(names).toContain('column');
  });

  it('should handle mixed RXML entities and tags', () => {
    const withEntities = '<set variable="x">&roxen.version;</set>&form.username;';
    const markers = detectRXMLMarkers(withEntities);
    const entityMarkers = markers.filter(m => m.type === 'entity');
    const tagMarkers = markers.filter(m => m.type === 'tag');
    expect(entityMarkers.length).toBeGreaterThan(0);
    expect(tagMarkers.length).toBeGreaterThan(0);
  });

  it('should return null for position outside all strings', () => {
    const strings = [
      makeRXMLString({
        range: { start: { line: 2, character: 5 }, end: { line: 2, character: 30 } },
      }),
    ];
    const found = findRXMLStringAtPosition({ line: 0, character: 0 }, strings);
    expect(found).toBeNull();
  });

  it('should handle merging with empty Pike symbols', () => {
    const rxmlStrings = [
      makeRXMLString({
        confidence: 0.8,
        markers: [{ type: 'tag', name: 'set', position: { line: 0, character: 1 } }],
      }),
    ];
    const merged = mergeSymbolTrees([], rxmlStrings);
    expect(merged.some(s => s.name === 'RXML Template')).toBe(true);
  });

  it('should handle special characters in RXML content', () => {
    const special = '<set variable="x">Value with &lt;special&gt; chars &amp; symbols</set>';
    const markers = detectRXMLMarkers(special);
    expect(markers.some(m => m.name === 'set')).toBe(true);
  });

  it('should correctly map boundary positions', () => {
    const rxml = makeRXMLString({
      content: 'hello',
      range: { start: { line: 4, character: 10 }, end: { line: 4, character: 15 } },
      fullRange: { start: { line: 4, character: 7 }, end: { line: 4, character: 16 } },
    });

    // Exactly at start
    const atStart = findRXMLStringAtPosition({ line: 4, character: 10 }, [rxml]);
    expect(atStart).not.toBeNull();

    // Exactly at end
    const atEnd = findRXMLStringAtPosition({ line: 4, character: 15 }, [rxml]);
    expect(atEnd).not.toBeNull();

    // One before start
    const beforeStart = findRXMLStringAtPosition({ line: 4, character: 9 }, [rxml]);
    expect(beforeStart).toBeNull();
  });

  it('should not produce RXML Template for content below confidence threshold', () => {
    const pikeSymbols = [makePikeSymbol('test_func', 0)];
    const lowConfidenceStrings = [
      makeRXMLString({
        content: 'Just some text, nothing special',
        confidence: 0.05,
        markers: [],
      }),
    ];
    const merged = mergeSymbolTrees(pikeSymbols, lowConfidenceStrings);
    expect(merged.find(s => s.name === 'RXML Template')).toBeUndefined();
    expect(merged).toHaveLength(pikeSymbols.length);
  });
});
