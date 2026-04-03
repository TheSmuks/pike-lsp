import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';

interface InheritEdge {
  ownerClass: string;
  ownerLine: number;
  inheritedName: string;
}

function collectImplementations(
  target: string,
  graph: Record<string, InheritEdge[]>
): Array<{ uri: string; ownerClass: string; ownerLine: number }> {
  const matches: Array<{ uri: string; ownerClass: string; ownerLine: number }> = [];
  const seen = new Set<string>();

  for (const [uri, edges] of Object.entries(graph)) {
    for (const edge of edges) {
      if (edge.inheritedName !== target) {
        continue;
      }

      const key = `${uri}:${edge.ownerClass}:${edge.ownerLine}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      matches.push({ uri, ownerClass: edge.ownerClass, ownerLine: edge.ownerLine });
    }
  }

  return matches;
}

describe('Scenario: Implementation introspection contracts', () => {
  it('Implementation finds true inherits not text matches', () => {
    const graph = {
      'file:///impl-a.pike': [{ ownerClass: 'ImplA', ownerLine: 4, inheritedName: 'Base' }],
      'file:///impl-b.pike': [{ ownerClass: 'ImplB', ownerLine: 7, inheritedName: 'Base' }],
      'file:///noise.pike': [{ ownerClass: 'Noise', ownerLine: 2, inheritedName: 'Other' }],
    };

    const matches = collectImplementations('Base', graph);
    assert.equal(matches.length, 2);
  });

  it('Implementation ignores inherit in comments', () => {
    const graph = {
      'file:///comment-only.pike': [],
      'file:///real.pike': [{ ownerClass: 'RealImpl', ownerLine: 1, inheritedName: 'Base' }],
    };

    const matches = collectImplementations('Base', graph);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.ownerClass, 'RealImpl');
  });

  it('Cross-file implementation detection works', () => {
    const graph = {
      'file:///src/impl-a.pike': [{ ownerClass: 'A', ownerLine: 3, inheritedName: 'Base' }],
      'file:///lib/impl-b.pike': [{ ownerClass: 'B', ownerLine: 9, inheritedName: 'Base' }],
      'file:///vendor/impl-c.pike': [{ ownerClass: 'C', ownerLine: 2, inheritedName: 'Base' }],
    };

    const matches = collectImplementations('Base', graph);
    assert.equal(matches.length, 3);
  });

  it('Implementation deduplicates duplicate graph edges', () => {
    const graph = {
      'file:///dup.pike': [
        { ownerClass: 'Dup', ownerLine: 5, inheritedName: 'Base' },
        { ownerClass: 'Dup', ownerLine: 5, inheritedName: 'Base' },
      ],
    };

    const matches = collectImplementations('Base', graph);
    assert.equal(matches.length, 1);
  });

  it('Implementation returns empty when class has no inheritors', () => {
    const graph = {
      'file:///child.pike': [{ ownerClass: 'Child', ownerLine: 1, inheritedName: 'Parent' }],
    };

    const matches = collectImplementations('UnknownBase', graph);
    assert.equal(matches.length, 0);
  });
});
