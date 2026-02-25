import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

describe('Query engine parse-under-edit resilience', () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Parse-under-edit tests require Pike.');
    }
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
  });

  it('keeps diagnostics/completion query path alive for broken intermediate edits', async () => {
    const uri = 'file:///tmp/qe2-parse-edit.pike';
    const filename = '/tmp/qe2-parse-edit.pike';
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

      const diagnostics = await bridge.engineQuery({
        feature: 'diagnostics',
        requestId: `qe2-parse-edit-diagnostics-${version}`,
        snapshot: { mode: 'latest' },
        queryParams: {
          uri,
          filename,
          version,
          text,
        },
      });

      assert.ok(
        typeof diagnostics.snapshotIdUsed === 'string' && diagnostics.snapshotIdUsed.length > 0
      );
      assert.ok(typeof diagnostics.metrics?.durationMs === 'number');

      const completion = await bridge.engineQuery({
        feature: 'completion',
        requestId: `qe2-parse-edit-completion-${version}`,
        snapshot: { mode: 'latest' },
        queryParams: {
          uri,
          filename,
          version,
          text,
          position: { line: 0, character: 1 },
        },
      });

      assert.ok(
        typeof completion.snapshotIdUsed === 'string' && completion.snapshotIdUsed.length > 0
      );
      assert.ok(typeof completion.metrics?.durationMs === 'number');
    }
  });
});
