import { afterAll, beforeAll, describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

describe('Query engine invalidation locality', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Invalidation locality tests require Pike.');
    }
    await bridge.start();
  });

  afterAll(async () => {
    await bridge.stop();
  });

  it('keeps unrelated cache entries after local non-transitive invalidation', async () => {
    const files = [
      { filename: '/tmp/qe2-locality-a.pike', code: 'int a = 1;\n' },
      { filename: '/tmp/qe2-locality-b.pike', code: 'int b = 2;\n' },
      { filename: '/tmp/qe2-locality-c.pike', code: 'int c = 3;\n' },
    ];

    for (const file of files) {
      await bridge.analyze(file.code, ['parse', 'diagnostics'], file.filename, 1);
    }

    const before = await bridge.getCacheStats();
    await bridge.invalidateCache('/tmp/qe2-locality-b.pike', false);
    const after = await bridge.getCacheStats();

    assert.equal(typeof before.size, 'number');
    assert.equal(typeof after.size, 'number');
    assert.equal(after.size >= Math.max(0, before.size - 1), true);
  });
});
