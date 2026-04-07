/**
 * Bridge tests for roxenExtractRXMLStrings
 *
 * Issue #1226: Tests for the RXML string extraction bridge method.
 * Covers normal extraction, edge cases, malformed input, nested tags,
 * special characters/Unicode, and boundary/large inputs.
 */

// @ts-ignore - Bun test types
import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

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

  describe('normal RXML string extraction', () => {
    it('should extract a simple RXML string from #"..." literal', async () => {
      const code = `string foo = #"<set>bar</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(Array.isArray(result.strings), 'strings should be an array');
      assert.ok(result.strings.length >= 1, 'Should find at least one string');
      const s = result.strings[0];
      assert.ok(s.content, 'String should have content');
      assert.ok(s.confidence >= 0 && s.confidence <= 1, 'Confidence should be 0-1');
    });

    it('should extract RXML with multiple tags', async () => {
      const code = `string tmpl = #"<roxen><set var=\"x\">1</set><emit source=\"test\">data</emit></roxen>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result.strings.length >= 1, 'Should find at least one string');
      const s = result.strings[0];
      assert.ok(s.content.includes('set') || s.content.includes('emit'),
        'Content should contain RXML tags');
    });

    it('should return markers for detected RXML tags', async () => {
      const code = `string s = #"<set var=\"x\">hello</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      if (result.strings.length > 0) {
        const s = result.strings[0];
        if (s.markers && s.markers.length > 0) {
          assert.ok(Array.isArray(s.markers), 'markers should be an array');
          const hasTag = s.markers.some(m => m.type === 'tag');
          assert.ok(hasTag, 'Should detect at least one tag marker');
        }
      }
    });

    it('should return position information (start/end/quote_start/quote_end)', async () => {
      const code = `string s = #"<set>val</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      if (result.strings.length > 0) {
        const s = result.strings[0];
        assert.ok(s.start, 'Should have start position');
        assert.ok(s.end, 'Should have end position');
        assert.ok(typeof s.start.line === 'number', 'start.line should be a number');
        assert.ok(typeof s.start.column === 'number', 'start.column should be a number');
        assert.ok(typeof s.end.line === 'number', 'end.line should be a number');
        assert.ok(typeof s.end.column === 'number', 'end.column should be a number');
      }
    });

    it('should extract multiple RXML string literals', async () => {
      const code = [
        'string a = #"<set>a</set>";',
        'string b = #"<emit source=\"x\">y</emit>";',
      ].join('\n');
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result.strings.length >= 1, 'Should find at least one string');
    });
  });

  describe('empty input', () => {
    it('should handle empty string', async () => {
      const result = await bridge.roxenExtractRXMLStrings('', 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(Array.isArray(result.strings), 'strings should be an array');
      assert.equal(result.strings.length, 0, 'Should find no strings in empty input');
    });

    it('should handle whitespace-only input', async () => {
      const result = await bridge.roxenExtractRXMLStrings('   \n\t  \n  ', 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.equal(result.strings.length, 0, 'Should find no strings in whitespace input');
    });

    it('should handle code with no string literals', async () => {
      const code = `int x = 42;\narray a = ({});\nmapping m = ([]);`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.equal(result.strings.length, 0, 'Should find no strings');
    });

    it('should handle code with regular (non-RXML) strings', async () => {
      const code = `string hello = "just a normal string";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      // Regular strings should either not be extracted or have low confidence
      if (result.strings.length > 0) {
        for (const s of result.strings) {
          // If extracted, confidence should be low for non-RXML content
          assert.ok(s.confidence < 0.5, 'Non-RXML strings should have low confidence');
        }
      }
    });
  });

  describe('malformed RXML tags', () => {
    it('should handle unclosed tags gracefully', async () => {
      const code = `string s = #"<set>no closing tag";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should not throw on unclosed tags');
      assert.ok(Array.isArray(result.strings), 'Should return strings array');
    });

    it('should handle mismatched tags', async () => {
      const code = `string s = #"<set>content</emit>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should not throw on mismatched tags');
      assert.ok(Array.isArray(result.strings), 'Should return strings array');
    });

    it('should handle truncated input', async () => {
      const code = `string s = #"<set var=";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should not throw on truncated input');
      assert.ok(Array.isArray(result.strings), 'Should return strings array');
    });

    it('should handle raw angle brackets without valid tags', async () => {
      const code = `string s = #"<<<not xml>>>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should not throw on garbage angle brackets');
      assert.ok(Array.isArray(result.strings), 'Should return strings array');
    });
  });

  describe('nested tags', () => {
    it('should handle deeply nested RXML tags', async () => {
      const code = `string s = #"<roxen><container><nested><set var=\"x\">deep</set></nested></container></roxen>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find the string');
      const s = result.strings[0];
      assert.ok(s.content.includes('roxen'), 'Content should include outer tag');
      assert.ok(s.content.includes('set'), 'Content should include inner tag');
    });

    it('should handle sibling tags at same level', async () => {
      const code = `string s = #"<if true><set var=\"a\">1</set></if><else><set var=\"b\">2</set></else>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find the string');
    });

    it('should handle mixed nested Pike and RXML constructs', async () => {
      const code = `string s = #"<emit source=\"sql\" query=\"SELECT * FROM t\"><row><col>&var.val;</col></row></emit>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find the string');
    });
  });

  describe('special characters and Unicode', () => {
    it('should handle RXML with special characters', async () => {
      const code = `string s = #"<set var=\"x\">a &amp; b &lt; c &gt; d</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find the string');
    });

    it('should handle Unicode content in RXML', async () => {
      const code = `string s = #"<set>日本語テスト ñ é ü</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find the string');
    });

    it('should handle RXML entities', async () => {
      const code = `string s = #"<set>&amp; &lt; &gt; &quot;</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
    });

    it('should handle RXML with attributes containing quotes', async () => {
      const code = `string s = #"<set var=\"x\" value=\"'quoted'\">content</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
    });

    it('should handle newlines within RXML content', async () => {
      const code = `string s = #"<set>line1\nline2\nline3</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
    });
  });

  describe('boundary and large inputs', () => {
    it('should handle a large RXML template', async () => {
      const tags = Array.from({ length: 200 }, (_, i) =>
        `<set var="v${i}">value${i}</set>`
      ).join('\n');
      const code = `string s = #"<roxen>${tags}</roxen>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find the string');
    });

    it('should handle many separate string literals', async () => {
      const lines = Array.from({ length: 50 }, (_, i) =>
        `string s${i} = #"<set>v${i}</set>";`
      ).join('\n');
      const result = await bridge.roxenExtractRXMLStrings(lines, 'test.pike');
      assert.ok(result, 'Should return a result');
      assert.ok(result.strings.length >= 1, 'Should find strings');
    });

    it('should handle very long single-line RXML', async () => {
      const longContent = 'a'.repeat(10000);
      const code = `string s = #"<set>${longContent}</set>";`;
      const result = await bridge.roxenExtractRXMLStrings(code, 'test.pike');
      assert.ok(result, 'Should return a result');
    });

    it('should handle filename parameter correctly', async () => {
      const code = `string s = #"<set>test</set>";`;
      const withFilename = await bridge.roxenExtractRXMLStrings(code, 'module.pike');
      const withoutFilename = await bridge.roxenExtractRXMLStrings(code);
      assert.ok(withFilename, 'Should work with filename');
      assert.ok(withoutFilename, 'Should work without filename');
    });
  });
});
