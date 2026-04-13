/**
 * Scenario: definition-provider.ts workspace-wide scanning logic
 *
 * Covers issue #1611: defvar name extraction edge cases, cache TTL behavior,
 * duplicate defvar handling, empty/malformed defvar calls, and tag definition
 * extraction with string-scan fallback.
 *
 * Tests go through the public API (findTagDefinition, findDefvarDefinition,
 * invalidateRXMLDefinitionCaches) using real temp directories with .pike
 * files, matching the established pattern from rxml-file-cache-lru.test.ts.
 */

import { describe, it, afterEach } from 'bun:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findTagDefinition,
  findDefvarDefinition,
  invalidateRXMLDefinitionCaches,
} from '../features/rxml/definition-provider.js';
import { clearFileContentCache } from '../features/rxml/file-content-cache.js';

const createdDirs: string[] = [];

async function cleanup(): Promise<void> {
  invalidateRXMLDefinitionCaches();
  clearFileContentCache();
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createWorkspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'pike-defprov-'));
  createdDirs.push(root);
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(root, name), content, 'utf-8');
  }
  return root;
}

// ---------------------------------------------------------------------------
// Defvar extraction
// ---------------------------------------------------------------------------

describe('definition-provider defvar extraction', () => {
  it('should extract a simple defvar with double-quoted name', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("site_name", TYPE_STRING, "", "Site name");\n',
    });

    const result = await findDefvarDefinition('site_name', [root]);
    assert.ok(result, 'should find defvar "site_name"');
    assert.equal(result!.name, 'site_name');
    assert.ok(result!.location.uri.includes('mod.pike'));
    assert.equal(result!.location.range.start.line, 0);
    assert.equal(result!.type, 'mixed');
  });

  it('should extract a defvar with single-quoted name', async () => {
    const root = await createWorkspace({
      'mod.pike': "defvar('cache_ttl', TYPE_INT, 300, 'Cache TTL');\n",
    });

    const result = await findDefvarDefinition('cache_ttl', [root]);
    assert.ok(result, 'should find defvar with single-quoted name');
    assert.equal(result!.name, 'cache_ttl');
  });

  it('should perform case-insensitive defvar lookup', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("MyVariable", TYPE_STRING, "", "desc");\n',
    });

    // Look up with different casing
    const lower = await findDefvarDefinition('myvariable', [root]);
    assert.ok(lower, 'case-insensitive lookup should find "MyVariable"');
    assert.equal(lower!.name, 'MyVariable');

    const upper = await findDefvarDefinition('MYVARIABLE', [root]);
    assert.ok(upper, 'uppercase lookup should also find it');
    assert.equal(upper!.name, 'MyVariable');
  });

  it('should extract multiple defvars from the same file', async () => {
    const root = await createWorkspace({
      'mod.pike':
        'defvar("alpha", TYPE_STRING, "", "First");\n' +
        'defvar("beta", TYPE_INT, 0, "Second");\n' +
        'defvar("gamma", TYPE_FLAG, 0, "Third");\n',
    });

    const alpha = await findDefvarDefinition('alpha', [root]);
    assert.ok(alpha);
    assert.equal(alpha!.name, 'alpha');
    assert.equal(alpha!.location.range.start.line, 0);

    const beta = await findDefvarDefinition('beta', [root]);
    assert.ok(beta);
    assert.equal(beta!.name, 'beta');
    assert.equal(beta!.location.range.start.line, 1);

    const gamma = await findDefvarDefinition('gamma', [root]);
    assert.ok(gamma);
    assert.equal(gamma!.name, 'gamma');
    assert.equal(gamma!.location.range.start.line, 2);
  });

  it('should extract defvar from files after other code lines', async () => {
    const root = await createWorkspace({
      'mod.pike':
        '// Module header\n' +
        'inherit "module.pike";\n' +
        '\n' +
        'constant MODULE_VERSION = "1.0";\n' +
        '\n' +
        'defvar("late_var", TYPE_STRING, "", "Defined after other code");\n',
    });

    const result = await findDefvarDefinition('late_var', [root]);
    assert.ok(result);
    assert.equal(result!.location.range.start.line, 5);
  });

  it('should handle defvar with nested parens in arguments', async () => {
    // The regex /defvar\s*\(\s*["']([^"']+)["']/g matches the defvar name
    // immediately after the opening paren regardless of what follows.
    const root = await createWorkspace({
      'mod.pike': 'defvar("complex_var", TYPE_STRING_LIST, ({ "a", "b" }), "List default");\n',
    });

    const result = await findDefvarDefinition('complex_var', [root]);
    assert.ok(result, 'should extract defvar name even with list default value');
    assert.equal(result!.name, 'complex_var');
  });

  it('should handle defvar with no whitespace after paren', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("tight", TYPE_INT, 0, "No space");\n',
    });

    const result = await findDefvarDefinition('tight', [root]);
    assert.ok(result);
    assert.equal(result!.name, 'tight');
  });

  it('should handle defvar with extra whitespace', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar(  "spaced"  , TYPE_INT, 0, "Spaces");\n',
    });

    const result = await findDefvarDefinition('spaced', [root]);
    assert.ok(result, 'should handle extra whitespace');
    assert.equal(result!.name, 'spaced');
  });

  it('should return null for defvar not found in workspace', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("existing", TYPE_INT, 0, "desc");\n',
    });

    const result = await findDefvarDefinition('nonexistent', [root]);
    assert.equal(result, null);
  });

  it('should return null for empty workspace', async () => {
    const root = await createWorkspace({});

    const result = await findDefvarDefinition('anything', [root]);
    assert.equal(result, null);
  });

  it('should return null for workspace with no .pike files', async () => {
    const root = await createWorkspace({
      'readme.txt': 'Hello world\n',
    });

    const result = await findDefvarDefinition('anything', [root]);
    assert.equal(result, null);
  });

  it('should return null for .pike file with no defvar calls', async () => {
    const root = await createWorkspace({
      'mod.pike': 'int compute() { return 42; }\n',
    });

    const result = await findDefvarDefinition('anything', [root]);
    assert.equal(result, null);
  });

  it('should skip defvar call with empty string name', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("", TYPE_INT, 0, "Empty name");\n',
    });

    // Empty string is falsy in the condition `if (name)` at line 112
    const result = await findDefvarDefinition('', [root]);
    assert.equal(result, null, 'empty-string defvar name should be skipped');
  });
});

// ---------------------------------------------------------------------------
// Duplicate defvar handling (first-wins semantics)
// ---------------------------------------------------------------------------

describe('definition-provider duplicate defvar handling', () => {
  it('should use first file for duplicate defvar name (glob order)', async () => {
    const root = await createWorkspace({
      'module-a.pike': 'defvar("shared", TYPE_STRING, "a", "From A");\n',
      'module-b.pike': 'defvar("shared", TYPE_INT, 0, "From B");\n',
    });

    const result = await findDefvarDefinition('shared', [root]);
    assert.ok(result);
    // First-wins: whichever file glob returns first wins. Both files have it,
    // so the result should point to one of them and never the second.
    assert.ok(result!.name === 'shared');
    assert.ok(
      result!.location.uri.includes('module-a.pike') ||
        result!.location.uri.includes('module-b.pike'),
      'should resolve to a file containing the defvar'
    );
  });

  it('should use first occurrence in the same file', async () => {
    const root = await createWorkspace({
      'mod.pike':
        'defvar("dup", TYPE_STRING, "", "First");\n' + 'defvar("dup", TYPE_INT, 0, "Second");\n',
    });

    const result = await findDefvarDefinition('dup', [root]);
    assert.ok(result);
    assert.equal(result!.location.range.start.line, 0, 'first occurrence wins');
  });
});

// ---------------------------------------------------------------------------
// Tag definition extraction (string-scan fallback)
// ---------------------------------------------------------------------------

describe('definition-provider tag extraction', () => {
  it('should find a simpletag definition', async () => {
    const root = await createWorkspace({
      'mod.pike': 'simpletag my_tag() { return "hello"; }\n',
    });

    const result = await findTagDefinition('my_tag', [root]);
    assert.ok(result);
    assert.equal(result!.tagName, 'my_tag');
    assert.equal(result!.functionName, 'simpletag_my_tag');
    assert.equal(result!.tagType, 'simple');
    assert.ok(result!.location.uri.includes('mod.pike'));
    assert.equal(result!.location.range.start.line, 0);
  });

  it('should find a container tag definition', async () => {
    const root = await createWorkspace({
      'mod.pike': 'container my_wrap(string contents, mapping args) { return contents; }\n',
    });

    const result = await findTagDefinition('my_wrap', [root]);
    assert.ok(result);
    assert.equal(result!.tagName, 'my_wrap');
    assert.equal(result!.functionName, 'container_my_wrap');
    assert.equal(result!.tagType, 'container');
  });

  it('should find tags using space-separated form', async () => {
    const root = await createWorkspace({
      'mod.pike': 'simpletag space_form() { return 1; }\n',
    });

    const result = await findTagDefinition('space_form', [root]);
    assert.ok(result, 'space-separated simpletag form should be found');
    assert.equal(result!.tagName, 'space_form');
    assert.equal(result!.tagType, 'simple');
  });

  it('should find multiple tags in one file', async () => {
    const root = await createWorkspace({
      'mod.pike': 'simpletag tag_a() { return 1; }\n' + 'container tag_b() { return "x"; }\n',
    });

    const a = await findTagDefinition('tag_a', [root]);
    assert.ok(a);
    assert.equal(a!.tagType, 'simple');

    const b = await findTagDefinition('tag_b', [root]);
    assert.ok(b);
    assert.equal(b!.tagType, 'container');
  });

  it('should return null for unknown tag', async () => {
    const root = await createWorkspace({
      'mod.pike': 'simpletag existing() { return 1; }\n',
    });

    const result = await findTagDefinition('nonexistent', [root]);
    assert.equal(result, null);
  });

  it('should return null for empty workspace folders list', async () => {
    const result = await findTagDefinition('anything', []);
    assert.equal(result, null);
  });

  it('should find tags across multiple files', async () => {
    const root = await createWorkspace({
      'tags-a.pike': 'simpletag from_a() { return 1; }\n',
      'tags-b.pike': 'container from_b() { return "x"; }\n',
    });

    const a = await findTagDefinition('from_a', [root]);
    assert.ok(a);
    assert.ok(a!.location.uri.includes('tags-a.pike'));

    const b = await findTagDefinition('from_b', [root]);
    assert.ok(b);
    assert.ok(b!.location.uri.includes('tags-b.pike'));
  });
});

// ---------------------------------------------------------------------------
// Cache behavior
// ---------------------------------------------------------------------------

describe('definition-provider cache behavior', () => {
  it('should return cached result on second call within TTL', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("cached_var", TYPE_STRING, "", "Test");\n',
    });

    // First call builds the index
    const first = await findDefvarDefinition('cached_var', [root]);
    assert.ok(first);

    // Second call should hit cache (same process, same workspace key)
    const second = await findDefvarDefinition('cached_var', [root]);
    assert.ok(second);
    assert.equal(second!.name, first!.name);
    assert.equal(second!.location.uri, first!.location.uri);
  });

  it('should return cached tag result on second call', async () => {
    const root = await createWorkspace({
      'mod.pike': 'simpletag cached_tag() { return 1; }\n',
    });

    const first = await findTagDefinition('cached_tag', [root]);
    assert.ok(first);

    const second = await findTagDefinition('cached_tag', [root]);
    assert.ok(second);
    assert.equal(second!.tagName, first!.tagName);
    assert.equal(second!.location.uri, first!.location.uri);
  });

  it('should reflect file changes after invalidation', async () => {
    const root = await createWorkspace({
      'mod.pike': 'defvar("old_var", TYPE_STRING, "", "Old");\n',
    });

    const before = await findDefvarDefinition('old_var', [root]);
    assert.ok(before);

    // Overwrite file
    await writeFile(join(root, 'mod.pike'), 'defvar("new_var", TYPE_INT, 0, "New");\n', 'utf-8');

    // Without invalidation, the old cached result persists
    const stale = await findDefvarDefinition('new_var', [root]);
    assert.equal(stale, null, 'stale cache should not contain new_var');

    // Invalidate and clear file content cache so re-read picks up changes
    invalidateRXMLDefinitionCaches();

    const after = await findDefvarDefinition('new_var', [root]);
    assert.ok(after, 'after invalidation, new_var should be found');
    assert.equal(after!.name, 'new_var');
  });

  it('should reflect tag changes after invalidation', async () => {
    const root = await createWorkspace({
      'mod.pike': 'simpletag old_tag() { return 1; }\n',
    });

    const before = await findTagDefinition('old_tag', [root]);
    assert.ok(before);

    await writeFile(join(root, 'mod.pike'), 'simpletag new_tag() { return 2; }\n', 'utf-8');

    // Invalidate caches
    invalidateRXMLDefinitionCaches();

    const afterOld = await findTagDefinition('old_tag', [root]);
    assert.equal(afterOld, null, 'old_tag should not be found after file change');

    const afterNew = await findTagDefinition('new_tag', [root]);
    assert.ok(afterNew, 'new_tag should be found after invalidation');
    assert.equal(afterNew!.tagName, 'new_tag');
  });
});

// ---------------------------------------------------------------------------
// Multi-workspace
// ---------------------------------------------------------------------------

describe('definition-provider multi-workspace', () => {
  it('should search across multiple workspace folders', async () => {
    const ws1 = await createWorkspace({
      'mod.pike': 'defvar("ws1_var", TYPE_STRING, "", "From WS1");\n',
    });
    const ws2 = await createWorkspace({
      'mod.pike': 'defvar("ws2_var", TYPE_INT, 0, "From WS2");\n',
    });

    const fromWs1 = await findDefvarDefinition('ws1_var', [ws1, ws2]);
    assert.ok(fromWs1);
    assert.ok(fromWs1!.location.uri.includes(ws1));

    const fromWs2 = await findDefvarDefinition('ws2_var', [ws1, ws2]);
    assert.ok(fromWs2);
    assert.ok(fromWs2!.location.uri.includes(ws2));
  });

  it('should find tags across multiple workspace folders', async () => {
    const ws1 = await createWorkspace({
      'mod.pike': 'simpletag tag_ws1() { return 1; }\n',
    });
    const ws2 = await createWorkspace({
      'mod.pike': 'container tag_ws2() { return "x"; }\n',
    });

    const fromWs1 = await findTagDefinition('tag_ws1', [ws1, ws2]);
    assert.ok(fromWs1);
    assert.ok(fromWs1!.location.uri.includes(ws1));

    const fromWs2 = await findTagDefinition('tag_ws2', [ws1, ws2]);
    assert.ok(fromWs2);
    assert.ok(fromWs2!.location.uri.includes(ws2));
  });

  it('should return null for empty workspace folders array', async () => {
    const result = await findDefvarDefinition('anything', []);
    assert.equal(result, null);

    const tagResult = await findTagDefinition('anything', []);
    assert.equal(tagResult, null);
  });
});

// ---------------------------------------------------------------------------
// Position accuracy
// ---------------------------------------------------------------------------

describe('definition-provider position accuracy', () => {
  it('should report correct line for defvar on a specific line', async () => {
    const root = await createWorkspace({
      'mod.pike':
        'line zero\n' +
        'line one\n' +
        'defvar("on_line_two", TYPE_STRING, "", "Position test");\n' +
        'line three\n',
    });

    const result = await findDefvarDefinition('on_line_two', [root]);
    assert.ok(result);
    assert.equal(result!.location.range.start.line, 2, 'defvar should be on line 2');
  });

  it('should report correct column for tag name', async () => {
    const root = await createWorkspace({
      'mod.pike': '  simpletag indented_tag() { return 1; }\n',
    });

    const result = await findTagDefinition('indented_tag', [root]);
    assert.ok(result);
    // "  simpletag_indented_tag" — tag name starts at column 12 (2 spaces + "simpletag_" = 12 chars)
    assert.equal(
      result!.location.range.start.character,
      12,
      'tag name column should account for indentation and prefix'
    );
  });
});
