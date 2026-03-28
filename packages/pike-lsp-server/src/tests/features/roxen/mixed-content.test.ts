/**
 * Mixed Pike + RXML Content Tests
 *
 * Tests for detecting and parsing RXML content embedded in Pike multiline
 * string literals (#"..." and #'...').
 *
 * Covers: RXML string detection, confidence scoring, marker extraction,
 * position mapping, symbol tree merging, and context-aware completions.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import type { DocumentSymbol, Position, Range } from 'vscode-languageserver';

import {
  calculateRXMLConfidence,
  detectRXMLMarkers,
  mapContentToDocumentPosition,
  mapDocumentToContentPosition,
  findRXMLStringAtPosition,
  mergeSymbolTrees,
  createPositionMapping,
  getRXMLTagCompletions,
  getRXMLAttributeCompletions,
  type RXMLStringLiteral,
  type RXMLMarker,
} from '../../../features/rxml/mixed-content.js';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const sampleRXMLString: RXMLStringLiteral = {
  content: '\n        <set variable="foo">bar</set>\n    ',
  range: {
    start: { line: 6, character: 15 },
    end: { line: 8, character: 5 },
  },
  fullRange: {
    start: { line: 6, character: 12 },
    end: { line: 8, character: 6 },
  },
  confidence: 0.8,
  markers: [{ type: 'tag', name: 'set', position: { line: 1, character: 9 } }],
};

const pikeSymbols: DocumentSymbol[] = [
  {
    name: 'simpletag_foo',
    kind: 12,
    range: { start: { line: 5, character: 0 }, end: { line: 9, character: 5 } },
    selectionRange: { start: { line: 5, character: 0 }, end: { line: 5, character: 31 } },
    children: [],
  },
];

// ---------------------------------------------------------------------------
// calculateRXMLConfidence
// ---------------------------------------------------------------------------

describe('calculateRXMLConfidence', () => {
  it('should score high for combined RXML patterns', () => {
    const confidence = calculateRXMLConfidence(
      '<roxen><set variable="foo">bar</set><emit source="db">SELECT</emit>&roxen.version;</roxen>'
    );
    assert.ok(confidence > 0.7, `Expected > 0.7, got ${confidence}`);
  });

  it('should score low (< 0.3) for plain text', () => {
    const confidence = calculateRXMLConfidence('This is just plain text with no tags.');
    assert.ok(confidence < 0.3, `Expected < 0.3, got ${confidence}`);
  });

  it('should score <roxen> tags with +0.4 weight', () => {
    const confidence = calculateRXMLConfidence('<roxen><contents>test</contents></roxen>');
    assert.ok(confidence >= 0.4, `Expected >= 0.4, got ${confidence}`);
  });

  it('should score <set> and <emit> with +0.2 each', () => {
    const confidence = calculateRXMLConfidence(
      '<set variable="x">y</set><emit source="db">SELECT</emit>'
    );
    assert.ok(confidence >= 0.4, `Expected >= 0.4, got ${confidence}`);
  });

  it('should detect RXML entities (&roxen.*, &form.*) with +0.2', () => {
    const confidence = calculateRXMLConfidence('&roxen.version; &form.username;');
    assert.ok(confidence >= 0.2, `Expected >= 0.2, got ${confidence}`);
  });
});

// ---------------------------------------------------------------------------
// detectRXMLMarkers
// ---------------------------------------------------------------------------

describe('detectRXMLMarkers', () => {
  it('should detect standard RXML tags', () => {
    const tags = ['set', 'emit', 'if', 'roxen', 'foreach', 'cache'];
    const content = tags.map(t => `<${t}>`).join(' ');
    const markers = detectRXMLMarkers(content);
    const detectedNames = markers.map(m => m.name);

    for (const tag of tags) {
      assert.ok(detectedNames.includes(tag), `Expected marker for "${tag}"`);
    }
  });

  it('should categorize markers by type (tag, entity)', () => {
    const content = '<set variable="x">&roxen.version;</set>';
    const markers = detectRXMLMarkers(content);

    const tagMarkers = markers.filter(m => m.type === 'tag');
    const entityMarkers = markers.filter(m => m.type === 'entity');

    assert.ok(tagMarkers.length > 0, 'Expected tag markers');
    assert.ok(entityMarkers.length > 0, 'Expected entity markers');
    assert.equal(tagMarkers[0].name, 'set');
    assert.equal(entityMarkers[0].name, 'roxen');
  });

  it('should return accurate marker positions within content', () => {
    const content = 'prefix <set variable="x">value</set> suffix';
    const markers = detectRXMLMarkers(content);

    const setMarker = markers.find(m => m.name === 'set');
    assert.ok(setMarker, 'Expected "set" marker');
    assert.equal(setMarker.position.character, 7);
    assert.equal(setMarker.position.line, 0);
  });

  it('should handle multi-line content', () => {
    const content = '<set>\n  <emit>\n  </emit>\n</set>';
    const markers = detectRXMLMarkers(content);

    const setMarkers = markers.filter(m => m.name === 'set');
    const emitMarkers = markers.filter(m => m.name === 'emit');

    assert.ok(setMarkers.length >= 2, 'Expected opening and closing set tags');
    assert.ok(emitMarkers.length >= 2, 'Expected opening and closing emit tags');
  });

  it('should not detect unknown tags as markers', () => {
    const content = '<unknown_tag>foo</unknown_tag>';
    const markers = detectRXMLMarkers(content);
    assert.equal(markers.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Position Mapping — mapContentToDocumentPosition
// ---------------------------------------------------------------------------

describe('mapContentToDocumentPosition', () => {
  it('should map content position to document position', () => {
    const mapping = createPositionMapping(sampleRXMLString);
    const docPos = mapContentToDocumentPosition({ line: 1, character: 12 }, mapping);

    // line 1 in content + lineOffset 6 = line 7 in document
    assert.equal(docPos.line, 7);
    // First line (line 0) adds characterOffset; non-first lines keep character
    assert.equal(docPos.character, 12);
  });

  it('should add characterOffset on first line of content', () => {
    const mapping = createPositionMapping(sampleRXMLString);
    const docPos = mapContentToDocumentPosition({ line: 0, character: 0 }, mapping);

    assert.equal(docPos.line, 6);
    assert.equal(docPos.character, 15); // characterOffset
  });
});

// ---------------------------------------------------------------------------
// Position Mapping — mapDocumentToContentPosition
// ---------------------------------------------------------------------------

describe('mapDocumentToContentPosition', () => {
  it('should map document position to content position', () => {
    const contentPos = mapDocumentToContentPosition({ line: 7, character: 20 }, sampleRXMLString);

    assert.ok(contentPos !== null, 'Expected content position');
    assert.equal(contentPos!.line, 1);
    assert.equal(contentPos!.character, 20);
  });

  it('should return null for positions before the string', () => {
    const contentPos = mapDocumentToContentPosition({ line: 5, character: 0 }, sampleRXMLString);
    assert.equal(contentPos, null);
  });

  it('should return null for positions after the string', () => {
    const contentPos = mapDocumentToContentPosition({ line: 9, character: 0 }, sampleRXMLString);
    assert.equal(contentPos, null);
  });

  it('should return null for positions on same line but before start character', () => {
    const contentPos = mapDocumentToContentPosition({ line: 6, character: 10 }, sampleRXMLString);
    assert.equal(contentPos, null);
  });
});

// ---------------------------------------------------------------------------
// findRXMLStringAtPosition
// ---------------------------------------------------------------------------

describe('findRXMLStringAtPosition', () => {
  it('should find RXML string when position is inside', () => {
    const found = findRXMLStringAtPosition({ line: 7, character: 16 }, [sampleRXMLString]);
    assert.ok(found !== null, 'Expected to find RXML string');
    assert.equal(found!.confidence, 0.8);
  });

  it('should return null when position is outside all RXML strings', () => {
    const found = findRXMLStringAtPosition({ line: 10, character: 0 }, [sampleRXMLString]);
    assert.equal(found, null);
  });

  it('should handle boundary at start of string', () => {
    const found = findRXMLStringAtPosition({ line: 6, character: 15 }, [sampleRXMLString]);
    assert.ok(found !== null, 'Expected to find at start boundary');
  });

  it('should handle boundary at end of string', () => {
    const found = findRXMLStringAtPosition({ line: 8, character: 5 }, [sampleRXMLString]);
    assert.ok(found !== null, 'Expected to find at end boundary');
  });

  it('should check multiple RXML strings', () => {
    const second: RXMLStringLiteral = {
      content: '<emit source="sql">SELECT 1</emit>',
      range: { start: { line: 12, character: 10 }, end: { line: 12, character: 44 } },
      fullRange: { start: { line: 12, character: 7 }, end: { line: 12, character: 45 } },
      confidence: 0.9,
      markers: [],
    };

    const found = findRXMLStringAtPosition({ line: 12, character: 20 }, [sampleRXMLString, second]);
    assert.ok(found !== null);
    assert.equal(found!.confidence, 0.9);
  });
});

// ---------------------------------------------------------------------------
// mergeSymbolTrees
// ---------------------------------------------------------------------------

describe('mergeSymbolTrees', () => {
  const rxmlStrings: RXMLStringLiteral[] = [
    {
      content:
        "\n        <set variable='foo'>bar</set>\n        <emit source='sql'>SELECT 1</emit>\n    ",
      range: { start: { line: 6, character: 15 }, end: { line: 8, character: 5 } },
      fullRange: { start: { line: 6, character: 12 }, end: { line: 8, character: 6 } },
      confidence: 0.8,
      markers: [
        { type: 'tag', name: 'set', position: { line: 1, character: 9 } },
        { type: 'tag', name: 'emit', position: { line: 2, character: 9 } },
      ],
    },
  ];

  it('should preserve all Pike symbols in merged tree', () => {
    const merged = mergeSymbolTrees(pikeSymbols, rxmlStrings);
    const pikeNames = merged.filter(s => s.name !== 'RXML Template').map(s => s.name);
    assert.ok(pikeNames.includes('simpletag_foo'));
  });

  it('should add RXML Template container symbols for high-confidence strings', () => {
    const merged = mergeSymbolTrees(pikeSymbols, rxmlStrings);
    const rxmlContainer = merged.find(s => s.name === 'RXML Template');
    assert.ok(rxmlContainer, 'Expected RXML Template symbol');
    assert.equal(rxmlContainer!.detail, '2 RXML markers');
  });

  it('should nest RXML markers as children of RXML Template', () => {
    const merged = mergeSymbolTrees(pikeSymbols, rxmlStrings);
    const rxmlContainer = merged.find(s => s.name === 'RXML Template');
    const markerNames = rxmlContainer?.children?.map(c => c.name) || [];
    assert.ok(markerNames.includes('set'));
    assert.ok(markerNames.includes('emit'));
  });

  it('should filter out low-confidence strings (< 0.3)', () => {
    const lowConfidence: RXMLStringLiteral[] = [{ ...rxmlStrings[0], confidence: 0.2 }];
    const merged = mergeSymbolTrees(pikeSymbols, lowConfidence);
    const rxmlContainer = merged.find(s => s.name === 'RXML Template');
    assert.equal(rxmlContainer, undefined);
  });

  it('should return only Pike symbols when no RXML strings provided', () => {
    const merged = mergeSymbolTrees(pikeSymbols, []);
    assert.deepEqual(merged, pikeSymbols);
  });
});

// ---------------------------------------------------------------------------
// getRXMLTagCompletions / getRXMLAttributeCompletions
// ---------------------------------------------------------------------------

describe('getRXMLTagCompletions', () => {
  it('should return known RXML tag names', () => {
    const completions = getRXMLTagCompletions(sampleRXMLString, { line: 0, character: 0 });
    assert.ok(completions.includes('set'));
    assert.ok(completions.includes('emit'));
    assert.ok(completions.includes('if'));
    assert.ok(completions.includes('roxen'));
    assert.ok(completions.length > 10);
  });
});

describe('getRXMLAttributeCompletions', () => {
  it('should return known attributes for <set>', () => {
    const attrs = getRXMLAttributeCompletions('set');
    assert.ok(attrs.includes('variable'));
    assert.ok(attrs.includes('scope'));
  });

  it('should return known attributes for <emit>', () => {
    const attrs = getRXMLAttributeCompletions('emit');
    assert.ok(attrs.includes('source'));
    assert.ok(attrs.includes('query'));
  });

  it('should return empty array for unknown tags', () => {
    const attrs = getRXMLAttributeCompletions('unknown_tag');
    assert.equal(attrs.length, 0);
  });
});

// ---------------------------------------------------------------------------
// createPositionMapping
// ---------------------------------------------------------------------------

describe('createPositionMapping', () => {
  it('should derive mapping from RXML string range', () => {
    const mapping = createPositionMapping(sampleRXMLString);
    assert.equal(mapping.lineOffset, 6);
    assert.equal(mapping.characterOffset, 15);
    assert.deepEqual(mapping.documentRange, sampleRXMLString.range);
  });
});
