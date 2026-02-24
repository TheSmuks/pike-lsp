import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('Scope-Aware Type Inference', () => {
  let bridge: PikeBridge;

  beforeAll(async () => { bridge = new PikeBridge();
  await bridge.start(); });

  afterAll(async () => { await bridge.stop(); });

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

  // ========== EDGE CASES ==========

  it('should handle class member variables', async () => {
    const code = `class MyClass {
  string name;
  int value;

  void create() {
    name;
    value;
  }
}`;

    const nameType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'name');
    assert.strictEqual(nameType.found, 1);
    assert.strictEqual(nameType.type, 'string');

    const valueType = await bridge.getTypeAtPosition(code, 'test.pike', 6, 'value');
    assert.strictEqual(valueType.found, 1);
    assert.strictEqual(valueType.type, 'int');
  });

  it('should handle class inheritance with variable shadowing', async () => {
    const code = `class Parent {
  int value = 1;
}

class Child {
  float value = 2.5;

  void check() {
    value;
  }
}`;

    // In Child::check(), value should be float (child's version)
    const childValue = await bridge.getTypeAtPosition(code, 'test.pike', 10, 'value');
    assert.strictEqual(childValue.found, 1);
    assert.strictEqual(childValue.type, 'float');
  });

  it('should handle foreach loop variables', async () => {
    const code = `void test() {
  array(int) nums = ({ 1, 2, 3 });
  foreach (nums, int num) {
    num;
  }
}`;

    const loopVar = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'num');
    assert.strictEqual(loopVar.found, 1);
    assert.strictEqual(loopVar.type, 'int');
  });

  it('should handle for loop variables', async () => {
    const code = `void test() {
  for (int i = 0; i < 10; i++) {
    i;
  }
}`;

    const loopVar = await bridge.getTypeAtPosition(code, 'test.pike', 3, 'i');
    assert.strictEqual(loopVar.found, 1);
    assert.strictEqual(loopVar.type, 'int');
  });

  // See issue #601: extends ScopeResolver to support constants, enums, inheritance
  it.skip('should handle constants', async () => {
    const code = `constant MAX = 100;
constant NAME = "test";

void test() {
  MAX;
  NAME;
}`;

    const maxType = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'MAX');
    assert.strictEqual(maxType.found, 1);
    assert.strictEqual(maxType.type, 'int');

    const nameType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'NAME');
    assert.strictEqual(nameType.found, 1);
    assert.strictEqual(nameType.type, 'string');
  });

  it('should handle static variables', async () => {
    const code = `class Counter {
  static int count = 0;

  void increment() {
    count;
  }
}`;

    const countType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'count');
    assert.strictEqual(countType.found, 1);
    assert.strictEqual(countType.type, 'int');
  });

  // See issue #601: extends ScopeResolver to support constants, enums, inheritance
  it.skip('should handle multi-level inheritance', async () => {
    const code = `class A {
  int x = 1;
}

class B {
  float x = 2.0;
}

class C {
  string x = "three";
}

class D {
  inherit A;
  inherit B;
  inherit C;

  void check() {
    x;
  }
}`;

    // The last inherited class (C) should shadow earlier ones
    const xType = await bridge.getTypeAtPosition(code, 'test.pike', 19, 'x');
    assert.strictEqual(xType.found, 1);
    assert.strictEqual(xType.type, 'string');
  });

  it('should handle function pointers and programs', async () => {
    const code = `void test() {
  function f = lambda() { return 1; };
  program p = class { };
  f;
  p;
}`;

    const funcType = await bridge.getTypeAtPosition(code, 'test.pike', 3, 'f');
    assert.strictEqual(funcType.found, 1);
    assert.ok(funcType.type?.includes('function'), 'Should detect function type');

    const progType = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'p');
    assert.strictEqual(progType.found, 1);
    assert.ok(progType.type?.includes('program'), 'Should detect program type');
  });

  it('should handle lambda closures capturing variables', async () => {
    const code = `void test() {
  int outer = 42;
  lambda void() {
    outer;
  };
}`;

    const outerType = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'outer');
    assert.strictEqual(outerType.found, 1);
    assert.strictEqual(outerType.type, 'int');
  });

  it('should handle sscanf pattern variables', async () => {
    const code = `void test() {
  string input = "123";
  int result;
  sscanf(input, "%d", result);
  result;
}`;

    const resultType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'result');
    assert.strictEqual(resultType.found, 1);
    assert.strictEqual(resultType.type, 'int');
  });

  it('should handle mixed scope with multiple variables', async () => {
    const code = `int a = 1;
string b = "hi";
float c = 1.5;

void func1() {
  int a = 2;
  b;
  c;
}`;

    const aInFunc = await bridge.getTypeAtPosition(code, 'test.pike', 7, 'a');
    assert.strictEqual(aInFunc.type, 'int');
    assert.strictEqual(aInFunc.scopeDepth, 1);

    const bInFunc = await bridge.getTypeAtPosition(code, 'test.pike', 8, 'b');
    assert.strictEqual(bInFunc.type, 'string');
    assert.strictEqual(bInFunc.scopeDepth, 0);

    const cInFunc = await bridge.getTypeAtPosition(code, 'test.pike', 9, 'c');
    assert.strictEqual(cInFunc.type, 'float');
    assert.strictEqual(cInFunc.scopeDepth, 0);
  });

  it('should handle while loop variables', async () => {
    const code = `void test() {
  int i = 0;
  while (i < 10) {
    i++;
  }
  i;
}`;

    const iInLoop = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'i');
    assert.strictEqual(iInLoop.found, 1);
    assert.strictEqual(iInLoop.type, 'int');

    const iAfterLoop = await bridge.getTypeAtPosition(code, 'test.pike', 6, 'i');
    assert.strictEqual(iAfterLoop.found, 1);
    assert.strictEqual(iAfterLoop.type, 'int');
  });

  // See issue #601 doesn't yet handle 'enum' keyword
  it.skip('should handle enum values', async () => {
    const code = `enum Color {
  RED = 1,
  GREEN = 2,
  BLUE = 3
}

void test() {
  Color c = RED;
  c;
}`;

    const cType = await bridge.getTypeAtPosition(code, 'test.pike', 8, 'c');
    assert.strictEqual(cType.found, 1);
    assert.strictEqual(cType.type, 'int');
  });

  // See issue #601 doesn't yet handle implicit typing (variables without explicit type)
  it.skip('should handle implicit mixed type (no explicit type)', async () => {
    const code = `void test() {
  x = 5;
  x = "string";
  x;
}`;

    const xType = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'x');
    assert.strictEqual(xType.found, 1);
    // Without explicit type, should detect as mixed or inferred type
    assert.ok(xType.type === 'mixed' || xType.type === 'unknown' || xType.type === 'auto');
  });

  it('should handle catch block variables', async () => {
    const code = `void test() {
  mixed err = catch {
    int x = 5;
    x;
  };
  err;
}`;

    const errType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'err');
    assert.strictEqual(errType.found, 1);
    assert.ok(errType.type === 'mixed' || errType.type === 'int' || errType.type === 'zero');
  });

  it('should handle complex generic types', async () => {
    const code = `void test() {
  array(mapping(string:int)) complex = ({ ([]) });
  complex;
}`;

    const complexType = await bridge.getTypeAtPosition(code, 'test.pike', 3, 'complex');
    assert.strictEqual(complexType.found, 1);
    assert.ok(complexType.type?.includes('array'), 'Should detect array');
    assert.ok(complexType.type?.includes('mapping'), 'Should detect nested mapping');
  });

  it('should handle constructor parameters', async () => {
    const code = `class MyClass {
  int value;

  void create(int value) {
    this->value = value;
    value;
  }
}`;

    const paramValue = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'value');
    assert.strictEqual(paramValue.found, 1);
    assert.strictEqual(paramValue.type, 'int');
    // Constructor creates an additional scope, so depth is 2 (class + function)
    assert.ok(paramValue.scopeDepth === 1 || paramValue.scopeDepth === 2);
  });

  it('should handle private class variables with this->', async () => {
    const code = `class Counter {
  private int count = 0;

  void increment() {
    this->count;
  }
}`;

    const countType = await bridge.getTypeAtPosition(code, 'test.pike', 4, 'count');
    assert.strictEqual(countType.found, 1);
    assert.strictEqual(countType.type, 'int');
  });

  it('should return correct type for global constant vs local variable', async () => {
    const code = `constant MAX_SIZE = 100;

void test() {
  int MAX_SIZE = 50;
  MAX_SIZE;
}`;

    // Local should shadow global
    const localType = await bridge.getTypeAtPosition(code, 'test.pike', 5, 'MAX_SIZE');
    assert.strictEqual(localType.found, 1);
    assert.strictEqual(localType.type, 'int');
    assert.strictEqual(localType.scopeDepth, 1);
  });
});
