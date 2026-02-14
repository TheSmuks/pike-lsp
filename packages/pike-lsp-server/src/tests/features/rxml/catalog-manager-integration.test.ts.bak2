/**
 * Tests for RXML tag catalog
 */

import { describe, it, expect } from 'vitest';
import { RXML_TAG_CATALOG, getTagInfo } from '../../../features/rxml/tag-catalog';

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

    it('should return undefined for unknown tags', () => {
      const unknown = getTagInfo('nonexistent_tag');
      expect(unknown).toBeUndefined();
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
});
