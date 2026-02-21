import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Scope-Aware Type Inference', () => {
  let bridge: PikeBridge;

  before(async () => {
    bridge = new PikeBridge();
    await bridge.start();
  });

  after(async () => {
    await bridge.stop();
  });

  it('should resolve global variable type', async () => {
    const code = `string qsa;`;

    const result = await bridge.getTypeAtPosition(code, 'test.pike', 1, 'qsa');

    assert.strictEqual(result.found, 1);
    assert.strictEqual(result.type, 'string');
    assert.strictEqual(result.scopeDepth, 0);
    assert.strictEqual(result.declLine, 1);
  });

  it('should handle local variable shadowing global', async () => {
    const code = `string qsa;

void t() {
  qsa;
  float qsa = 3.22;
  qsa;
}`;

    const globalRef = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'qsa');
    assert.strictEqual(globalRef.found, 1);
    assert.strictEqual(
      globalRef.type,
      'string',
      'Before local declaration, should see global string'
    );
    assert.strictEqual(globalRef.scopeDepth, 0);

    const localRef = await bridge.getTypeAtPosition(code, 'test.pike', 6, 'qsa');
    assert.strictEqual(localRef.found, 1);
    assert.strictEqual(localRef.type, 'float', 'After local declaration, should see local float');
    assert.strictEqual(localRef.scopeDepth, 1);
    assert.strictEqual(localRef.declLine, 5);
  });

  it('should handle different scopes in different functions', async () => {
    const code = `string qsa;

void t() {
  float qsa = 3.22;
  qsa;
}

void r() {
  int qsa = 0;
  qsa;
}`;

    const inT = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'qsa');
    assert.strictEqual(inT.type, 'float', 'In function t(), should see float');
    assert.strictEqual(inT.scopeDepth, 1);

    const inR = await bridge.getTypeAtPosition(code, 'test.pike', 11, 'qsa');
    assert.strictEqual(inR.type, 'int', 'In function r(), should see int');
    assert.strictEqual(inR.scopeDepth, 1);
  });

  it('should handle nested block scopes', async () => {
    const code = `void test() {
  string x = "outer";
  x;
  {
    int x = 42;
    x;
  }
  x;
}`;

    const outerBefore = await bridge.getTypeAtPosition(code, 'test.pike', 3, 'x');
    assert.strictEqual(outerBefore.type, 'string', 'Before inner block, should see string');

    const innerBlock = await bridge.getTypeAtPosition(code, 'test.pike', 6, 'x');
    assert.strictEqual(innerBlock.type, 'int', 'Inside inner block, should see int');
    assert.strictEqual(innerBlock.scopeDepth, 2);

    const outerAfter = await bridge.getTypeAtPosition(code, 'test.pike', 8, 'x');
    assert.strictEqual(outerAfter.type, 'string', 'After inner block, should see string again');
  });

  it('should handle function parameters shadowing globals', async () => {
    const code = `int value = 10;

void process(string value) {
  value;
}`;

    const global = await bridge.getTypeAtPosition(code, 'test.pike', 1, 'value');
    assert.strictEqual(global.type, 'int');
    assert.strictEqual(global.scopeDepth, 0);

    const param = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'value');
    assert.strictEqual(param.type, 'string', 'Function parameter should shadow global');
    assert.strictEqual(param.scopeDepth, 1);
  });

  it('should handle multiple declarations in same scope', async () => {
    const code = `void test() {
  int a = 1;
  int b = 2;
  int c = 3;
  a;
  b;
  c;
}`;

    const typeA = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'a');
    const typeB = await bridge.getTypeAtPosition(code, 'test.pike', 6, 'b');
    const typeC = await bridge.getTypeAtPosition(code, 'test.pike', 7, 'c');

    assert.strictEqual(typeA.type, 'int');
    assert.strictEqual(typeB.type, 'int');
    assert.strictEqual(typeC.type, 'int');
  });

  it('should return not found for undeclared variables', async () => {
    const code = `void test() {
  undeclared_var;
}`;

    const result = await bridge.getTypeAtPosition(code, 'test.pike', 2, 'undeclared_var');

    assert.strictEqual(result.found, 0);
    assert.strictEqual(result.type, undefined);
  });

  it('should handle array and mapping types', async () => {
    const code = `void test() {
  array(int) numbers = ({ 1, 2, 3 });
  mapping(string:int) map = ([]);
  numbers;
  map;
}`;

    const arrayType = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'numbers');
    assert.strictEqual(arrayType.found, 1);
    assert.ok(arrayType.type?.includes('array'), 'Should detect array type');

    const mapType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'map');
    assert.strictEqual(mapType.found, 1);
    assert.ok(mapType.type?.includes('mapping'), 'Should detect mapping type');
  });

  it('should handle mixed type variables', async () => {
    const code = `void test() {
  mixed value = 42;
  value;
}`;

    const result = await bridge.getTypeAtPosition(code, 'test.pike', 3, 'value');

    assert.strictEqual(result.found, 1);
    assert.strictEqual(result.type, 'mixed');
  });

  it('should handle variable declaration on same line as usage', async () => {
    const code = `void test() {
  int x = 5; x;
}`;

    const result = await bridge.getTypeAtPosition(code, 'test.pike', 2, 'x');

    assert.strictEqual(result.found, 1);
    assert.strictEqual(result.type, 'int');
  });

  it('should handle triple nesting with shadowing', async () => {
    const code = `string var = "global";

void outer() {
  int var = 1;
  var;
  {
    float var = 2.5;
    var;
  }
  var;
}`;

    const global = await bridge.getTypeAtPosition(code, 'test.pike', 1, 'var');
    assert.strictEqual(global.type, 'string');
    assert.strictEqual(global.scopeDepth, 0);

    const outerFunc = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'var');
    assert.strictEqual(outerFunc.type, 'int');
    assert.strictEqual(outerFunc.scopeDepth, 1);

    const innerBlock = await bridge.getTypeAtPosition(code, 'test.pike', 8, 'var');
    assert.strictEqual(innerBlock.type, 'float');
    assert.strictEqual(innerBlock.scopeDepth, 2);

    const afterBlock = await bridge.getTypeAtPosition(code, 'test.pike', 10, 'var');
    assert.strictEqual(
      afterBlock.type,
      'int',
      'After inner block ends, should see outer scope again'
    );
    assert.strictEqual(afterBlock.scopeDepth, 1);
  });
});
