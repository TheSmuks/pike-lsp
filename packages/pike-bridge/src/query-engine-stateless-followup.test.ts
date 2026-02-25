import { afterAll, beforeAll, describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

describe('Query engine stateless follow-up and resolve flows', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Stateless follow-up tests require Pike.');
    }
    await bridge.start();
  });

  afterAll(async () => {
    await bridge.stop();
  });

  it('keeps definition/references follow-up requests stable across bridge restart', async () => {
    const uri = 'file:///tmp/qe2-stateless.pike';
    const filename = '/tmp/qe2-stateless.pike';
    const text = 'int root = 1;\nint value = root;\nroot = value + root;\n';
    const position = { line: 1, character: 12 };

    const beforeDefinition = await bridge.engineQuery({
      feature: 'definition',
      requestId: 'qe2-stateless-definition-before',
      snapshot: { mode: 'latest' },
      queryParams: { uri, filename, version: 1, text, position },
    });

    const beforeReferences = await bridge.engineQuery({
      feature: 'references',
      requestId: 'qe2-stateless-references-before',
      snapshot: { mode: 'latest' },
      queryParams: { uri, filename, version: 1, text, position },
    });

    await bridge.stop();
    await bridge.start();

    const afterDefinition = await bridge.engineQuery({
      feature: 'definition',
      requestId: 'qe2-stateless-definition-after',
      snapshot: { mode: 'latest' },
      queryParams: { uri, filename, version: 1, text, position },
    });

    const afterReferences = await bridge.engineQuery({
      feature: 'references',
      requestId: 'qe2-stateless-references-after',
      snapshot: { mode: 'latest' },
      queryParams: { uri, filename, version: 1, text, position },
    });

    const beforeDefCount = Array.isArray(beforeDefinition.result['locations'])
      ? beforeDefinition.result['locations'].length
      : 0;
    const afterDefCount = Array.isArray(afterDefinition.result['locations'])
      ? afterDefinition.result['locations'].length
      : 0;

    const beforeRefCount = Array.isArray(beforeReferences.result['locations'])
      ? beforeReferences.result['locations'].length
      : 0;
    const afterRefCount = Array.isArray(afterReferences.result['locations'])
      ? afterReferences.result['locations'].length
      : 0;

    assert.equal(afterDefCount, beforeDefCount);
    assert.equal(afterRefCount, beforeRefCount);
  });

  it('keeps resolve-import responses valid after restart', async () => {
    const before = await bridge.resolveImport('import', 'Stdio');

    await bridge.stop();
    await bridge.start();

    const after = await bridge.resolveImport('import', 'Stdio');

    assert.equal(typeof before.exists, 'number');
    assert.equal(typeof after.exists, 'number');
    assert.equal(after.exists, before.exists);
  });
});
