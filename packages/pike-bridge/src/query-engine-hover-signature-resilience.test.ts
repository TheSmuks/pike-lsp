import { afterAll, beforeAll, describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

describe('Query engine parse-under-edit resilience (hover, signature-help)', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Parse-under-edit tests require Pike.');
    }
    await bridge.start();
  });

  afterAll(async () => {
    await bridge.stop();
  });

  it('keeps hover query path alive for broken intermediate edits', async () => {
    const uri = 'file:///tmp/qe2-hover-edit.pike';
    const filename = '/tmp/qe2-hover-edit.pike';
    const texts = [
      'int stable = 1;\n',
      'int stable = ;\n',
      'class C {\n  int x\n',
      'class C {\n  int x = 1;\n  void run() {\n    if (x\n  }\n}\n',
      'int repaired = 2;\n',
    ];

    const opened = await bridge.engineOpenDocument({
      uri,
      languageId: 'pike',
      version: 1,
      text: texts[0] ?? '',
    });
    assert.ok(typeof opened.snapshotId === 'string' && opened.snapshotId.length > 0);

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? '';
      const version = i + 2;

      const changed = await bridge.engineChangeDocument({
        uri,
        version,
        changes: [{ text }],
      });

      assert.ok(typeof changed.snapshotId === 'string' && changed.snapshotId.length > 0);

      // Hover query should never hard-fail, even on malformed text
      const hoverResult = await bridge.engineQuery({
        feature: 'hover',
        requestId: `qe2-hover-edit-${version}`,
        snapshot: { mode: 'latest' },
        queryParams: {
          uri,
          filename,
          version,
          text,
          position: { line: 0, character: 1 },
          word: 'stable',
        },
      });

      assert.ok(
        typeof hoverResult.snapshotIdUsed === 'string' && hoverResult.snapshotIdUsed.length > 0
      );
      assert.ok(typeof hoverResult.metrics?.durationMs === 'number');

      // The result must be a structured response (not a thrown error).
      // It may contain a hover object or be empty — both are valid for broken text.
      const rawResult = hoverResult.result;
      assert.ok(typeof rawResult === 'object' && rawResult !== null);
    }
  });

  it('keeps signature-help query path alive for broken intermediate edits', async () => {
    const uri = 'file:///tmp/qe2-sigedit.pike';
    const filename = '/tmp/qe2-sigedit.pike';
    const texts = [
      'int x = abs(1);\n',
      'int x = abs(\n',
      'int x = abs(,\n',
      'class C {\n  void run() {\n    write(\n  }\n}\n',
      'int repaired = abs(42);\n',
    ];

    const opened = await bridge.engineOpenDocument({
      uri,
      languageId: 'pike',
      version: 1,
      text: texts[0] ?? '',
    });
    assert.ok(typeof opened.snapshotId === 'string' && opened.snapshotId.length > 0);

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i] ?? '';
      const version = i + 2;

      const changed = await bridge.engineChangeDocument({
        uri,
        version,
        changes: [{ text }],
      });

      assert.ok(typeof changed.snapshotId === 'string' && changed.snapshotId.length > 0);

      // Signature-help query should never hard-fail, even on malformed text
      const sigResult = await bridge.engineQuery({
        feature: 'signatureHelp',
        requestId: `qe2-sigedit-${version}`,
        snapshot: { mode: 'latest' },
        queryParams: {
          uri,
          filename,
          version,
          text,
          position: { line: 0, character: text.indexOf('(') + 1 || 1 },
          offset: text.indexOf('(') + 1 || 1,
        },
      });

      assert.ok(
        typeof sigResult.snapshotIdUsed === 'string' && sigResult.snapshotIdUsed.length > 0
      );
      assert.ok(typeof sigResult.metrics?.durationMs === 'number');

      // The result must be a structured response (not a thrown error).
      const rawResult = sigResult.result;
      assert.ok(typeof rawResult === 'object' && rawResult !== null);
    }
  });
});
