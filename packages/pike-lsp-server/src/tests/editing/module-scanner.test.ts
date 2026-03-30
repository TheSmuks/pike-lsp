/**
 * Module Scanner Tests - RXML Tag Detection
 *
 * Tests the module scanner that extracts RXML tag definitions
 * (simpletag_* and container_*) from Pike module source code.
 */

import { describe, it, expect } from 'bun:test';
import assert from 'node:assert/strict';
import { extractTagsFromPikeCode } from '../../features/rxml/module-scanner.js';
import type { RXMLTagCatalogEntry } from '../../features/rxml/types.js';

describe('Module Scanner', () => {
  describe('extractTagsFromPikeCode', () => {
    it('should detect simple tag functions', async () => {
      const pikeCode = `
void simpletag_my_tag(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('my_tag');
      expect(result[0].type).toBe('simple');
    });

    it('should detect container tag functions', async () => {
      const pikeCode = `
void container_my_container(mapping args, string content) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

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

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(3);
      expect(result.map(t => t.name)).toEqual(['tag_one', 'tag_two', 'container_one']);
    });

    it('should extract description from //! comments', async () => {
      const pikeCode = `//! This is a description for my tag
void simpletag_my_tag(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('This is a description for my tag');
    });

    it('should extract multi-line //! comments', async () => {
      const pikeCode = `//! First line
//! Second line
//! Third line
void simpletag_multi_line_tag(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('First line Second line Third line');
    });

    it('should handle tags without descriptions', async () => {
      const pikeCode = `
void simpletag_no_desc(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].description).toBeUndefined();
    });

    it('should handle tags with different return types', async () => {
      const pikeCode = `
void simpletag_void_tag(mapping args) { }
mapping simpletag_mapping_tag(mapping args) { }
string simpletag_string_tag(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(3);
    });

    it('should handle tags with various parameter names', async () => {
      const pikeCode = `
void simpletag_standard(mapping args) { }
void simpletag_underscores_and_numbers(mapping m, int x) { }
void container_custom_params(mapping params, string body) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

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

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(0);
    });

    it('should detect tags even in single-line comments', async () => {
      const pikeCode = `
// This is not a tag: void simpletag_fake(mapping args) { }
//! But this is: void simpletag_real(mapping args) { }
void simpletag_actual(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(3);
    });

    it('should handle tags at start of file', async () => {
      const pikeCode = `void simpletag_start_tag(mapping args) { }`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('start_tag');
    });

    it('should handle tags with different whitespace', async () => {
      const pikeCode = `
void   simpletag_spaces(mapping   args)   {   }
void\tsimpletag_tabs(mapping\targs)\t{\t}
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(2);
    });

    it('should handle complex Pike modules', async () => {
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
}
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('create_link');
      expect(result[0].description).toBe('Create a link tag @param args - mapping of attributes');
      expect(result[1].name).toBe('if');
      expect(result[1].description).toBe('Container for conditional display');
    });

    it('should not match partial tag names', async () => {
      const pikeCode = `
void simpletag_valid(mapping args) { }
int not_a_simpletag_function(mapping args) { }
void not_simpletag(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid');
    });

    it('should return catalog entries with required and optional attributes', async () => {
      const pikeCode = `
void simpletag_test(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].requiredAttributes).toEqual([]);
      expect(result[0].optionalAttributes).toEqual([]);
    });

    it('should handle empty string input', async () => {
      const result = await extractTagsFromPikeCode('');

      expect(result).toHaveLength(0);
    });

    it('should handle whitespace-only input', async () => {
      const result = await extractTagsFromPikeCode('   \n\n   ');

      expect(result).toHaveLength(0);
    });

    it('should handle tags with numbers in name', async () => {
      const pikeCode = `
void simpletag_tag_1(mapping args) { }
void simpletag_tag_2(mapping args) { }
void container_container_123(mapping args, string content) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('tag_1');
      expect(result[1].name).toBe('tag_2');
      expect(result[2].name).toBe('container_123');
    });

    it('should not detect tags with uppercase letters', async () => {
      const pikeCode = `
void simpletag_UPPERCASE(mapping args) { }
void simpletag_MixedCase(mapping args) { }
void simpletag_valid_tag(mapping args) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('valid_tag');
    });

    it('should handle container with string type return', async () => {
      const pikeCode = `
string container_html(mapping args, string content) { }
`;

      const result = await extractTagsFromPikeCode(pikeCode);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('html');
      expect(result[0].type).toBe('container');
    });
  });
});
