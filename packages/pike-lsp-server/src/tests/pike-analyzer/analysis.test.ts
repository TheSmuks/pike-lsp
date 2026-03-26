import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

declare const describe: any;
declare const it: any;
declare const beforeAll: any;
declare const afterAll: any;

let bridge: PikeBridge;

beforeAll(async () => {
  bridge = new PikeBridge();
  await bridge.start();
  bridge.on('stderr', () => {});
});

afterAll(async () => {
  if (bridge) {
    await bridge.stop();
  }
});

async function analyze(code: string, filename: string = 'analysis-test.pike') {
  return bridge.analyzeUninitialized(code, filename);
}

function diagnosticForVariable(
  result: { diagnostics: Array<{ variable?: string; message: string }> },
  name: string
) {
  return result.diagnostics.find(d => d.variable === name);
}

describe('Phase 8 Task 42.1: Analysis - Diagnostics Uninitialized Variables', () => {
  it('42.1.1: should detect simple uninitialized variable read', async () => {
    const result = await analyze(`
void test() {
    string value;
    write(value);
}
`);

    assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
    const diag = diagnosticForVariable(result, 'value');
    assert.ok(diag, 'Should emit diagnostic for uninitialized string variable');
    assert.ok(
      diag!.message.includes('uninitialized') || diag!.message.includes('may not be initialized'),
      'Message should explicitly indicate the variable may not be initialized'
    );
  });

  it('42.1.2: should warn for maybe-assigned variable after single-branch if', async () => {
    const result = await analyze(`
void test(int condition) {
    string maybe;
    if (condition) {
        maybe = "ok";
    }
    write(maybe);
}
`);

    const diag = diagnosticForVariable(result, 'maybe');
    assert.ok(diag, 'Variable assigned only in if branch must still warn');
    assert.ok(
      diag!.message.includes('may be uninitialized'),
      'Diagnostic should be maybe-uninitialized warning'
    );
  });

  it('42.1.3: should treat if/else assignment as definite assignment', async () => {
    const result = await analyze(`
void test(int condition) {
    string assigned;
    if (condition) {
        assigned = "left";
    } else {
        assigned = "right";
    }
    write(assigned);
}
`);

    const diag = diagnosticForVariable(result, 'assigned');
    assert.equal(diag, undefined, 'Variable initialized in both if/else branches must not warn');
  });

  it('42.1.4: should treat switch with default assignment as definite assignment', async () => {
    const result = await analyze(`
void test(int selector) {
    string choice;
    switch (selector) {
        case 1:
            choice = "one";
            break;
        default:
            choice = "other";
            break;
    }
    write(choice);
}
`);

    const diag = diagnosticForVariable(result, 'choice');
    assert.equal(
      diag,
      undefined,
      'Switch with default assigning variable on all branches must not warn'
    );
  });

  it('42.1.5: should warn for switch without default when assignment is not guaranteed', async () => {
    const result = await analyze(`
void test(int selector) {
    string maybeChoice;
    switch (selector) {
        case 1:
            maybeChoice = "one";
            break;
    }
    write(maybeChoice);
}
`);

    const diag = diagnosticForVariable(result, 'maybeChoice');
    assert.ok(diag, 'Switch without default should keep variable maybe-uninitialized');
    assert.ok(
      diag!.message.includes('uninitialized'),
      'Expected uninitialized warning for switch without default'
    );
  });

  it('42.1.6: should not warn for initialized function parameters', async () => {
    const result = await analyze(`
void test(string param) {
    write(param);
}
`);

    const diag = diagnosticForVariable(result, 'param');
    assert.equal(diag, undefined, 'Function parameters are definitely initialized by caller');
  });
});
