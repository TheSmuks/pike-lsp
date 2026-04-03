import { afterAll, beforeAll, describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Scenario: conditional analysis defines', () => {
  let bridgeWithoutDefines: PikeBridge;
  let bridgeWithDefines: PikeBridge;

  beforeAll(async () => {
    bridgeWithoutDefines = new PikeBridge();
    bridgeWithDefines = new PikeBridge({ defines: ['MyDefine'] });

    await bridgeWithoutDefines.start();
    await bridgeWithDefines.start();
  });

  afterAll(async () => {
    await bridgeWithoutDefines.stop();
    await bridgeWithDefines.stop();
  });

  it('activates #if constant(MyDefine) branch when define is provided', async () => {
    const code = `
#if constant(MyDefine)
int activeValue = 42;
#endif
int baseValue = 1;
`;

    const withoutDefines = await bridgeWithoutDefines.analyze(
      code,
      ['introspect'],
      '/tmp/conditional-introspect.pike'
    );
    const withDefines = await bridgeWithDefines.analyze(
      code,
      ['introspect'],
      '/tmp/conditional-introspect.pike'
    );

    const withoutVariableNames = new Set(
      (withoutDefines.result?.introspect?.variables ?? []).map(symbol => symbol.name)
    );
    const withVariableNames = new Set(
      (withDefines.result?.introspect?.variables ?? []).map(symbol => symbol.name)
    );

    assert.equal(withoutVariableNames.has('activeValue'), false);
    assert.equal(withVariableNames.has('activeValue'), true);
  });

  it('reports diagnostics only from active conditional branch', async () => {
    const code = `
#if constant(MyDefine)
int broken = "string";
#endif
int baseValue = 1;
`;

    const withoutDefines = await bridgeWithoutDefines.analyze(
      code,
      ['diagnostics'],
      '/tmp/conditional-diagnostics.pike'
    );
    const withDefines = await bridgeWithDefines.analyze(
      code,
      ['diagnostics'],
      '/tmp/conditional-diagnostics.pike'
    );

    const withoutDiagnostics = withoutDefines.result?.diagnostics?.diagnostics ?? [];
    const withDiagnostics = withDefines.result?.diagnostics?.diagnostics ?? [];

    assert.equal(withoutDiagnostics.length, 0);
    assert.ok(withDiagnostics.length > 0);
  });
});
