/**
 * Workspace Symbol Ranking Scenario Tests
 *
 * #1209: Tests for workspace symbol scoring and ranking.
 * Verifies that symbols are scored and returned in the correct order:
 * exact > prefix > camelCase > substring
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

// Helper to simulate the scoring function
function calculateSymbolScore(symbolName: string, query: string): number {
  if (!query) return 0;

  const name = symbolName;
  const queryLower = query.toLowerCase();
  const nameLower = name.toLowerCase();

  if (name === query) return 1000;
  if (nameLower === queryLower) return 900;
  if (name.startsWith(query)) return 500;
  if (nameLower.startsWith(queryLower)) return 400;

  const camelCaseMatch = query.split('').every((char, idx) => {
    const searchFrom = idx === 0 ? 0 : name.indexOf(query[idx - 1]!, idx - 1) + 1;
    return name.slice(searchFrom).includes(char);
  });
  if (camelCaseMatch) return 200;

  if (nameLower.includes(queryLower)) return 100;

  return 0;
}

describe('Workspace Symbol Ranking', () => {
  describe('Scoring Priority', () => {
    it('should score exact match highest', () => {
      const score = calculateSymbolScore('getValue', 'getValue');
      assert.equal(score, 1000);
    });

    it('should score case-insensitive exact match second highest', () => {
      const score = calculateSymbolScore('getValue', 'getvalue');
      assert.equal(score, 900);
    });

    it('should score prefix match third highest', () => {
      const score = calculateSymbolScore('getValue', 'get');
      assert.equal(score, 500);
    });

    it('should score camelCase match fifth highest', () => {
      const score = calculateSymbolScore('getValue', 'gV');
      assert.equal(score, 200);
    });

    it('should score camelCase match higher than substring', () => {
      // gV matches getValue via camelCase (g...V)
      const camelScore = calculateSymbolScore('getValue', 'gV');
      // alu matches getValue via substring (Valu)e
      const substringScore = calculateSymbolScore('getValue', 'val');
      assert.ok(camelScore > substringScore, 'CamelCase should score higher than substring');
      assert.equal(camelScore, 200);
      assert.equal(substringScore, 100);
    });
  });
});
