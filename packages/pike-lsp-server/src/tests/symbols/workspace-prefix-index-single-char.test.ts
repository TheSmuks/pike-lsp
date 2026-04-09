/**
 * Tests for single-character prefix index optimization (PERF-1285).
 *
 * Before the fix, single-char workspace symbol searches fell back to O(n)
 * scan of symbolLookup because the prefix index only stored prefixes of
 * length >= 2. Now single-char prefixes are indexed too.
 */
import { describe, it, expect, beforeEach } from 'bun:test';
import { WorkspaceIndex } from '../../workspace-index.js';

/**
 * Helper: access private prefixIndex for assertions.
 */
function getPrefixIndex(idx: WorkspaceIndex): Map<string, Set<string>> {
  return (idx as unknown as { prefixIndex: Map<string, Set<string>> }).prefixIndex;
}

/**
 * Helper: access private symbolLookup.
 */
function getSymbolLookup(idx: WorkspaceIndex): Map<string, Map<string, unknown>> {
  return (idx as unknown as { symbolLookup: Map<string, Map<string, unknown>> }).symbolLookup;
}

describe('Single-char prefix index (PERF-1285)', () => {
  let index: WorkspaceIndex;

  beforeEach(() => {
    index = new WorkspaceIndex();
  });

  describe('prefix index population', () => {
    it('indexes single-character prefixes into prefixIndex', () => {
      // Use internal lookup to add a symbol named 'myFunction'
      const symbols = [{ name: 'myFunction', kind: 'method', position: { line: 1 }, children: [] }];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
      });

      // Use the private addToLookup
      const flatSymbols = symbols.map(s => ({ symbol: s }));
      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup('file:///test.pike', flatSymbols);

      const prefixIndex = getPrefixIndex(index);
      expect(prefixIndex.has('m')).toBe(true);
      expect(prefixIndex.has('my')).toBe(true);
      expect(prefixIndex.has('myf')).toBe(true);
      expect(prefixIndex.has('myfu')).toBe(true);
      // 'myfun' is length 5 > MAX_DEPTH=4, so not stored separately
      expect(prefixIndex.has('myfun')).toBe(false);

      // 'm' set should contain 'myfunction' (lowercase)
      const mSet = prefixIndex.get('m');
      expect(mSet).toBeDefined();
      expect(mSet!.has('myfunction')).toBe(true);
    });

    it('indexes single-char symbol names into prefixIndex', () => {
      const symbols = [{ name: 'x', kind: 'variable', position: { line: 1 }, children: [] }];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///test.pike',
        symbols.map(s => ({ symbol: s }))
      );

      const prefixIndex = getPrefixIndex(index);
      expect(prefixIndex.has('x')).toBe(true);
      expect(prefixIndex.get('x')!.has('x')).toBe(true);
    });
  });

  describe('single-char search uses prefix index', () => {
    it('finds symbols with single-char prefix query', () => {
      const symbols = [
        { name: 'alpha', kind: 'method', position: { line: 1 }, children: [] },
        { name: 'app', kind: 'class', position: { line: 5 }, children: [] },
        { name: 'beta', kind: 'method', position: { line: 10 }, children: [] },
      ];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
        lineCount: 15,
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///test.pike',
        symbols.map(s => ({ symbol: s })),
        15
      );

      // Single-char query 'a' should find 'alpha' and 'app' but not 'beta'
      const results = index.searchSymbols('a');
      expect(results.length).toBe(2);
      const names = results.map(r => r.name);
      expect(names).toContain('alpha');
      expect(names).toContain('app');
      expect(names).not.toContain('beta');
    });

    it('finds exact single-char symbol name', () => {
      const symbols = [
        { name: 'm', kind: 'method', position: { line: 1 }, children: [] },
        { name: 'myFunction', kind: 'method', position: { line: 5 }, children: [] },
      ];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
        lineCount: 10,
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///test.pike',
        symbols.map(s => ({ symbol: s })),
        10
      );

      const results = index.searchSymbols('m');
      expect(results.length).toBe(2);
      // Exact match should be ranked first
      expect(results[0].name).toBe('m');
    });

    it('returns empty when no symbols match single-char query', () => {
      const symbols = [{ name: 'alpha', kind: 'method', position: { line: 1 }, children: [] }];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
        lineCount: 5,
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///test.pike',
        symbols.map(s => ({ symbol: s })),
        5
      );

      const results = index.searchSymbols('z');
      expect(results).toEqual([]);
    });
  });

  describe('prefix index cleanup on removal', () => {
    it('removes single-char prefix entries when last symbol using them is removed', () => {
      // Add symbol starting with 'z'
      const symbols = [{ name: 'zebra', kind: 'class', position: { line: 1 }, children: [] }];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
        lineCount: 5,
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///test.pike',
        symbols.map(s => ({ symbol: s })),
        5
      );

      const prefixIndex = getPrefixIndex(index);
      expect(prefixIndex.has('z')).toBe(true);

      // Remove the document
      index.removeDocument('file:///test.pike');

      // Single-char prefix 'z' should be cleaned up
      expect(prefixIndex.has('z')).toBe(false);
      // searchSymbols should find nothing
      expect(index.searchSymbols('z')).toEqual([]);
    });

    it('keeps single-char prefix entry when other symbols still use it', () => {
      const symbolsA = [{ name: 'alpha', kind: 'method', position: { line: 1 }, children: [] }];
      const symbolsB = [{ name: 'app', kind: 'class', position: { line: 1 }, children: [] }];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;

      docs.set('file:///a.pike', {
        uri: 'file:///a.pike',
        symbols: symbolsA,
        version: 1,
        lastModified: Date.now(),
        lineCount: 5,
      });
      docs.set('file:///b.pike', {
        uri: 'file:///b.pike',
        symbols: symbolsB,
        version: 1,
        lastModified: Date.now(),
        lineCount: 5,
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///a.pike',
        symbolsA.map(s => ({ symbol: s })),
        5
      );
      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///b.pike',
        symbolsB.map(s => ({ symbol: s })),
        5
      );

      const prefixIndex = getPrefixIndex(index);
      expect(prefixIndex.get('a')!.has('alpha')).toBe(true);
      expect(prefixIndex.get('a')!.has('app')).toBe(true);

      // Remove one document
      index.removeDocument('file:///a.pike');

      // 'a' prefix still exists because 'app' uses it
      expect(prefixIndex.has('a')).toBe(true);
      expect(prefixIndex.get('a')!.has('alpha')).toBe(false);
      expect(prefixIndex.get('a')!.has('app')).toBe(true);

      // Searching for 'a' should still find 'app'
      const results = index.searchSymbols('a');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('app');
    });
  });

  describe('searchImportableSymbols single-char', () => {
    it('finds importable symbols with single-char prefix via prefix index', () => {
      const symbols = [
        { name: 'Alpha', kind: 'class', position: { line: 1 }, children: [] },
        { name: 'alphaMethod', kind: 'method', position: { line: 5 }, children: [] },
      ];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///src/Alpha.pike', {
        uri: 'file:///src/Alpha.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
        lineCount: 10,
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///src/Alpha.pike',
        symbols.map(s => ({ symbol: s })),
        10
      );

      const results = index.searchImportableSymbols('a');
      expect(results.length).toBeGreaterThanOrEqual(1);
      // Should find symbols starting with 'a'
      expect(results.every(r => r.symbol.toLowerCase().startsWith('a'))).toBe(true);
    });
  });

  describe('clear removes single-char prefixes', () => {
    it('clears all single-char prefix entries', () => {
      const symbols = [{ name: 'foo', kind: 'method', position: { line: 1 }, children: [] }];
      const docs = (index as unknown as { documents: Map<string, unknown> }).documents;
      docs.set('file:///test.pike', {
        uri: 'file:///test.pike',
        symbols,
        version: 1,
        lastModified: Date.now(),
      });

      (
        index as unknown as { addToLookup: (uri: string, syms: unknown[], lc?: number) => void }
      ).addToLookup(
        'file:///test.pike',
        symbols.map(s => ({ symbol: s }))
      );

      expect(getPrefixIndex(index).has('f')).toBe(true);
      index.clear();
      expect(getPrefixIndex(index).has('f')).toBe(false);
      expect(getPrefixIndex(index).size).toBe(0);
    });
  });
});
