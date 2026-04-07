/**
 * Bridge tests for roxenExtractRXMLStrings (Roadmap Task 16)
 *
 * Comprehensive tests covering:
 * - Normal extraction of RXML strings from various templates
 * - Edge cases: empty input, malformed RXML, nested tags, special characters, Unicode
 * - Boundary conditions: very large inputs, deeply nested structures
 * - Confidence scoring and marker detection
 *
 * References: GitHub Issue #1226
 */

// @ts-ignore - Bun test types
import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

/**
 * Helper to build a valid Pike multiline string literal with RXML content.
 * Uses single quotes for RXML attributes to avoid escaping issues with #"..." syntax.
 */
function rxmlLiteral(rxml: string): string {
  return `string tmpl = #"${rxml}";`;
}

describe('roxenExtractRXMLStrings', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Tests require Pike to be installed.');
    }
    await bridge.start();
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  // =========================================================================
  // Normal extraction
  // =========================================================================

  it('should extract a simple RXML string from #" multiline literal', async () => {
    const code = rxmlLiteral('<set>bar</set>');
    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');

    assert.ok(result, 'Should return a result');
    assert.ok(Array.isArray(result.strings), 'strings should be an array');
    assert.ok(result.strings.length > 0, 'Should find at least one RXML string');

    const s = result.strings[0]!;
    assert.ok(s.content, 'String should have content');
    assert.ok(s.content.includes('<set>'), 'Content should include <set> tag');
    assert.equal(typeof s.confidence, 'number', 'Confidence should be a number');
    assert.ok(s.confidence >= 0, 'Confidence should be >= 0');
    assert.ok(s.confidence <= 1, 'Confidence should be <= 1');
  });

  it('should extract RXML with emit tag and confidence boost', async () => {
    const code = rxmlLiteral(
      "<emit source='sql' query='SELECT 1'>\n  <row><column name='id'/></row>\n</emit>"
    );

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should detect emit template');

    const s = result.strings[0]!;
    assert.ok(s.content.includes('emit'), 'Content should contain emit');
    assert.ok(s.confidence >= 0.2, 'Emit tag should boost confidence');
  });

  it('should extract RXML with if/elseif/else conditionals', async () => {
    const code = rxmlLiteral(
      "<if variable='var.x'>\n  X is set\n</if>\n<elseif variable='var.y'>\n  Y is set\n</elseif>\n<else>\n  Nothing set\n</else>"
    );

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should detect conditional template');

    const s = result.strings[0]!;
    assert.ok(
      s.content.includes('if') || s.content.includes('else'),
      'Should have conditional tags'
    );
  });

  it('should extract RXML with entities like &form. and &page.', async () => {
    const code = rxmlLiteral('<p>Hello &form.name;</p><p>URL: &page.url;</p>');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should detect template with entities');

    const s = result.strings[0]!;
    assert.ok(s.content.includes('&form.'), 'Content should contain &form. entity');
    assert.ok(s.content.includes('&page.'), 'Content should contain &page. entity');
  });

  it('should extract RXML with roxen core tag', async () => {
    const code = rxmlLiteral("<roxen><set variable='var.x' value='42'/></roxen>");

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should detect roxen tag');

    const s = result.strings[0]!;
    assert.ok(s.confidence >= 0.3, 'Roxen tag should give high confidence');
  });

  it('should extract multiple RXML strings from different assignments', async () => {
    const code = [
      rxmlLiteral('<h1>&page.title;</h1>'),
      rxmlLiteral("<set variable='var.done' value='1'/>Done"),
    ].join('\n');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(
      result.strings.length >= 2,
      `Should find at least two RXML strings, got ${result.strings.length}`
    );
  });

  // =========================================================================
  // Position tracking
  // =========================================================================

  it('should return valid start and end positions for extracted strings', async () => {
    const code = rxmlLiteral('<set>hello</set>');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should find RXML string');

    const s = result.strings[0]!;
    assert.ok(s.start, 'Should have start position');
    assert.ok(s.end, 'Should have end position');
    assert.ok(s.quote_start, 'Should have quote_start position');
    assert.ok(s.quote_end, 'Should have quote_end position');

    assert.equal(typeof s.start.line, 'number', 'start.line should be a number');
    assert.equal(typeof s.start.column, 'number', 'start.column should be a number');
    assert.ok(s.start.line >= 1, 'start.line should be 1-indexed');
    assert.ok(s.start.column >= 1, 'start.column should be 1-indexed');
  });

  // =========================================================================
  // Marker detection
  // =========================================================================

  it('should detect RXML tag markers', async () => {
    const code = rxmlLiteral("<set variable='var.x' value='1'/><emit source='test'/>");

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should find RXML string');

    const s = result.strings[0]!;
    assert.ok(Array.isArray(s.markers), 'markers should be an array');

    const tagMarkers = s.markers.filter(m => m.type === 'tag');
    assert.ok(tagMarkers.length > 0, 'Should detect tag markers');

    const tagNames = tagMarkers.map(m => m.name);
    assert.ok(
      tagNames.includes('set') || tagNames.includes('emit'),
      'Should detect known RXML tags, got: ' + tagNames.join(', ')
    );
  });

  it('should detect RXML entity markers', async () => {
    const code = rxmlLiteral('<p>&form.name; is &page.url;</p>');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should find RXML string');

    const s = result.strings[0]!;
    const entityMarkers = s.markers.filter(m => m.type === 'entity');
    assert.ok(entityMarkers.length > 0, 'Should detect entity markers');

    const entityNames = entityMarkers.map(m => m.name);
    assert.ok(
      entityNames.includes('form') || entityNames.includes('page'),
      'Should detect known entity prefixes, got: ' + entityNames.join(', ')
    );
  });

  it('should have valid marker positions (1-indexed)', async () => {
    const code = rxmlLiteral('<set>value</set>');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    if (result.strings.length > 0 && result.strings[0]!.markers.length > 0) {
      const marker = result.strings[0]!.markers[0]!;
      assert.equal(typeof marker.line, 'number', 'marker line should be number');
      assert.equal(typeof marker.column, 'number', 'marker column should be number');
      assert.ok(marker.line >= 1, 'marker line should be 1-indexed');
      assert.ok(marker.column >= 1, 'marker column should be 1-indexed');
    }
  });

  // =========================================================================
  // Edge cases
  // =========================================================================

  it('should handle empty input gracefully', async () => {
    const result = await bridge.roxenExtractRXMLStrings('', 'test.pike');
    assert.ok(result, 'Should return a result');
    assert.ok(Array.isArray(result.strings), 'strings should be an array');
    assert.equal(result.strings.length, 0, 'Empty input should yield no strings');
  });

  it('should handle code with no multiline strings', async () => {
    const code = 'int x = 42;\nstring s = "hello";\nwrite(s);\n';

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(Array.isArray(result.strings), 'strings should be an array');
    assert.equal(result.strings.length, 0, 'No multiline strings should yield no results');
  });

  it('should handle code with only regular strings (not multiline)', async () => {
    const code =
      'string a = "hello world";\nstring b = "foo bar baz";\nstring c = "<set>not multiline</set>";\n';

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    // Regular strings should not be detected as multiline RXML
    assert.ok(Array.isArray(result.strings), 'Should return array');
    assert.equal(result.strings.length, 0, 'Regular strings should not be detected');
  });

  it('should handle multiline string without RXML content', async () => {
    const code = rxmlLiteral(
      'This is just plain text\nwith multiple lines\nbut no RXML tags at all.'
    );

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(Array.isArray(result.strings), 'Should return array');
    // Plain text with no RXML markers should have low confidence and be excluded
    if (result.strings.length > 0) {
      const s = result.strings[0]!;
      assert.ok(s.confidence < 0.3, 'Plain text should have low confidence');
    }
  });

  it('should handle malformed RXML gracefully', async () => {
    const code = rxmlLiteral('<set><unclosed></set>');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result, 'Should not crash on malformed RXML');
    assert.ok(Array.isArray(result.strings), 'Should return array');
    // Should still extract the string even if RXML is malformed
  });

  it('should handle special characters in RXML content', async () => {
    const code = rxmlLiteral("<set variable='var.x' value='a &amp; b'/>");

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result, 'Should handle special chars');
    assert.ok(result.strings.length > 0, 'Should find RXML string');
  });

  it('should handle Unicode content in RXML', async () => {
    const code = rxmlLiteral("<set variable='var.msg' value='Héllo wörld — 日本語テスト'/>");

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result, 'Should handle Unicode');
    assert.ok(result.strings.length > 0, 'Should find RXML string with Unicode');
    assert.ok(result.strings[0]!.content.includes('Héllo'), 'Should preserve Unicode');
  });

  it('should handle RXML with mixed entities and tags', async () => {
    const code = rxmlLiteral(
      "<if variable='var.show'>\n  &form.name; says: <set variable='var.greeting' value='hello'/>\n</if>"
    );

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should find mixed-content RXML');

    const s = result.strings[0]!;
    assert.ok(s.confidence >= 0.3, 'Mixed entities and tags should boost confidence');
  });

  // =========================================================================
  // Boundary conditions
  // =========================================================================

  it('should handle deeply nested RXML tags', async () => {
    const code = rxmlLiteral(
      "<if>\n  <then>\n    <emit>\n      <foreach>\n        <set variable='var.x' value='1'/>\n      </foreach>\n    </emit>\n  </then>\n</if>"
    );

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result, 'Should not crash on nested tags');
    assert.ok(result.strings.length > 0, 'Should find nested RXML');

    const s = result.strings[0]!;
    assert.ok(s.content.includes('if'), 'Should contain outer tag');
    assert.ok(s.content.includes('set'), 'Should contain inner tag');
  });

  it('should handle large RXML templates', async () => {
    // Generate a large template with 100 RXML tags
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`<set variable='var.item${i}' value='${i}'/>`);
    }
    const code = rxmlLiteral(lines.join('\n'));

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result, 'Should handle large templates');
    assert.ok(result.strings.length > 0, 'Should find RXML in large template');

    const s = result.strings[0]!;
    assert.ok(s.content.length > 1000, 'Content should be large');
  });

  it('should handle code with multiple multiline string types', async () => {
    const code = [
      rxmlLiteral('<set>first</set>'),
      rxmlLiteral("<emit source='test'>second</emit>"),
      rxmlLiteral('<roxen>third</roxen>'),
    ].join('\n');

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(
      result.strings.length >= 2,
      `Should find multiple multiline RXML strings, got ${result.strings.length}`
    );
  });

  // =========================================================================
  // Filename handling
  // =========================================================================

  it('should work without filename parameter', async () => {
    const code = rxmlLiteral('<set>test</set>');

    const result = await bridge.roxenExtractRXMLStrings(code);
    assert.ok(result, 'Should work without filename');
    assert.ok(result.strings.length > 0, 'Should find RXML string');
  });

  it('should work with various filename formats', async () => {
    const code = rxmlLiteral('<set>test</set>');

    const filenames = ['test.pike', '/absolute/path/test.pike', 'module/module.pike'];
    for (const filename of filenames) {
      const result = await bridge.roxenExtractRXMLStrings(code, filename);
      assert.ok(result, `Should work with filename: ${filename}`);
      assert.ok(result.strings.length > 0, `Should find string with filename: ${filename}`);
    }
  });

  // =========================================================================
  // Confidence scoring
  // =========================================================================

  it('should assign higher confidence to content with more RXML indicators', async () => {
    const weakCode = rxmlLiteral('<p>just some xml</p>');
    const strongCode = rxmlLiteral(
      "<roxen><set variable='var.x' value='1'/><emit source='sql'/>&form.name;</roxen>"
    );

    const weakResult = await bridge.roxenExtractRXMLStrings(weakCode, 'test.pike');
    const strongResult = await bridge.roxenExtractRXMLStrings(strongCode, 'test.pike');

    // Strong should have higher confidence if both are found
    if (weakResult.strings.length > 0 && strongResult.strings.length > 0) {
      assert.ok(
        strongResult.strings[0]!.confidence >= weakResult.strings[0]!.confidence,
        'Strong RXML content should have >= confidence compared to weak'
      );
    }
  });

  // =========================================================================
  // Full template scenarios
  // =========================================================================

  it('should extract from a realistic Roxen page template', async () => {
    // Using single quotes for attributes to avoid quote-escaping issues in #"..."
    const templateContent = [
      '<html>',
      '<head><title>&page.title;</title></head>',
      '<body>',
      "  <if variable='form.action'>",
      "    <emit source='sql' query='SELECT * FROM items'>",
      '      <row>',
      "        <h2><column name='title'/></h2>",
      "        <p><column name='body'/></p>",
      '      </row>',
      '    </emit>',
      '  </if>',
      '  <else>',
      '    <p>No items found.</p>',
      '  </else>',
      '</body>',
      '</html>',
    ].join('\n');

    const code = [
      'inherit "module";',
      'constant module_type = MODULE_TAG;',
      '',
      'string simpletag_page(mapping args, string contents) {',
      `    string tmpl = #"${templateContent}";`,
      '    return tmpl;',
      '}',
    ].join('\n');

    const result = await bridge.roxenExtractRXMLStrings(code, 'template.pike');
    assert.ok(result.strings.length > 0, 'Should find template in realistic Roxen module');

    const s = result.strings[0]!;
    assert.ok(s.confidence >= 0.3, 'Realistic template should have reasonable confidence');
    assert.ok(s.markers.length > 0, 'Should detect markers in realistic template');
  });

  it('should handle SQL-like content in RXML emit tags', async () => {
    const code = rxmlLiteral(
      "<emit source='sql' query='SELECT id, name FROM users WHERE active = 1'>\n  <row><column name='name'/></row>\n</emit>"
    );

    const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
    assert.ok(result.strings.length > 0, 'Should handle SQL in emit');
  });
});
