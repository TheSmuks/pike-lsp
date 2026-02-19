/**
 * Tests for RXML tag catalog
 */

import { describe, it, expect } from 'vitest';
import {
  RXML_TAG_CATALOG,
  getTagInfo,
  getAllTagNames,
  getTagsByType,
  searchTags,
  getDeprecatedTags,
  hasTag,
} from '../../../features/rxml/tag-catalog';

describe('RXML Tag Catalog', () => {
  describe('catalog structure', () => {
    it('should be a non-empty array', () => {
      expect(RXML_TAG_CATALOG).toBeDefined();
      expect(Array.isArray(RXML_TAG_CATALOG)).toBe(true);
      expect(RXML_TAG_CATALOG.length).toBeGreaterThan(0);
    });

    it('should have entries with required fields', () => {
      RXML_TAG_CATALOG.forEach(tag => {
        expect(tag).toHaveProperty('name');
        expect(tag).toHaveProperty('type');
        expect(tag).toHaveProperty('description');
        expect(tag).toHaveProperty('attributes');
        expect(['simple', 'container']).toContain(tag.type);
        expect(Array.isArray(tag.attributes)).toBe(true);
      });
    });

    it('should include core RXML tags', () => {
      const tagNames = new Set(RXML_TAG_CATALOG.map(t => t.name));

      // Container tags
      expect(tagNames.has('roxen')).toBe(true);
      expect(tagNames.has('emit')).toBe(true);
      expect(tagNames.has('if')).toBe(true);
      expect(tagNames.has('case')).toBe(true);
      expect(tagNames.has('for')).toBe(true);
      expect(tagNames.has('foreach')).toBe(true);
      expect(tagNames.has('apre')).toBe(true);

      // Simple tags
      expect(tagNames.has('set')).toBe(true);
      expect(tagNames.has('elseif')).toBe(true);
      expect(tagNames.has('else')).toBe(true);
      expect(tagNames.has('then')).toBe(true);
      expect(tagNames.has('aimg')).toBe(true);
    });
  });

  describe('tag metadata', () => {
    it('should have valid attribute definitions', () => {
      RXML_TAG_CATALOG.forEach(tag => {
        tag.attributes.forEach(attr => {
          expect(attr).toHaveProperty('name');
          expect(attr).toHaveProperty('type');
          expect(attr).toHaveProperty('description');
          expect(typeof attr.name).toBe('string');
          expect(typeof attr.description).toBe('string');
          expect(typeof attr.required).toBe('boolean');
        });
      });
    });

    it('should mark tags with deprecated flag when applicable', () => {
      RXML_TAG_CATALOG.forEach(tag => {
        if (tag.deprecated) {
          expect(typeof tag.deprecated).toBe('boolean');
          expect(tag.deprecated).toBe(true);
        }
      });
    });

    it('should include enum values for attributes with fixed choices', () => {
      const setTag = getTagInfo('set');
      expect(setTag).toBeDefined();

      const typeAttr = setTag!.attributes.find(a => a.name === 'type');
      if (typeAttr && 'values' in typeAttr) {
        expect(Array.isArray(typeAttr.values)).toBe(true);
      }
    });
  });

  describe('getTagInfo()', () => {
    it('should return tag info for valid tag names', () => {
      const roxen = getTagInfo('roxen');
      expect(roxen).toBeDefined();
      expect(roxen?.name).toBe('roxen');
      expect(roxen?.type).toBe('container');
    });

    it('should be case-insensitive for tag names', () => {
      const upper = getTagInfo('ROXEN');
      const lower = getTagInfo('roxen');
      const mixed = getTagInfo('Roxen');

      expect(upper).toEqual(lower);
      expect(lower).toEqual(mixed);
    });

    it('should handle mixed-case variations consistently', () => {
      // Test all possible case variations
      expect(getTagInfo('IF')?.name).toBe('if');
      expect(getTagInfo('If')?.name).toBe('if');
      expect(getTagInfo('iF')?.name).toBe('if');
      expect(getTagInfo('FOR')?.name).toBe('for');
      expect(getTagInfo('FoR')?.name).toBe('for');
      expect(getTagInfo('ECHO')?.name).toBe('echo');
      expect(getTagInfo('EcHo')?.name).toBe('echo');
    });

    it('should return undefined for unknown tags', () => {
      const unknown = getTagInfo('nonexistent_tag');
      expect(unknown).toBeUndefined();
    });

    it('should handle empty string gracefully', () => {
      const empty = getTagInfo('');
      expect(empty).toBeUndefined();
    });

    it('should handle special characters in tag names', () => {
      // Tags with hyphens DO exist in the catalog (e.g., page-url, page-size)
      const hyphen = getTagInfo('page-url');
      expect(hyphen).toBeDefined();
      expect(hyphen?.name).toBe('page-url');
    });

    it('should find all tags by various name formats', () => {
      // Test with common variations
      const ifTag = getTagInfo('if');
      expect(ifTag?.name).toBe('if');

      const foreachTag = getTagInfo('foreach');
      expect(foreachTag?.name).toBe('foreach');

      const emitTag = getTagInfo('emit');
      expect(emitTag?.name).toBe('emit');
    });
  });

  describe('specific tag definitions', () => {
    it('should define roxen container tag correctly', () => {
      const roxen = getTagInfo('roxen');

      expect(roxen?.type).toBe('container');
      expect(roxen?.attributes.length).toBeGreaterThan(0);
      expect(roxen?.description).toBeDefined();
    });

    it('should define set simple tag correctly', () => {
      const set = getTagInfo('set');

      expect(set?.type).toBe('simple');
      expect(set?.attributes.length).toBeGreaterThan(0);
    });

    it('should define emit container tag correctly', () => {
      const emit = getTagInfo('emit');

      expect(emit?.type).toBe('container');
      expect(emit?.description).toBeDefined();
    });

    it('should define conditional tags (if/elseif/else)', () => {
      const ifTag = getTagInfo('if');
      const elseifTag = getTagInfo('elseif');
      const elseTag = getTagInfo('else');

      expect(ifTag?.type).toBe('container');
      expect(elseifTag?.type).toBe('simple');
      expect(elseTag?.type).toBe('simple');
    });
  });

  describe('completeness', () => {
    it('should have at least 30 built-in tags', () => {
      // This ensures we have a reasonable catalog
      expect(RXML_TAG_CATALOG.length).toBeGreaterThanOrEqual(30);
    });

    it('should include common output tags', () => {
      const tagNames = new Set(RXML_TAG_CATALOG.map(t => t.name));

      expect(tagNames.has('output')).toBe(true);
      expect(tagNames.has('insert')).toBe(true);
      expect(tagNames.has('quote')).toBe(true);
    });

    it('should include database-related tags', () => {
      const tagNames = new Set(RXML_TAG_CATALOG.map(t => t.name));

      expect(tagNames.has('sqloutput')).toBe(true);
      expect(tagNames.has('sqltable')).toBe(true);
    });

    it('should include form/input tags', () => {
      const tagNames = new Set(RXML_TAG_CATALOG.map(t => t.name));

      expect(tagNames.has('formoutput')).toBe(true);
      expect(tagNames.has('input')).toBe(true);
    });
  });

  describe('duplicate tag handling', () => {
    it('should not have duplicate tag names in catalog', () => {
      const tagNames = RXML_TAG_CATALOG.map(t => t.name.toLowerCase());
      const uniqueNames = new Set(tagNames);

      // If there are duplicates, the unique set will be smaller
      expect(tagNames.length).toBe(uniqueNames.size);
    });

    it('should have unique case-insensitive tag names', () => {
      const tagNames = RXML_TAG_CATALOG.map(t => t.name.toLowerCase());
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const name of tagNames) {
        if (seen.has(name)) {
          duplicates.push(name);
        }
        seen.add(name);
      }

      expect(duplicates).toHaveLength(0);
    });
  });

  describe('attribute edge cases', () => {
    it('should handle tags with no optional attributes', () => {
      const elseTag = getTagInfo('else');
      expect(elseTag).toBeDefined();
      expect(elseTag?.attributes).toHaveLength(0);
    });

    it('should handle tags with required attributes', () => {
      const setTag = getTagInfo('set');
      expect(setTag).toBeDefined();

      const requiredAttrs = setTag?.attributes.filter(a => a.required) ?? [];
      expect(requiredAttrs.length).toBeGreaterThan(0);
    });

    it('should handle tags with optional attributes', () => {
      const echoTag = getTagInfo('echo');
      expect(echoTag).toBeDefined();

      const optionalAttrs = echoTag?.attributes.filter(a => !a.required) ?? [];
      expect(optionalAttrs.length).toBeGreaterThan(0);
    });

    it('should handle attributes with enum values', () => {
      const setTag = getTagInfo('set');
      expect(setTag).toBeDefined();

      const scopeAttr = setTag?.attributes.find(a => a.name === 'scope');
      expect(scopeAttr).toBeDefined();
      expect(scopeAttr?.values).toBeDefined();
      expect(scopeAttr?.values).toContain('form');
      expect(scopeAttr?.values).toContain('page');
    });

    it('should handle attributes without enum values', () => {
      const echoTag = getTagInfo('echo');
      expect(echoTag).toBeDefined();

      const varAttr = echoTag?.attributes.find(a => a.name === 'var');
      expect(varAttr).toBeDefined();
      expect(varAttr?.values).toBeUndefined();
    });
  });

  describe('malformed XML edge cases', () => {
    it('should handle tags with names that look like XML entities', () => {
      // These should return undefined as they don't exist
      expect(getTagInfo('&lt;')).toBeUndefined();
      expect(getTagInfo('&gt;')).toBeUndefined();
      expect(getTagInfo('&amp;')).toBeUndefined();
    });

    it('should handle tags with numeric prefixes', () => {
      expect(getTagInfo('123tag')).toBeUndefined();
    });

    it('should handle tags with special characters', () => {
      // Tags with hyphens exist (e.g., page-url, config-name)
      expect(getTagInfo('page-url')).toBeDefined();
      expect(getTagInfo('config-name')).toBeDefined();
      // Tags with underscores in name do NOT exist
      expect(getTagInfo('tag_with_underscore')).toBeUndefined();
      // Tags with dots do NOT exist
      expect(getTagInfo('tag.with.dots')).toBeUndefined();
    });

    it('should handle very long tag names gracefully', () => {
      const longName = 'a'.repeat(1000);
      const result = getTagInfo(longName);
      expect(result).toBeUndefined();
    });

    it('should handle tags with leading/trailing whitespace', () => {
      expect(getTagInfo('  if')).toBeUndefined();
      expect(getTagInfo('if  ')).toBeUndefined();
      expect(getTagInfo(' if ')).toBeUndefined();
    });

    it('should handle null/undefined input gracefully', () => {
      // Note: The current implementation does not handle null/undefined gracefully
      // and will throw. These tests document expected behavior if the function
      // is updated to handle these edge cases.
      // Currently getTagInfo(undefined) throws TypeError
      // @ts-expect-error - testing runtime behavior that throws
      expect(() => getTagInfo(undefined)).toThrow();
    });
  });

  describe('getAllTagNames()', () => {
    it('should return all tag names', () => {
      const names = getAllTagNames();
      expect(names.length).toBe(RXML_TAG_CATALOG.length);
    });

    it('should return unique tag names', () => {
      const names = getAllTagNames();
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('should include all known tag names', () => {
      const names = getAllTagNames();
      expect(names).toContain('if');
      expect(names).toContain('for');
      expect(names).toContain('echo');
      expect(names).toContain('roxen');
    });
  });

  describe('getTagsByType()', () => {
    it('should return only container tags', () => {
      const containers = getTagsByType('container');
      expect(containers.length).toBeGreaterThan(0);
      containers.forEach(tag => {
        expect(tag.type).toBe('container');
      });
    });

    it('should return only simple tags', () => {
      const simples = getTagsByType('simple');
      expect(simples.length).toBeGreaterThan(0);
      simples.forEach(tag => {
        expect(tag.type).toBe('simple');
      });
    });

    it('should cover all tags when combining types', () => {
      const containers = getTagsByType('container');
      const simples = getTagsByType('simple');
      expect(containers.length + simples.length).toBe(RXML_TAG_CATALOG.length);
    });
  });

  describe('searchTags()', () => {
    it('should find tags by name', () => {
      const results = searchTags('echo');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(t => t.name === 'echo')).toBe(true);
    });

    it('should find tags by description', () => {
      const results = searchTags('variable');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', () => {
      const upper = searchTags('ECHO');
      const lower = searchTags('echo');
      expect(upper.length).toBe(lower.length);
    });

    it('should return empty array for no matches', () => {
      const results = searchTags('xyznonexistent123');
      expect(results).toHaveLength(0);
    });

    it('should handle partial matches', () => {
      const results = searchTags('form');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getDeprecatedTags()', () => {
    it('should return deprecated tags', () => {
      const deprecated = getDeprecatedTags();
      expect(deprecated.length).toBeGreaterThan(0);
    });

    it('should mark all returned tags as deprecated', () => {
      const deprecated = getDeprecatedTags();
      deprecated.forEach(tag => {
        expect(tag.deprecated).toBe(true);
      });
    });

    it('should include known deprecated tags', () => {
      const deprecated = getDeprecatedTags();
      const names = deprecated.map(t => t.name);
      expect(names).toContain('sqloutput');
      expect(names).toContain('sqltable');
    });
  });

  describe('hasTag()', () => {
    it('should return true for existing tags', () => {
      expect(hasTag('if')).toBe(true);
      expect(hasTag('echo')).toBe(true);
      expect(hasTag('roxen')).toBe(true);
    });

    it('should return false for non-existing tags', () => {
      expect(hasTag('nonexistent')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(hasTag('IF')).toBe(true);
      expect(hasTag('Echo')).toBe(true);
      expect(hasTag('ROXEN')).toBe(true);
    });
  });
});
