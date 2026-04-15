/**
 * Edge-case tests for PikeIntrospectionService.fuzzyScore() and normalizeIdentifier().
 *
 * Both are private methods, so we copy their exact implementations here to test
 * the algorithm in isolation. If the source changes, these tests will need updating.
 *
 * Source: pike-introspection.ts lines 294-354
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Copy of private static fuzzyScore (pike-introspection.ts:327-354)
// ---------------------------------------------------------------------------

function fuzzyScore(query: string, name: string): number {
  const q = query.toLowerCase();
  const n = name.toLowerCase();

  // Exact match
  if (n === q) return 100;
  // Prefix match
  if (n.startsWith(q)) return 80 + q.length;
  // Substring match
  const subIdx = n.indexOf(q);
  if (subIdx >= 0) return 40 + q.length;

  // Contiguous subsequence match (characters appear in order)
  let qi = 0;
  let contiguous = 0;
  let bestContiguous = 0;
  for (let ni = 0; ni < n.length && qi < q.length; ni++) {
    if (n[ni] === q[qi]) {
      qi++;
      contiguous++;
      if (contiguous > bestContiguous) bestContiguous = contiguous;
    } else {
      contiguous = 0;
    }
  }
  if (qi < q.length) return 0; // not all query chars found
  return 20 + bestContiguous + q.length;
}

// ---------------------------------------------------------------------------
// Copy of private normalizeIdentifier (pike-introspection.ts:294-318)
// ---------------------------------------------------------------------------

function normalizeIdentifier(input: string): string {
  if (!input) {
    return '';
  }

  let text = input.trim();
  if (
    text.length > 1 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1);
  }

  const slash = text.lastIndexOf('/');
  if (slash >= 0 && slash < text.length - 1) {
    text = text.slice(slash + 1);
  }

  const dot = text.lastIndexOf('.');
  if (dot >= 0 && dot < text.length - 1) {
    text = text.slice(dot + 1);
  }

  return text.trim();
}

// ---------------------------------------------------------------------------
// Tests: fuzzyScore
// ---------------------------------------------------------------------------

describe('fuzzyScore', () => {
  describe('exact match', () => {
    it('returns 100 for identical strings', () => {
      assert.equal(fuzzyScore('Array', 'Array'), 100);
    });

    it('is case-insensitive for exact match', () => {
      assert.equal(fuzzyScore('array', 'ARRAY'), 100);
      assert.equal(fuzzyScore('ArRaY', 'aRrAy'), 100);
    });

    it('returns 100 for single character exact match', () => {
      assert.equal(fuzzyScore('a', 'a'), 100);
    });
  });

  describe('prefix match', () => {
    it('scores prefix higher than substring or fuzzy', () => {
      const prefixScore = fuzzyScore('Arr', 'Array');
      const substringScore = fuzzyScore('ray', 'Array');
      const fuzzyScore2 = fuzzyScore('ary', 'Array');
      assert.ok(prefixScore > substringScore);
      assert.ok(prefixScore > fuzzyScore2);
    });

    it('includes query length in prefix score', () => {
      assert.equal(fuzzyScore('ab', 'abcdef'), 80 + 2);
      assert.equal(fuzzyScore('abc', 'abcdef'), 80 + 3);
    });

    it('case-insensitive prefix match', () => {
      assert.equal(fuzzyScore('arr', 'ArrayMap'), 80 + 3);
    });

    it('full string is exact, not prefix (exact returns 100)', () => {
      assert.equal(fuzzyScore('Map', 'Map'), 100);
      // prefix would be 80 + 3 = 83, but exact wins at 100
    });
  });

  describe('substring match', () => {
    it('scores substring match at 40 + query length', () => {
      assert.equal(fuzzyScore('ple', 'Apple'), 40 + 3);
    });

    it('finds substring not at start', () => {
      assert.equal(fuzzyScore('ban', 'abandon'), 40 + 3);
    });

    it('case-insensitive substring', () => {
      assert.equal(fuzzyScore('MAP', 'streammap'), 40 + 3);
    });

    it('single character substring', () => {
      assert.equal(fuzzyScore('x', 'xyz'), 80 + 1); // 'x' is also a prefix
    });
  });

  describe('contiguous subsequence match', () => {
    it('matches characters appearing in order with gaps', () => {
      // 'rng' in 'String': s-t-r-i-n-g → r,n,g in order
      const score = fuzzyScore('rng', 'String');
      assert.ok(score > 0, 'should find subsequence match');
      assert.ok(score < 40, 'should score lower than substring');
    });

    it('returns 0 when not all query chars are found', () => {
      assert.equal(fuzzyScore('xyz', 'abc'), 0);
    });

    it('returns 0 when chars exist but not in order', () => {
      assert.equal(fuzzyScore('ba', 'ab'), 0);
    });

    it('scores higher for longer contiguous runs', () => {
      // 'ring' in 'String': r-i-n-g → contiguous run of 'ring' at end = 4
      const score1 = fuzzyScore('ring', 'String');
      // 'rng' in 'String': r-n-g with gaps → best contiguous = 2 (ng)
      const score2 = fuzzyScore('rng', 'String');
      assert.ok(score1 > score2, 'longer contiguous run should score higher');
    });

    it('base score is 20 + bestContiguous + query length', () => {
      // 'ab' in 'xaybz' → 'a' then 'b' not contiguous → bestContiguous=1, q.length=2
      const score = fuzzyScore('ab', 'xaybz');
      assert.equal(score, 20 + 1 + 2);
    });

    it('ab in xab is substring match, not subsequence', () => {
      // 'ab' in 'xab' → indexOf finds it at index 1 → substring match = 40 + 2
      const score = fuzzyScore('ab', 'xab');
      assert.equal(score, 40 + 2);
    });

    it('case-insensitive subsequence', () => {
      const score = fuzzyScore('RNG', 'string');
      assert.ok(score > 0);
    });
  });

  describe('scoring order invariant', () => {
    it('exact > prefix > substring > subsequence for same query length', () => {
      const exact = fuzzyScore('map', 'map');
      const prefix = fuzzyScore('map', 'mapping');
      const substring = fuzzyScore('map', 'heatmap');
      const subseq = fuzzyScore('map', 'makeapple');

      assert.ok(exact > prefix, `exact(${exact}) > prefix(${prefix})`);
      assert.ok(prefix > substring, `prefix(${prefix}) > substring(${substring})`);
      assert.ok(substring > subseq, `substring(${substring}) > subseq(${subseq})`);
    });
  });

  describe('edge cases', () => {
    it('empty query matches via prefix (startsWith empty is true)', () => {
      assert.equal(fuzzyScore('', 'anything'), 80 + 0);
    });

    it('returns 100 for empty query against empty name', () => {
      assert.equal(fuzzyScore('', ''), 100);
    });

    it('returns 0 when query is longer than name and not exact', () => {
      assert.equal(fuzzyScore('longquery', 'ab'), 0);
    });

    it('handles single character query against single character name', () => {
      assert.equal(fuzzyScore('a', 'a'), 100);
      assert.equal(fuzzyScore('a', 'b'), 0);
    });

    it('handles unicode characters', () => {
      assert.equal(fuzzyScore('cafe', 'cafe'), 100);
      assert.equal(fuzzyScore('caf', 'cafe'), 80 + 3);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: normalizeIdentifier
// ---------------------------------------------------------------------------

describe('normalizeIdentifier', () => {
  describe('empty and whitespace', () => {
    it('returns empty string for empty input', () => {
      assert.equal(normalizeIdentifier(''), '');
    });

    it('trims whitespace', () => {
      assert.equal(normalizeIdentifier('  foo  '), 'foo');
    });

    it('returns empty for whitespace-only input', () => {
      assert.equal(normalizeIdentifier('   '), '');
    });
  });

  describe('quote stripping', () => {
    it('strips double quotes', () => {
      assert.equal(normalizeIdentifier('"foo"'), 'foo');
    });

    it('strips single quotes', () => {
      assert.equal(normalizeIdentifier("'foo'"), 'foo');
    });

    it('does not strip mismatched quotes', () => {
      assert.equal(normalizeIdentifier('"foo'), '"foo');
      assert.equal(normalizeIdentifier("foo'"), "foo'");
    });

    it('does not strip single-character quoted string', () => {
      // text.length > 1 guard: '"' alone is not stripped
      assert.equal(normalizeIdentifier('"'), '"');
      assert.equal(normalizeIdentifier("'"), "'");
    });
  });

  describe('slash stripping', () => {
    it('extracts name after last slash', () => {
      assert.equal(normalizeIdentifier('path/to/Module'), 'Module');
    });

    it('handles single slash', () => {
      assert.equal(normalizeIdentifier('dir/File'), 'File');
    });

    it('handles trailing slash (no content after slash)', () => {
      assert.equal(normalizeIdentifier('path/to/'), 'path/to/');
    });
  });

  describe('dot stripping', () => {
    it('extracts name after last dot', () => {
      assert.equal(normalizeIdentifier('Module.Class.method'), 'method');
    });

    it('handles single dot', () => {
      assert.equal(normalizeIdentifier('file.pike'), 'pike');
    });

    it('handles trailing dot (no content after dot)', () => {
      assert.equal(normalizeIdentifier('foo.'), 'foo.');
    });
  });

  describe('combined transformations', () => {
    it('strips quotes then slashes then dots in order', () => {
      assert.equal(normalizeIdentifier('"path/to/Module.pike"'), 'pike');
    });

    it('strips quotes then dots', () => {
      assert.equal(normalizeIdentifier("'Stdio.File'"), 'File');
    });

    it('strips quotes then slashes', () => {
      assert.equal(normalizeIdentifier('"path/to/Symbol"'), 'Symbol');
    });

    it('handles fully qualified module path', () => {
      assert.equal(normalizeIdentifier('path/module.Name.Symbol'), 'Symbol');
    });
  });

  describe('trimming', () => {
    it('trims after all transformations', () => {
      assert.equal(normalizeIdentifier('  "foo"  '), 'foo');
    });

    it('trims after slash extraction', () => {
      assert.equal(normalizeIdentifier('  path/to/foo  '), 'foo');
    });
  });
});
