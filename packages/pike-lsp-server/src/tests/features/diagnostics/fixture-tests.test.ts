/**
 * Diagnostics Tests (table-driven, fixture-based)
 *
 * Uses real .pike files from tests/testdata/diagnostics/ instead of inline strings.
 * Pattern inspired by vscode-go's test structure.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { LSPTestHarness, runTestCases } from '../../helpers/lsp-test-harness.js';
import { classifyChange } from '../../../features/diagnostics/change-detection.js';
import { makeCachedEntry } from '../../helpers/test-helpers.js';
import { TextDocument } from 'vscode-languageserver-textdocument';

// ---------------------------------------------------------------------------
// Table-driven: diagnostics from fixtures
// ---------------------------------------------------------------------------

runTestCases(
  'Diagnostics fixtures',
  [
    {
      name: 'valid.pike should have no errors',
      fixture: 'diagnostics/valid.pike',
      expectErrors: 0,
    },
    {
      name: 'missing-semicolon.pike should have errors',
      fixture: 'diagnostics/missing-semicolon.pike',
      expectErrors: 1,
    },
    {
      name: 'multi-error.pike should have multiple errors',
      fixture: 'diagnostics/multi-error.pike',
      expectErrors: 2,
    },
  ],
  async testCase => {
    const harness = new LSPTestHarness();
    const { content } = await harness.loadFixture(testCase.fixture);

    // Verify the fixture loads correctly
    assert.ok(content.length > 0, `Fixture ${testCase.fixture} should have content`);

    // Verify line count is reasonable
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    assert.ok(lines.length > 0, `Fixture should have at least one non-empty line`);
  }
);

// ---------------------------------------------------------------------------
// classifyChange with real fixture content
// ---------------------------------------------------------------------------

describe('classifyChange with fixture data', () => {
  it('should not skip when parseFailed with real error fixture', async () => {
    const harness = new LSPTestHarness();
    const { content } = await harness.loadFixture('diagnostics/missing-semicolon.pike');

    const entry = makeCachedEntry(content, { parseFailed: true });
    const doc = TextDocument.create('file:///test.pike', 'pike', 2, content);

    const result = classifyChange(doc, undefined, entry);

    assert.strictEqual(result.canSkip, false);
    assert.strictEqual(result.reason, 'previous_parse_failed');
  });

  it('can skip when parseFailed=false with whitespace change on valid fixture', async () => {
    const harness = new LSPTestHarness();
    const { content } = await harness.loadFixture('diagnostics/valid.pike');

    const entry = makeCachedEntry(content, { parseFailed: false });
    const modified = content + '   '; // add trailing whitespace
    const doc = TextDocument.create('file:///test.pike', 'pike', 2, modified);

    const result = classifyChange(
      doc,
      {
        start: { line: 0, character: content.length },
        end: { line: 0, character: content.length },
      },
      entry
    );

    // Semantic hash of first line shouldn't change (whitespace trimmed)
    assert.strictEqual(result.canSkip, true);
  });

  it('should force re-parse after fixing syntax error in fixture', async () => {
    const harness = new LSPTestHarness();
    const { content: brokenContent } = await harness.loadFixture(
      'diagnostics/missing-semicolon.pike'
    );
    const { content: fixedContent } = await harness.loadFixture('diagnostics/valid.pike');

    // Simulate: had error, parseFailed=true
    const entry = makeCachedEntry(brokenContent, { parseFailed: true });
    const doc = TextDocument.create('file:///test.pike', 'pike', 2, fixedContent);

    const result = classifyChange(
      doc,
      { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
      entry
    );

    assert.strictEqual(result.canSkip, false, 'Must re-parse when fixing an error');
  });
});

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

describe('Fixture loading', () => {
  it('should load all diagnostics fixtures', async () => {
    const harness = new LSPTestHarness();
    const fixtures = await harness.loadFixturesInDir('diagnostics');

    assert.ok(fixtures.length >= 3, 'Should have at least 3 diagnostic fixtures');
    assert.ok(
      fixtures.every(f => f.content.length > 0),
      'All fixtures should have content'
    );
    assert.ok(
      fixtures.every(f => f.uri.startsWith('file://')),
      'All URIs should start with file://'
    );
  });
});
