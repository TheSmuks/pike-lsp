import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DocumentCache } from '../../services/document-cache.js';
import { createMockDocuments, makeCachedEntry } from '../../tests/helpers/test-helpers.js';
import { stressRunner } from '../stress-runner.js';

describe('Stress: document lifecycle', () => {
  it('handles 1000 rapid open/change/close cycles', async () => {
    const uri = 'file:///stress-lifecycle.pike';
    const cache = new DocumentCache();
    let version = 0;
    const eventCounts = { open: 0, change: 0, close: 0 };

    const documents = createMockDocuments({
      onEvent: event => {
        if (event.type === 'open') eventCounts.open += 1;
        if (event.type === 'change') eventCounts.change += 1;
        if (event.type === 'close') eventCounts.close += 1;
      },
    });

    const result = await stressRunner.run(
      'document-lifecycle',
      1000,
      async (seed, iteration) => {
        version += 1;
        const openedText = `int value = ${seed + iteration};\n`;
        const openedDoc = TextDocument.create(uri, 'pike', version, openedText);
        documents.emitOpen(openedDoc);
        cache.set(uri, makeCachedEntry(openedText));

        version += 1;
        const changedText = `int value = ${seed + iteration + 1};\n`;
        const changedDoc = TextDocument.create(uri, 'pike', version, changedText);
        documents.emitChange(changedDoc);
        cache.set(uri, makeCachedEntry(changedText));

        documents.emitClose(changedDoc);
        cache.delete(uri);
      },
      {
        delayMs: { min: 10, max: 10 },
        timeoutMs: 5_000,
        concurrency: 1,
      }
    );

    assert.strictEqual(result.failures, 0);
    assert.strictEqual(result.completed, 1000);
    assert.strictEqual(eventCounts.open, 1000);
    assert.strictEqual(eventCounts.change, 1000);
    assert.strictEqual(eventCounts.close, 1000);
    assert.strictEqual(cache.get(uri), undefined);
    assert(result.durationMs < 60_000);
  }, 60_000);
});
