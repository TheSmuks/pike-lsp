/**
 * Module Scanner Tests - RXML Tag Detection
 *
 * Tests the module scanner that extracts RXML tag definitions
 * (simpletag_* and container_*) from Pike module source code
 * using PikeSymbol[] from bridge.parse().
 */

import { describe, it, expect } from 'bun:test';
import assert from 'node:assert/strict';
import {
  extractTagsFromPikeCode,
  detectTagFunctions,
  findTagFunctionsInCode,
  buildTagPattern,
  SIMPLETAG_PATTERN,
  CONTAINER_PATTERN,
} from '../../features/rxml/module-scanner.js';
import type { RXMLTagCatalogEntry } from '../../features/rxml/types.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

/** Helper to create a mock PikeSymbol for a method */
function methodSymbol(name: string, line?: number): PikeSymbol {
  return {
    name,
    kind: 'method',
    ...(line != null && { position: { line, column: 1 } }),
  };
}

describe('Module Scanner', () => {
  describe('extractTagsFromPikeCode', () => {
    it('should detect simple tag functions', async () => {
      const pikeCode = `
void simpletag_my_tag(mapping args) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_my_tag', 2)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my_tag');
      expect(result[0].type).toBe('simple');
    });

    it('should detect container tag functions', async () => {
      const pikeCode = `
void container_my_container(mapping args, string content) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('container_my_container', 2)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my_container');
      expect(result[0].type).toBe('container');
    });

    it('should detect multiple tags', async () => {
      const pikeCode = `
void simpletag_tag_one(mapping args) { }
void simpletag_tag_two(mapping args) { }
void container_container_one(mapping args, string content) { }
`;
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_tag_one', 2),
        methodSymbol('simpletag_tag_two', 3),
        methodSymbol('container_container_one', 4),
      ];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(3);
      expect(result.map(t => t.name)).toEqual(['tag_one', 'tag_two', 'container_one']);
    });

    it('should extract description from //! comments', async () => {
      const pikeCode = `//! This is a description for my tag
void simpletag_my_tag(mapping args) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_my_tag', 2)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('This is a description for my tag');
    });

    it('should extract multi-line //! comments', async () => {
      const pikeCode = `//! First line
//! Second line
//! Third line
void simpletag_multi_line_tag(mapping args) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_multi_line_tag', 4)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('First line Second line Third line');
    });

    it('should handle tags without descriptions', async () => {
      const pikeCode = `
void simpletag_no_desc(mapping args) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_no_desc', 2)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBeUndefined();
    });

    it('should handle tags with different return types', async () => {
      const pikeCode = `
void simpletag_void_tag(mapping args) { }
mapping simpletag_mapping_tag(mapping args) { }
string simpletag_string_tag(mapping args) { }
`;
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_void_tag', 2),
        methodSymbol('simpletag_mapping_tag', 3),
        methodSymbol('simpletag_string_tag', 4),
      ];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(3);
    });

    it('should handle tags with various parameter names', async () => {
      const pikeCode = `
void simpletag_standard(mapping args) { }
void simpletag_underscores_and_numbers(mapping m, int x) { }
void container_custom_params(mapping params, string body) { }
`;
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_standard', 2),
        methodSymbol('simpletag_underscores_and_numbers', 3),
        methodSymbol('container_custom_params', 4),
      ];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('standard');
      expect(result[1].name).toBe('underscores_and_numbers');
      expect(result[2].name).toBe('custom_params');
    });

    it('should return empty array for code with no tags', async () => {
      const pikeCode = `
int some_function() { return 1; }

class MyClass {
  void method() { }
}
`;
      // No tag symbols — only regular methods
      const symbols: PikeSymbol[] = [
        { name: 'some_function', kind: 'method', position: { line: 2, column: 1 } },
        { name: 'method', kind: 'method', position: { line: 5, column: 3 } },
      ];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(0);
    });

    it('should only detect methods from symbols, not from comments', async () => {
      const pikeCode = `
// This is not a tag: void simpletag_fake(mapping args) { }
//! But this is: void simpletag_real(mapping args) { }
void simpletag_actual(mapping args) { }
`;
      // Only actual method symbols are provided — no false positives from comments
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_actual', 4)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('actual');
    });

    it('should handle tags at start of file', async () => {
      const pikeCode = `void simpletag_start_tag(mapping args) { }`;
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_start_tag', 1)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('start_tag');
    });

    it('should handle empty string input', async () => {
      const result = await extractTagsFromPikeCode('', []);

      expect(result).toHaveLength(0);
    });

    it('should handle whitespace-only input', async () => {
      const result = await extractTagsFromPikeCode('   \n\n   ', []);

      expect(result).toHaveLength(0);
    });

    it('should handle tags with numbers in name', async () => {
      const pikeCode = `
void simpletag_tag_1(mapping args) { }
void simpletag_tag_2(mapping args) { }
void container_container_123(mapping args, string content) { }
`;
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_tag_1', 2),
        methodSymbol('simpletag_tag_2', 3),
        methodSymbol('container_container_123', 4),
      ];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('tag_1');
      expect(result[1].name).toBe('tag_2');
      expect(result[2].name).toBe('container_123');
    });

    it('should detect tags with uppercase and mixed-case names', async () => {
      const pikeCode = `
void simpletag_UPPERCASE(mapping args) { }
void simpletag_MixedCase(mapping args) { }
void simpletag_valid_tag(mapping args) { }
`;
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_UPPERCASE', 2),
        methodSymbol('simpletag_MixedCase', 3),
        methodSymbol('simpletag_valid_tag', 4),
      ];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(3);
      expect(result.map(t => t.name)).toEqual(['UPPERCASE', 'MixedCase', 'valid_tag']);
    });

    it('should handle container with string type return', async () => {
      const pikeCode = `
string container_html(mapping args, string content) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('container_html', 2)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('html');
      expect(result[0].type).toBe('container');
    });

    it('should return catalog entries with required and optional attributes', async () => {
      const pikeCode = `
void simpletag_test(mapping args) { }
`;
      const symbols: PikeSymbol[] = [methodSymbol('simpletag_test', 2)];

      const result = await extractTagsFromPikeCode(pikeCode, symbols);

      expect(result).toHaveLength(1);
      expect(result[0].requiredAttributes).toEqual([]);
      expect(result[0].optionalAttributes).toEqual([]);
    });
  });

  describe('detectTagFunctions', () => {
    it('should filter symbols by kind=method with tag prefixes', () => {
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_valid', 1),
        { name: 'not_simpletag_function', kind: 'method' },
        { name: 'not_simpletag', kind: 'method' },
      ];

      const tags = detectTagFunctions(symbols, 'void simpletag_valid(mapping args) { }');

      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('valid');
    });

    it('should handle complex Pike modules with descriptions', () => {
      const pikeCode = `//! RXML module for user content
//! Handles user-submitted HTML safely

//! Create a link tag
//! @param args - mapping of attributes
void simpletag_create_link(mapping args) { }

//! Container for conditional display
void container_if(mapping args, string content) { }

constant VERSION = "1.0";

class Helper {
  void helper_method() { }
}`;
      const symbols: PikeSymbol[] = [
        methodSymbol('simpletag_create_link', 6),
        methodSymbol('container_if', 9),
        { name: 'VERSION', kind: 'constant', position: { line: 11, column: 1 } },
        { name: 'helper_method', kind: 'method', position: { line: 14, column: 3 } },
      ];

      const tags = detectTagFunctions(symbols, pikeCode);

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('create_link');
      expect(tags[0].description).toBe('Create a link tag @param args - mapping of attributes');
      expect(tags[1].name).toBe('if');
      expect(tags[1].description).toBe('Container for conditional display');
    });

    it('should fall back to line search when symbol has no position', () => {
      const pikeCode = `//! A tag
void simpletag_fallback(mapping args) { }`;

      const symbols: PikeSymbol[] = [methodSymbol('simpletag_fallback')];

      const tags = detectTagFunctions(symbols, pikeCode);

      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('fallback');
      expect(tags[0].description).toBe('A tag');
    });
  });

  describe('findTagFunctionsInCode', () => {
    it('should find both space and underscore forms', () => {
      const code = [
        'void simpletag my_tag(mapping args) { }',
        'void simpletag_other(mapping args) { }',
        'void container my_cont(mapping args, string c) { }',
        'void container_another(mapping args, string c) { }',
      ].join('\n');

      const matches = findTagFunctionsInCode(code);

      expect(matches).toHaveLength(4);
      expect(matches[0]).toEqual({ name: 'my_tag', type: 'simple', index: code.indexOf('my_tag') });
      expect(matches[1]).toEqual({
        name: 'other',
        type: 'simple',
        index: code.indexOf('other'),
      });
      expect(matches[2]).toEqual({
        name: 'my_cont',
        type: 'container',
        index: code.indexOf('my_cont'),
      });
      expect(matches[3]).toEqual({
        name: 'another',
        type: 'container',
        index: code.indexOf('another'),
      });
    });

    it('should return correct byte offsets for tag names', () => {
      const code = 'void simpletag hello(mapping args) { }';
      const matches = findTagFunctionsInCode(code);

      expect(matches).toHaveLength(1);
      // Name offset should point to 'hello' in the source
      expect(code.substring(matches[0].index, matches[0].index + 5)).toBe('hello');
    });

    it('should return empty array for code with no tags', () => {
      const matches = findTagFunctionsInCode('int main() { return 0; }');
      expect(matches).toHaveLength(0);
    });
  });

  describe('buildTagPattern', () => {
    it('should match space-separated simpletag', () => {
      const pattern = buildTagPattern('simple', 'my_tag');
      const code = 'void simpletag my_tag(mapping args) { }';
      expect(pattern.test(code)).toBe(true);
    });

    it('should match underscore-separated simpletag', () => {
      const pattern = buildTagPattern('simple', 'my_tag');
      const code = 'void simpletag_my_tag(mapping args) { }';
      expect(pattern.test(code)).toBe(true);
    });

    it('should match space-separated container', () => {
      const pattern = buildTagPattern('container', 'my_cont');
      const code = 'void container my_cont(mapping args, string c) { }';
      expect(pattern.test(code)).toBe(true);
    });

    it('should match underscore-separated container', () => {
      const pattern = buildTagPattern('container', 'my_cont');
      const code = 'void container_my_cont(mapping args, string c) { }';
      expect(pattern.test(code)).toBe(true);
    });

    it('should not match different tag names', () => {
      const pattern = buildTagPattern('simple', 'my_tag');
      const code = 'void simpletag other_tag(mapping args) { }';
      expect(pattern.test(code)).toBe(false);
    });
  });
});

describe('canonical pattern consistency', () => {
  it('SIMPLETAG_PATTERN matches both space and underscore forms', () => {
    const spaceForm = 'void simpletag my_tag(mapping args) { }';
    const underscoreForm = 'void simpletag_my_tag(mapping args) { }';

    // Reset global regex state before each test
    SIMPLETAG_PATTERN.lastIndex = 0;
    expect(SIMPLETAG_PATTERN.test(spaceForm)).toBe(true);
    SIMPLETAG_PATTERN.lastIndex = 0;
    expect(SIMPLETAG_PATTERN.test(underscoreForm)).toBe(true);
  });

  it('CONTAINER_PATTERN matches both space and underscore forms', () => {
    const spaceForm = 'void container my_cont(mapping args, string c) { }';
    const underscoreForm = 'void container_my_cont(mapping args, string c) { }';

    CONTAINER_PATTERN.lastIndex = 0;
    expect(CONTAINER_PATTERN.test(spaceForm)).toBe(true);
    CONTAINER_PATTERN.lastIndex = 0;
    expect(CONTAINER_PATTERN.test(underscoreForm)).toBe(true);
  });

  it('extractTagsFromPikeCode and findTagFunctionsInCode agree on underscore forms', async () => {
    const code = [
      'void simpletag_underscore_tag(mapping args) { }',
      'void container_underscore_cont(mapping args, string c) { }',
    ].join('\n');

    const symbols: PikeSymbol[] = [
      methodSymbol('simpletag_underscore_tag', 1),
      methodSymbol('container_underscore_cont', 2),
    ];

    const catalogEntries = await extractTagsFromPikeCode(code, symbols);
    const matches = findTagFunctionsInCode(code);

    // Both must find the same 2 tags with same names and types
    expect(catalogEntries).toHaveLength(2);
    expect(matches).toHaveLength(2);

    const catalogNames = catalogEntries.map(e => `${e.type}:${e.name}`).sort();
    const matchNames = matches.map(m => `${m.type}:${m.name}`).sort();
    expect(catalogNames).toEqual(matchNames);
  });
});
