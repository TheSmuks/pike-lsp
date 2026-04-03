import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  Connection,
  InlayHint,
  SignatureHelp,
  TextDocuments,
} from 'vscode-languageserver/node.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';
import type { Services } from '../services/index.js';
import { registerSignatureHelpHandler } from '../features/editing/signature-help.js';
import { registerInlayHintsHandler } from '../features/advanced/inlay-hints.js';

function makeMethodSymbol(
  name: string,
  argNames: string[],
  argTypes: unknown[],
  options: { inherited?: boolean } = {}
): PikeSymbol {
  return {
    name,
    kind: 'method',
    modifiers: [],
    argNames,
    argTypes,
    returnType: { kind: 'void' },
    inherited: options.inherited,
  } as unknown as PikeSymbol;
}

function createHarness(
  text: string,
  symbols: PikeSymbol[],
  inlaySettings: { enabled: boolean; parameterNames: boolean; typeHints: boolean } = {
    enabled: true,
    parameterNames: true,
    typeHints: false,
  }
): {
  signatureAt: (offset: number) => Promise<SignatureHelp | null>;
  inlayHints: () => InlayHint[] | null;
  offsetOf: (marker: string) => number;
} {
  const uri = 'file:///scenario-signature-help.pike';
  const document = TextDocument.create(uri, 'pike', 1, text);

  const documents = {
    get(requestedUri: string) {
      return requestedUri === uri ? document : undefined;
    },
  } as unknown as TextDocuments<TextDocument>;

  const services = {
    logger: { debug() {}, info() {}, warn() {}, error() {} },
    documentCache: {
      get(requestedUri: string) {
        if (requestedUri !== uri) {
          return undefined;
        }
        return {
          version: 1,
          symbols,
          diagnostics: [],
          symbolPositions: new Map(),
          symbolNames: new Map(),
        };
      },
    },
    globalSettings: { inlayHints: inlaySettings },
  } as unknown as Services;

  let signatureHandler:
    | ((params: {
        textDocument: { uri: string };
        position: { line: number; character: number };
      }) => Promise<SignatureHelp | null>)
    | null = null;
  let inlayHandler:
    | ((params: {
        textDocument: { uri: string };
        range: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      }) => InlayHint[] | null)
    | null = null;

  const connection = {
    onSignatureHelp(handler: typeof signatureHandler) {
      signatureHandler = handler;
    },
    languages: {
      inlayHint: {
        on(handler: typeof inlayHandler) {
          inlayHandler = handler;
        },
        resolve() {},
      },
    },
  } as unknown as Connection;

  registerSignatureHelpHandler(connection, services, documents);
  registerInlayHintsHandler(connection, services, documents);

  return {
    async signatureAt(offset: number) {
      assert.ok(signatureHandler);
      return signatureHandler({
        textDocument: { uri },
        position: document.positionAt(offset),
      });
    },
    inlayHints() {
      assert.ok(inlayHandler);
      return inlayHandler({
        textDocument: { uri },
        range: {
          start: { line: 0, character: 0 },
          end: document.positionAt(text.length),
        },
      });
    },
    offsetOf(marker: string) {
      const idx = text.indexOf(marker);
      assert.notEqual(idx, -1);
      return idx;
    },
  };
}

describe('Scenario: signature help and inlay hints for complex calls', () => {
  it('shows signature for plain function calls', async () => {
    const harness = createHarness('sum(1, 2)', [
      makeMethodSymbol('sum', ['a', 'b'], ['int', 'int']),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('1'));
    assert.ok(help);
    assert.match(help.signatures[0]?.label ?? '', /sum\(int a, int b\)/);
  });

  it('tracks active parameter for nested outer call', async () => {
    const harness = createHarness('outer(1, inner(2, 3), 4', [
      makeMethodSymbol('outer', ['a', 'b', 'c'], ['int', 'int', 'int']),
      makeMethodSymbol('inner', ['x', 'y'], ['int', 'int']),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('4'));
    assert.ok(help);
    assert.equal(help.activeParameter, 2);
  });

  it('tracks active parameter for nested inner call', async () => {
    const harness = createHarness('outer(inner(1, 2), 3)', [
      makeMethodSymbol('outer', ['a', 'b'], ['int', 'int']),
      makeMethodSymbol('inner', ['x', 'y'], ['int', 'int']),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('2'));
    assert.ok(help);
    assert.match(help.signatures[0]?.label ?? '', /inner\(int x, int y\)/);
    assert.equal(help.activeParameter, 1);
  });

  it('supports member-call signature help', async () => {
    const harness = createHarness('obj->method(1, 2', [
      makeMethodSymbol('method', ['left', 'right'], ['int', 'int']),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('2'));
    assert.ok(help);
    assert.match(help.signatures[0]?.label ?? '', /method\(int left, int right\)/);
    assert.equal(help.activeParameter, 1);
  });

  it('supports inherited methods in signature help', async () => {
    const harness = createHarness('obj->baseMethod(1)', [
      makeMethodSymbol('baseMethod', ['value'], ['int'], { inherited: true }),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('1'));
    assert.ok(help);
    assert.match(help.signatures[0]?.label ?? '', /baseMethod\(int value\)/);
  });

  it('renders varargs parameter as ...args in signature help', async () => {
    const harness = createHarness('fmt("%d", 1, 2)', [
      makeMethodSymbol('fmt', ['pattern', 'args'], ['string', { name: 'varargs', type: 'mixed' }]),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('1, 2'));
    assert.ok(help);
    assert.match(help.signatures[0]?.label ?? '', /mixed \.\.\.args/);
  });

  it('renders optional parameter marker in signature help', async () => {
    const harness = createHarness('setLimit(10)', [
      makeMethodSymbol(
        'setLimit',
        ['limit', 'count'],
        ['int', { name: 'or', types: [{ name: 'int' }, { name: 'void' }] }]
      ),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('10'));
    assert.ok(help);
    assert.match(help.signatures[0]?.label ?? '', /int count\?/);
  });

  it('ignores signature help inside comments', async () => {
    const harness = createHarness('// method(1, 2)', [
      makeMethodSymbol('method', ['a', 'b'], ['int', 'int']),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('2)'));
    assert.equal(help, null);
  });

  it('ignores signature help inside strings', async () => {
    const harness = createHarness('string x = "method(1, 2)";', [
      makeMethodSymbol('method', ['a', 'b'], ['int', 'int']),
    ]);
    const help = await harness.signatureAt(harness.offsetOf('2)'));
    assert.equal(help, null);
  });

  it('provides inlay hints for plain calls', () => {
    const harness = createHarness('sum(1, 2);', [
      makeMethodSymbol('sum', ['left', 'right'], ['int', 'int']),
    ]);
    const hints = harness.inlayHints();
    const labels = (hints ?? []).map(h => String(h.label));
    assert.deepEqual(labels, ['left:', 'right:']);
  });

  it('provides inlay hints for member calls', () => {
    const harness = createHarness('obj->move(10, 20);', [
      makeMethodSymbol('move', ['x', 'y'], ['int', 'int']),
    ]);
    const labels = (harness.inlayHints() ?? []).map(h => String(h.label));
    assert.deepEqual(labels, ['x:', 'y:']);
  });

  it('provides inlay hints for nested calls', () => {
    const harness = createHarness('outer(inner(1, 2), 3);', [
      makeMethodSymbol('outer', ['value', 'count'], ['int', 'int']),
      makeMethodSymbol('inner', ['x', 'y'], ['int', 'int']),
    ]);
    const labels = (harness.inlayHints() ?? []).map(h => String(h.label));
    assert.deepEqual(labels, ['x:', 'y:', 'value:', 'count:']);
  });

  it('uses varargs parameter label for extra arguments in inlay hints', () => {
    const harness = createHarness('fmt("%d", 1, 2, 3);', [
      makeMethodSymbol('fmt', ['pattern', 'args'], ['string', { name: 'varargs', type: 'mixed' }]),
    ]);
    const labels = (harness.inlayHints() ?? []).map(h => String(h.label));
    assert.deepEqual(labels, ['pattern:', '...args:', '...args:', '...args:']);
  });

  it('respects semantic call target between plain and member calls', () => {
    const harness = createHarness('run(1); obj->run(2);', [
      makeMethodSymbol('run', ['memberValue'], ['int'], { inherited: true }),
      makeMethodSymbol('run', ['plainValue'], ['int']),
    ]);
    const labels = (harness.inlayHints() ?? []).map(h => String(h.label));
    assert.deepEqual(labels, ['plainValue:', 'memberValue:']);
  });

  it('does not produce inlay hints for comment call-like text', () => {
    const harness = createHarness('// run(1, 2);', [
      makeMethodSymbol('run', ['a', 'b'], ['int', 'int']),
    ]);
    assert.equal(harness.inlayHints(), null);
  });

  it('does not produce inlay hints for string call-like text', () => {
    const harness = createHarness('string s = "run(1, 2)";', [
      makeMethodSymbol('run', ['a', 'b'], ['int', 'int']),
    ]);
    assert.equal(harness.inlayHints(), null);
  });

  it('returns no inlay hints when parameter names are disabled', () => {
    const harness = createHarness(
      'sum(1, 2);',
      [makeMethodSymbol('sum', ['a', 'b'], ['int', 'int'])],
      {
        enabled: true,
        parameterNames: false,
        typeHints: false,
      }
    );
    assert.equal(harness.inlayHints(), null);
  });
});
