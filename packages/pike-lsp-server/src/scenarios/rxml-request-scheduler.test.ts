/**
 * Scenario: RXML providers use RequestScheduler for resilient request handling
 *
 * Validates issue #1274: definition-provider and references-provider now use
 * RequestScheduler.schedule() with RequestSupersededError handling so that
 * rapid concurrent requests for the same workspace are properly superseded
 * and stale work is cancelled rather than running to completion.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findTagDefinition,
  findDefvarDefinition,
  invalidateRXMLDefinitionCaches,
} from '../features/rxml/definition-provider.js';
import {
  findTagReferences,
  findDefvarReferences,
  findModulesUsingTag,
  invalidateRXMLReferenceCaches,
} from '../features/rxml/references-provider.js';
import type { BridgeManager } from '../services/bridge-manager.js';
import type { PikeToken } from '@pike-lsp/pike-bridge';

/** Minimal mock bridge that tokenizes defvar declarations for tests. */
function createMockDefvarBridge(): BridgeManager {
  return {
    async tokenize(text: string): Promise<PikeToken[]> {
      const tokens: PikeToken[] = [];
      const lines = text.split('\n');
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!;
        const col = line.indexOf('defvar');
        if (col === -1) continue;
        tokens.push({ text: 'defvar', line: lineIdx + 1, character: col, file: 0 });
        tokens.push({ text: '(', line: lineIdx + 1, character: col + 6, file: 0 });
        const rest = line.slice(col + 7);
        let i = 0;
        if (i < rest.length && rest[i] === '(') i++;
        while (i < rest.length) {
          const c = rest[i]!;
          if (c === ')') {
            tokens.push({ text: ')', line: lineIdx + 1, character: col + 7 + i, file: 0 });
            break;
          }
          if (c === '"' || c === "'") {
            const quote = c;
            tokens.push({ text: quote, line: lineIdx + 1, character: col + 7 + i, file: 0 });
            i++;
            let end = i;
            while (end < rest.length && rest[end] !== quote) end++;
            if (end > i) {
              tokens.push({
                text: rest.slice(i, end),
                line: lineIdx + 1,
                character: col + 7 + i,
                file: 0,
              });
            }
            i = end;
            if (i < rest.length && rest[i] === quote) {
              tokens.push({ text: quote, line: lineIdx + 1, character: col + 7 + i, file: 0 });
              i++;
            }
          } else if (/[\s;]/.test(c)) {
            i++;
          } else if (c === ',') {
            tokens.push({ text: ',', line: lineIdx + 1, character: col + 7 + i, file: 0 });
            i++;
          } else {
            let end = i;
            while (end < rest.length && !/[\s,();"']/.test(rest[end]!)) end++;
            tokens.push({
              text: rest.slice(i, end),
              line: lineIdx + 1,
              character: col + 7 + i,
              file: 0,
            });
            i = end;
          }
        }
      }
      return tokens;
    },
  } as BridgeManager;
}

const createdDirs: string[] = [];

async function cleanup(): Promise<void> {
  invalidateRXMLDefinitionCaches();
  invalidateRXMLReferenceCaches();
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

describe('RXML request scheduler resilience', () => {
  it('should handle rapid concurrent findTagDefinition calls without error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-sched-def-'));
    createdDirs.push(root);

    // Create workspace with several .pike files
    for (let i = 0; i < 10; i++) {
      await writeFile(
        join(root, `module-${i}.pike`),
        `simpletag tag_${i}() { return 1; }`,
        'utf-8'
      );
    }

    // Fire off many concurrent requests for the same workspace key
    // The scheduler should supersede earlier requests and return results
    // without throwing unhandled errors
    const results = await Promise.allSettled([
      findTagDefinition('tag_0', [root]),
      findTagDefinition('tag_1', [root]),
      findTagDefinition('tag_2', [root]),
      findTagDefinition('tag_3', [root]),
      findTagDefinition('tag_4', [root]),
    ]);

    // All promises should settle (either fulfilled or gracefully handled)
    // None should be rejected with an unhandled error
    for (const result of results) {
      assert.equal(result.status, 'fulfilled', `Expected fulfilled, got ${result.status}`);
    }

    // At least some should return non-null results
    const fulfilled = results.filter(r => r.status === 'fulfilled' && r.value !== null);
    assert.equal(
      fulfilled.length > 0,
      true,
      'At least one concurrent definition request should succeed'
    );

    await cleanup();
  });

  it('should handle rapid concurrent findTagReferences calls without error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-sched-ref-'));
    createdDirs.push(root);

    // Create template files
    for (let i = 0; i < 5; i++) {
      await writeFile(join(root, `template-${i}.rxml`), `<tag_${i} />`, 'utf-8');
    }
    // Create pike files with declarations
    await writeFile(join(root, 'mod.pike'), 'simpletag tag_0() { return 1; }', 'utf-8');

    // Fire off concurrent reference lookups
    const results = await Promise.allSettled([
      findTagReferences('tag_0', [root], true),
      findTagReferences('tag_1', [root], false),
      findTagReferences('tag_2', [root], true),
    ]);

    for (const result of results) {
      assert.equal(result.status, 'fulfilled', `Expected fulfilled, got ${result.status}`);
    }

    await cleanup();
  });

  it('should handle superseded findDefvarDefinition gracefully', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-sched-defvar-'));
    createdDirs.push(root);

    await writeFile(
      join(root, 'module.pike'),
      'defvar("my_var", "My Var", TYPE_STRING, "default", 0);',
      'utf-8'
    );

    // Concurrent defvar lookups for same workspace
    const bridge = createMockDefvarBridge();
    const results = await Promise.allSettled([
      findDefvarDefinition('my_var', [root], bridge),
      findDefvarDefinition('my_var', [root], bridge),
      findDefvarDefinition('my_var', [root], bridge),
    ]);
    for (const result of results) {
      assert.equal(result.status, 'fulfilled', `Expected fulfilled, got ${result.status}`);
    }

    // At least one should resolve with the defvar
    const found = results.some(r => r.status === 'fulfilled' && r.value !== null);
    assert.equal(found, true, 'At least one defvar lookup should succeed');

    await cleanup();
  });

  it('should handle superseded findDefvarReferences gracefully', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-sched-dvref-'));
    createdDirs.push(root);

    await writeFile(
      join(root, 'module.pike'),
      'defvar("counter", TYPE_INT, 0, "count");\nint counter = counter + 1;',
      'utf-8'
    );

    const results = await Promise.allSettled([
      findDefvarReferences('counter', [root]),
      findDefvarReferences('counter', [root]),
    ]);

    for (const result of results) {
      assert.equal(result.status, 'fulfilled', `Expected fulfilled, got ${result.status}`);
    }

    await cleanup();
  });

  it('should handle superseded findModulesUsingTag gracefully', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-sched-mod-'));
    createdDirs.push(root);

    await writeFile(join(root, 'page.rxml'), '<mytag />', 'utf-8');

    const results = await Promise.allSettled([
      findModulesUsingTag('mytag', [root]),
      findModulesUsingTag('mytag', [root]),
    ]);

    for (const result of results) {
      assert.equal(result.status, 'fulfilled', `Expected fulfilled, got ${result.status}`);
    }

    await cleanup();
  });

  it('should return correct results after scheduler supersession clears', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pike-sched-serial-'));
    createdDirs.push(root);

    await writeFile(join(root, 'module.pike'), 'simpletag alpha() { return 1; }', 'utf-8');

    // First request should complete normally
    const first = await findTagDefinition('alpha', [root]);
    assert.notEqual(first, null, 'First lookup should find alpha');
    assert.equal(first?.tagName, 'alpha');

    // Invalidate to force re-indexing
    invalidateRXMLDefinitionCaches();

    // Update the file
    await writeFile(join(root, 'module.pike'), 'simpletag beta() { return 2; }', 'utf-8');

    // After invalidation, should find the new tag
    const second = await findTagDefinition('beta', [root]);
    assert.notEqual(second, null, 'Second lookup should find beta');
    assert.equal(second?.tagName, 'beta');

    await cleanup();
  });
});
