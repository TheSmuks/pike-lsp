import { describe, it, beforeEach, afterEach, expect } from 'bun:test';
import type { RXMLTagCatalogEntry } from '../../features/rxml/types.js';
import {
  RXMLTagCatalogManager,
  mergeTags,
  rxmlTagCatalogManager,
} from '../../features/rxml/catalog-manager.js';

function makeTagEntry(
  name: string,
  type: 'simple' | 'container' = 'container'
): RXMLTagCatalogEntry {
  return {
    name,
    type,
    requiredAttributes: [],
    optionalAttributes: [],
  };
}

describe('RXMLTagCatalogManager', () => {
  let manager: RXMLTagCatalogManager;

  beforeEach(() => {
    manager = new RXMLTagCatalogManager();
    manager.clearAll();
  });

  afterEach(() => {
    manager.clearAll();
  });

  describe('getCatalog', () => {
    it('should load catalog from server tags', async () => {
      const builtinTags: RXMLTagCatalogEntry[] = [
        makeTagEntry('if', 'container'),
        makeTagEntry('set', 'simple'),
      ];
      const serverTags: RXMLTagCatalogEntry[] = [makeTagEntry('roxen-tag', 'container')];
      const customTags: RXMLTagCatalogEntry[] = [];

      const result = await manager.getCatalog(
        1234,
        'localhost:9000',
        builtinTags,
        serverTags,
        customTags
      );

      expect(result.length).toBe(3);
      const names = result.map(t => t.name);
      expect(names).toContain('if');
      expect(names).toContain('set');
      expect(names).toContain('roxen-tag');
    });

    it('should return cached catalog on subsequent calls', async () => {
      const builtinTags = [makeTagEntry('cached-tag')];
      const serverTags: RXMLTagCatalogEntry[] = [];
      const customTags: RXMLTagCatalogEntry[] = [];

      const first = await manager.getCatalog(
        1234,
        'localhost:9000',
        builtinTags,
        serverTags,
        customTags
      );

      const second = await manager.getCatalog(
        1234,
        'localhost:9000',
        [makeTagEntry('different-tag')],
        serverTags,
        customTags
      );

      expect(second.length).toBe(1);
      expect(second[0].name).toBe('cached-tag');
    });

    it('should return different catalogs for different servers', async () => {
      const builtinTags = [makeTagEntry('shared-tag')];
      const serverTags1 = [makeTagEntry('server1-tag')];
      const serverTags2 = [makeTagEntry('server2-tag')];
      const customTags: RXMLTagCatalogEntry[] = [];

      const catalog1 = await manager.getCatalog(
        1111,
        'server1',
        builtinTags,
        serverTags1,
        customTags
      );

      const catalog2 = await manager.getCatalog(
        2222,
        'server2',
        builtinTags,
        serverTags2,
        customTags
      );

      expect(catalog1.map(t => t.name).sort()).toEqual(['server1-tag', 'shared-tag']);
      expect(catalog2.map(t => t.name).sort()).toEqual(['server2-tag', 'shared-tag']);
    });
  });

  describe('refreshCatalog', () => {
    it('should refresh catalog and update cache', async () => {
      const builtinTags = [makeTagEntry('original')];
      const serverTags = [makeTagEntry('server-original')];
      const customTags: RXMLTagCatalogEntry[] = [];

      await manager.getCatalog(1234, 'localhost:9000', builtinTags, serverTags, customTags);

      const newServerTags = [makeTagEntry('server-updated')];
      await manager.refreshCatalog(1234, 'localhost:9000', builtinTags, newServerTags, customTags);

      const result = await manager.getCatalog(1234, 'localhost:9000', [], [], []);

      expect(result.map(t => t.name).sort()).toEqual(['original', 'server-updated']);
    });
  });

  describe('invalidateServer', () => {
    it('should invalidate cache for specific server', async () => {
      const builtinTags = [makeTagEntry('tag')];
      const serverTags = [makeTagEntry('server-tag')];
      const customTags: RXMLTagCatalogEntry[] = [];

      await manager.getCatalog(1234, 'localhost:9000', builtinTags, serverTags, customTags);

      manager.invalidateServer(1234, 'localhost:9000');

      const result = await manager.getCatalog(1234, 'localhost:9000', [], [], []);
      expect(result.length).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all cached catalogs', async () => {
      const builtinTags = [makeTagEntry('tag')];
      const serverTags: RXMLTagCatalogEntry[] = [];
      const customTags: RXMLTagCatalogEntry[] = [];

      await manager.getCatalog(1234, 'localhost:9000', builtinTags, serverTags, customTags);
      await manager.getCatalog(5678, 'localhost:9001', builtinTags, serverTags, customTags);

      manager.clearAll();

      const result1 = await manager.getCatalog(1234, 'localhost:9000', [], [], []);
      const result2 = await manager.getCatalog(5678, 'localhost:9001', [], [], []);

      expect(result1.length).toBe(0);
      expect(result2.length).toBe(0);
    });
  });

  describe('findTag', () => {
    it('should find tag by name in catalog', async () => {
      const builtinTags = [makeTagEntry('if', 'container'), makeTagEntry('set', 'simple')];
      const serverTags: RXMLTagCatalogEntry[] = [];
      const customTags: RXMLTagCatalogEntry[] = [];

      await manager.getCatalog(1234, 'localhost:9000', builtinTags, serverTags, customTags);

      const result = manager.findTag('if', 1234, 'localhost:9000');

      expect(result).not.toBeUndefined();
      expect(result?.name).toBe('if');
      expect(result?.type).toBe('container');
    });

    it('should return undefined for unknown tags', async () => {
      const builtinTags = [makeTagEntry('if')];
      const serverTags: RXMLTagCatalogEntry[] = [];
      const customTags: RXMLTagCatalogEntry[] = [];

      await manager.getCatalog(1234, 'localhost:9000', builtinTags, serverTags, customTags);

      const result = manager.findTag('nonexistent', 1234, 'localhost:9000');

      expect(result).toBeUndefined();
    });

    it('should return undefined when no catalog is loaded', () => {
      const result = manager.findTag('any', 9999, 'unknown');
      expect(result).toBeUndefined();
    });
  });
});

describe('mergeTags', () => {
  it('should merge tags from all sources', () => {
    const builtin = [makeTagEntry('builtin-tag')];
    const server = [makeTagEntry('server-tag')];
    const custom = [makeTagEntry('custom-tag')];

    const result = mergeTags(builtin, server, custom);

    expect(result.length).toBe(3);
    expect(result.map(t => t.name)).toContain('builtin-tag');
    expect(result.map(t => t.name)).toContain('server-tag');
    expect(result.map(t => t.name)).toContain('custom-tag');
  });

  it('should prioritize custom tags over builtin', () => {
    const builtin = [makeTagEntry('override', 'container')];
    const server: RXMLTagCatalogEntry[] = [];
    const custom = [makeTagEntry('override', 'simple')];

    const result = mergeTags(builtin, server, custom);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('simple');
  });

  it('should prioritize builtin over server', () => {
    const builtin = [makeTagEntry('override', 'container')];
    const server = [makeTagEntry('override', 'simple')];
    const custom: RXMLTagCatalogEntry[] = [];

    const result = mergeTags(builtin, server, custom);

    expect(result.length).toBe(1);
    expect(result[0].type).toBe('container');
  });

  it('should handle empty arrays', () => {
    const builtin: RXMLTagCatalogEntry[] = [];
    const server: RXMLTagCatalogEntry[] = [];
    const custom: RXMLTagCatalogEntry[] = [];

    const result = mergeTags(builtin, server, custom);

    expect(result.length).toBe(0);
  });
});

describe('rxmlTagCatalogManager singleton', () => {
  afterEach(() => {
    rxmlTagCatalogManager.clearAll();
  });

  it('should export a singleton instance', () => {
    expect(rxmlTagCatalogManager).toBeInstanceOf(RXMLTagCatalogManager);
  });

  it('should be usable for loading catalogs', async () => {
    const builtinTags = [makeTagEntry('singleton-tag')];
    const serverTags: RXMLTagCatalogEntry[] = [];
    const customTags: RXMLTagCatalogEntry[] = [];

    const result = await rxmlTagCatalogManager.getCatalog(
      1234,
      'test',
      builtinTags,
      serverTags,
      customTags
    );

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('singleton-tag');
  });
});
