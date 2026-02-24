/**
 * Pike Bridge Tests
 *
 * Tests the core IPC communication with Pike subprocess
 */

// @ts-ignore - Bun test types
import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';

describe('PikeBridge', () => {
  let bridge: PikeBridge;

  beforeAll(async () => {
    bridge = new PikeBridge();
    const available = await bridge.checkPike();
    if (!available) {
      throw new Error('Pike executable not found. Tests require Pike to be installed.');
    }
    await bridge.start();

    // Wait for the process to be fully ready
    // The start() method has a 100ms internal delay, but we add
    // extra margin to ensure the subprocess is ready for requests
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterAll(async () => {
    if (bridge) {
      await bridge.stop();
    }
  });

  it('should start and be running', async () => {
    // The before hook waits 200ms after start(), so the process should be ready
    assert.equal(bridge.isRunning(), true, 'Bridge should be running after start()');
  });

  it('should check Pike availability', async () => {
    const available = await bridge.checkPike();
    assert.equal(available, true, 'Pike should be available');
  });

  it('should get Pike version', async () => {
    const version = await bridge.getVersion();
    assert.ok(version, 'Should return a version string');
    assert.match(version!, /\d+\.\d+/, 'Version should match pattern X.Y');
  });

  it('should expose query-engine protocol info', async () => {
    const info = await bridge.getProtocolInfo();

    assert.ok(info, 'Should return protocol information');
    assert.equal(info?.protocol, 'query-engine-v2');
    assert.equal(info?.major, 2);
  });

  it('should advance revision for query-engine mutations', async () => {
    const openAck = await bridge.engineOpenDocument({
      uri: 'file:///tmp/qe2-test.pike',
      languageId: 'pike',
      version: 1,
      text: 'int x = 1;\n',
    });

    const changeAck = await bridge.engineChangeDocument({
      uri: 'file:///tmp/qe2-test.pike',
      version: 2,
      changes: [{ text: 'int x = 2;\n' }],
    });

    const closeAck = await bridge.engineCloseDocument({
      uri: 'file:///tmp/qe2-test.pike',
    });

    assert.ok(changeAck.revision > openAck.revision, 'Revision should increase after change');
    assert.ok(closeAck.revision > changeAck.revision, 'Revision should increase after close');
    assert.ok(openAck.snapshotId.startsWith('snp-'));
    assert.ok(changeAck.snapshotId.startsWith('snp-'));
    assert.ok(closeAck.snapshotId.startsWith('snp-'));
  });

  it('should accept query-engine cancel requests', async () => {
    const requestId = 'qe2-cancel-test';

    const cancelAck = await bridge.engineCancelRequest({ requestId });
    assert.equal(Boolean(cancelAck.accepted), true, 'Cancel request should be accepted');
  });

  it('should return analyzeResult for diagnostics engine queries', async () => {
    const response = await bridge.engineQuery({
      feature: 'diagnostics',
      requestId: 'qe2-diagnostics-query',
      snapshot: { mode: 'latest' },
      queryParams: {
        uri: 'file:///tmp/qe2-diagnostics.pike',
        filename: '/tmp/qe2-diagnostics.pike',
        version: 1,
        text: 'int x = 1;\n',
      },
    });

    const analyzeResult = response.result['analyzeResult'] as Record<string, unknown> | undefined;
    assert.ok(analyzeResult, 'engine_query diagnostics should include analyzeResult');
    assert.equal(
      typeof response.result['revision'],
      'number',
      'engine_query diagnostics should include revision'
    );

    const innerResult = analyzeResult?.['result'] as Record<string, unknown> | undefined;
    assert.ok(innerResult, 'analyzeResult should contain result object');
    assert.ok(
      innerResult?.['diagnostics'],
      'analyzeResult.result should include diagnostics payload'
    );

    const metrics = response.metrics as Record<string, unknown> | undefined;
    assert.ok(metrics, 'engine_query diagnostics should include metrics');
    assert.equal(
      typeof metrics?.['durationMs'],
      'number',
      'engine_query metrics should include durationMs'
    );
  });

  it('should parse simple Pike code', async () => {
    const code = `
            int x = 42;
            string hello() {
                return "world";
            }
            class MyClass {
                int value;
            }
        `;

    const result = await bridge.parse(code, 'test.pike');

    assert.ok(result.symbols, 'Should return symbols');
    assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');
    assert.ok(result.symbols.length > 0, 'Should find at least one symbol');

    const varSymbol = result.symbols.find(s => s.name === 'x');
    assert.ok(varSymbol, 'Should find variable "x"');
    assert.equal(varSymbol?.kind, 'variable');

    const funcSymbol = result.symbols.find(s => s.name === 'hello');
    assert.ok(funcSymbol, 'Should find function "hello"');
    assert.equal(funcSymbol?.kind, 'method');

    const classSymbol = result.symbols.find(s => s.name === 'MyClass');
    assert.ok(classSymbol, 'Should find class "MyClass"');
    assert.equal(classSymbol?.kind, 'class');
  });

  it('should parse nested classes with children', async () => {
    // P1 Nested Classes - Test for nested class member extraction
    // This test FAILS because nested class members are not currently extracted
    const code = `
            class Outer {
                class Inner {
                    int x;
                    void foo() {}
                }
            }
        `;

    const result = await bridge.parse(code, 'test.pike');

    assert.ok(result.symbols, 'Should return symbols');
    assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');

    // Find Outer class
    const outer = result.symbols.find(s => s.name === 'Outer');
    assert.ok(outer, 'Should find Outer class');
    assert.equal(outer?.kind, 'class');

    // Assert Outer has children array
    assert.ok(outer?.children, 'Outer should have children array');
    assert.ok(Array.isArray(outer.children), 'children should be an array');

    // Find Inner class in Outer's children
    const inner = outer!.children!.find((s: any) => s.name === 'Inner');
    assert.ok(inner, 'Should find Inner class as child of Outer');
    assert.equal(inner?.kind, 'class');

    // Assert Inner has children array with members
    assert.ok(inner?.children, 'Inner should have children array');
    assert.ok(Array.isArray(inner.children), 'Inner.children should be an array');

    // Assert that Inner.x and Inner.foo appear as children of Inner
    const innerX = inner!.children!.find((s: any) => s.name === 'x');
    assert.ok(innerX, 'Should find x as child of Inner');
    assert.equal(innerX?.kind, 'variable');

    const innerFoo = inner!.children!.find((s: any) => s.name === 'foo');
    assert.ok(innerFoo, 'Should find foo as child of Inner');
    assert.equal(innerFoo?.kind, 'method');
  });

  it('should parse 3-level nested class hierarchy', async () => {
    // P1 Nested Classes - Test for deep nesting
    // This test FAILS because deeply nested members are not extracted
    const code = `
            class A {
                class B {
                    class C {
                        int deep;
                    }
                }
            }
        `;

    const result = await bridge.parse(code, 'test.pike');

    assert.ok(result.symbols, 'Should return symbols');
    assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');

    // Find A class
    const a = result.symbols.find((s: any) => s.name === 'A');
    assert.ok(a, 'Should find class A');
    assert.equal(a?.kind, 'class');
    assert.ok(a?.children, 'A should have children array');

    // Find B class in A's children
    const b = a!.children!.find((s: any) => s.name === 'B');
    assert.ok(b, 'Should find B as child of A');
    assert.equal(b?.kind, 'class');
    assert.ok(b?.children, 'B should have children array');

    // Find C class in B's children
    const c = b!.children!.find((s: any) => s.name === 'C');
    assert.ok(c, 'Should find C as child of B');
    assert.equal(c?.kind, 'class');
    assert.ok(c?.children, 'C should have children array');

    // Assert all levels are represented in the symbol hierarchy
    const deep = c!.children!.find((s: any) => s.name === 'deep');
    assert.ok(deep, 'Should find deep as child of C');
    assert.equal(deep?.kind, 'variable');
  });

  it('should detect syntax errors', async () => {
    const code = `
            int x = ;  // Syntax error
        `;

    const result = await bridge.compile(code, 'test.pike');

    assert.ok(result.diagnostics, 'Should return diagnostics');
    assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
    assert.ok(result.diagnostics.length > 0, 'Should find at least one error');
  });

  it('should parse code with splat operator (@)', async () => {
    // Test splat/spread operator in function calls
    const code = `
void foo(int a, int b, int c) {}
array(int) args = ({1, 2, 3});
foo(@args);
`;

    const result = await bridge.parse(code, 'test.pike');

    assert.ok(result.symbols, 'Should return symbols');
    assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');

    // Check function foo was parsed
    const fooSymbol = result.symbols.find(s => s.name === 'foo');
    assert.ok(fooSymbol, 'Should find foo function');
    assert.equal(fooSymbol.kind, 'method', 'foo should be a method');

    // Check args variable was parsed
    const argsSymbol = result.symbols.find(s => s.name === 'args');
    assert.ok(argsSymbol, 'Should find args variable');

    // Should not have errors related to splat operator
    const splatErrors = result.diagnostics.filter(
      d => d.severity === 'error' && d.message.includes('sprintf: Wrong type')
    );
    assert.equal(splatErrors.length, 0, 'Should not have splat-related errors');
  });

  it('should tokenize Pike code', async () => {
    const code = `int x = 42;`;

    const tokens = await bridge.tokenize(code);

    assert.ok(Array.isArray(tokens), 'Should return an array of tokens');
    assert.ok(tokens.length > 0, 'Should find at least one token');
  });

  it('should resolve stdlib modules', async () => {
    const result = await bridge.resolveStdlib('Regexp');

    assert.ok(result, 'Should return a result');
    assert.equal(result.found, 1, 'Should find Regexp module (1 = found)');
    assert.ok(result.symbols, 'Should have symbols');
    assert.ok(Array.isArray(result.symbols), 'Symbols should be an array');
  });

  it('should handle non-existent stdlib modules', async () => {
    const result = await bridge.resolveStdlib('NonExistentModule12345');

    assert.ok(result, 'Should return a result');
    assert.equal(result.found, 0, 'Should not find non-existent module (0 = not found)');
  });

  it('should deduplicate concurrent identical requests', async () => {
    const code = `int x = 42;`;

    // Send 3 identical requests concurrently
    const [result1, result2, result3] = await Promise.all([
      bridge.parse(code, 'test.pike'),
      bridge.parse(code, 'test.pike'),
      bridge.parse(code, 'test.pike'),
    ]);

    // All should return the same results
    assert.deepEqual(result1, result2, 'Results should be identical');
    assert.deepEqual(result2, result3, 'Results should be identical');
  });

  it('should resolve local modules with currentFile context', async () => {
    const modulePath = '.SHA256';
    const currentFile = '/tmp/project/RSA.pmod';

    // This will fail if the file doesn't exist, but tests the API
    const result = await bridge.resolveModule(modulePath, currentFile);

    // Result could be null if file doesn't exist, but should not throw
    assert.ok(
      result === null || typeof result === 'string',
      'Result should be null or a string path'
    );
  });

  // Uninitialized variable detection tests
  describe('analyzeUninitialized', () => {
    it('should detect uninitialized string variable', async () => {
      const code = `
void test() {
    string s;
    write(s);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      assert.ok(result.diagnostics, 'Should return diagnostics');
      assert.ok(Array.isArray(result.diagnostics), 'Diagnostics should be an array');
      assert.ok(result.diagnostics.length > 0, 'Should find uninitialized variable warning');

      const diag = result.diagnostics.find(d => d.variable === 's');
      assert.ok(diag, 'Should find diagnostic for variable "s"');
      assert.ok(diag.message.includes('initialized'), 'Message should mention initialization');
    });

    it('should not warn for initialized variables', async () => {
      const code = `
void test() {
    string s = "hello";
    write(s);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      const diag = result.diagnostics.find(d => d.variable === 's');
      assert.ok(!diag, 'Should not warn for initialized variable');
    });

    it('should not warn for int variables (auto-initialized to 0)', async () => {
      const code = `
void test() {
    int x;
    write(x);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      const diag = result.diagnostics.find(d => d.variable === 'x');
      assert.ok(!diag, 'Should not warn for int (auto-initialized to 0)');
    });

    it('should not warn for float variables (auto-initialized to 0.0)', async () => {
      const code = `
void test() {
    float f;
    write(f);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      const diag = result.diagnostics.find(d => d.variable === 'f');
      assert.ok(!diag, 'Should not warn for float (auto-initialized to 0.0)');
    });

    it('should detect uninitialized mapping', async () => {
      const code = `
void test() {
    mapping m;
    m["key"] = "value";
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      assert.ok(result.diagnostics.length > 0, 'Should find uninitialized mapping warning');
    });

    it('should detect uninitialized array', async () => {
      const code = `
void test() {
    array a;
    a[0] = 1;
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      assert.ok(result.diagnostics.length > 0, 'Should find uninitialized array warning');
    });

    it('should not warn for function parameters', async () => {
      const code = `
void test(string s) {
    write(s);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      const diag = result.diagnostics.find(d => d.variable === 's');
      assert.ok(!diag, 'Should not warn for function parameters');
    });

    it('should not warn for lambda parameters', async () => {
      const code = `
void test() {
    Array.sort_array(({}), lambda(string a, string b) {
        return sizeof(a) > sizeof(b);
    });
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      const diagA = result.diagnostics.find(d => d.variable === 'a');
      const diagB = result.diagnostics.find(d => d.variable === 'b');
      assert.ok(!diagA && !diagB, 'Should not warn for lambda parameters');
    });

    it('should detect conditional initialization (maybe_init)', async () => {
      // Branch-aware control flow analysis with merge logic is implemented in Pike
      // The merge_branch_states function in LSP.pmod/Analysis.pmod/module.pmod handles this
      const code = `
void test(int condition) {
    string s;
    if (condition) {
        s = "hello";
    }
    write(s);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      // Should warn because s is only initialized in one branch
      assert.ok(
        result.diagnostics.length > 0,
        'Should warn for conditionally initialized variable'
      );
      const sDiag = result.diagnostics.find(d => d.variable === 's');
      assert.ok(sDiag, 'Should have diagnostic for variable s');
      assert.ok(
        sDiag.message.includes('may be uninitialized'),
        'Should indicate variable may be uninitialized'
      );
    });

    it('should not warn when initialized in all branches', async () => {
      const code = `
void test(int condition) {
    string s;
    if (condition) {
        s = "hello";
    } else {
        s = "world";
    }
    write(s);
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      // Should not warn because s is initialized in all branches
      const diag = result.diagnostics.find(d => d.variable === 's');
      assert.ok(!diag, 'Should not warn when variable is initialized in all branches');
    });

    it('should not warn for foreach loop variables', async () => {
      const code = `
void test() {
    array items = ({ 1, 2, 3 });
    foreach (items, mixed item) {
        write(item);
    }
}
`;
      const result = await bridge.analyzeUninitialized(code, 'test.pike');

      const diag = result.diagnostics.find(d => d.variable === 'item');
      assert.ok(!diag, 'Should not warn for foreach loop variables');
    });
  });

  // Module resolution tests
  describe('extractImports', () => {
    it('should extract import statements', async () => {
      const code = `
import Stdio;
import Parser.Pike;
`;
      const result = await bridge.extractImports(code, 'test.pike');

      assert.ok(result.imports, 'Should return imports array');
      assert.ok(Array.isArray(result.imports), 'Imports should be an array');
      assert.ok(result.imports.length >= 2, 'Should find at least 2 imports');

      const stdioImport = result.imports.find((i: any) => i.path === 'Stdio');
      assert.ok(stdioImport, 'Should find Stdio import');
      assert.equal(stdioImport?.type, 'import');
    });

    it('should extract #include directives', async () => {
      const code = `
#include "local.h"
#include <system.h>
`;
      const result = await bridge.extractImports(code, 'test.pike');

      const includes = result.imports.filter((i: any) => i.type === 'include');
      assert.ok(includes.length >= 2, 'Should find at least 2 includes');
    });

    it('should extract inherit statements', async () => {
      const code = `
inherit Thread.Thread;
inherit SSL.Constants;
`;
      const result = await bridge.extractImports(code, 'test.pike');

      const inherits = result.imports.filter((i: any) => i.type === 'inherit');
      assert.ok(inherits.length >= 2, 'Should find at least 2 inherits');
    });

    it('should extract #require directives (string literal)', async () => {
      const code = `
#require "my_module.pike";
`;
      const result = await bridge.extractImports(code, 'test.pike');

      const requires = result.imports.filter((i: any) => i.type === 'require');
      assert.ok(requires.length > 0, 'Should find #require directive');

      const req = requires[0];
      assert.ok(req, 'Should have a require entry');
      assert.equal(req?.path, 'my_module.pike');
    });

    it('should extract #require with constant() identifier', async () => {
      const code = `
#require constant(MyModule);
`;
      const result = await bridge.extractImports(code, 'test.pike');

      const requires = result.imports.filter((i: any) => i.type === 'require');
      assert.ok(requires.length > 0, 'Should find #require directive');

      const req = requires[0];
      assert.ok(req, 'Should have a require entry');
      assert.equal(req?.identifier, 'MyModule');
      assert.equal(req?.resolution_type, 'constant_identifier');
    });
  });

  describe('resolveImport', () => {
    it('should resolve import to module path', async () => {
      const result = await bridge.resolveImport('import', 'Stdio');

      assert.ok(result, 'Should return a result');
      assert.equal(result.type, 'import');
      // Stdio module should be found
      if (result.exists === 1) {
        assert.ok(result.path, 'Should have a path when found');
      }
    });

    it('should resolve inherit to class path', async () => {
      const result = await bridge.resolveImport('inherit', 'Thread.Thread');

      assert.ok(result, 'Should return a result');
      assert.equal(result.type, 'inherit');
    });

    it('should handle non-existent modules gracefully', async () => {
      const result = await bridge.resolveImport('import', 'NonExistentModuleXYZ');

      assert.ok(result, 'Should return a result');
      assert.equal(result.exists, 0, 'Should not exist (0)');
    });
  });

  describe('checkCircular', () => {
    it('should detect no circular dependencies in simple code', async () => {
      const code = `
import Stdio;
import Parser.Pike;
`;
      const result = await bridge.checkCircular(code, 'test.pike');

      assert.ok(result, 'Should return a result');
      assert.equal(result.has_circular, 0, 'Should not have circular dependencies (0)');
    });

    it('should return empty cycle for acyclic code', async () => {
      const code = `import Stdio;`;
      const result = await bridge.checkCircular(code, 'test.pike');

      assert.ok(Array.isArray(result.cycle), 'Cycle should be an array');
      assert.equal(result.cycle.length, 0, 'Cycle should be empty');
    });
  });

  describe('getWaterfallSymbols', () => {
    it('should get symbols from code with imports', async () => {
      const code = `
import Stdio;

void main() {
    write("hello");
}
`;
      const result = await bridge.getWaterfallSymbols(code, 'test.pike', 2);

      assert.ok(result, 'Should return a result');
      assert.ok(Array.isArray(result.imports), 'Should have imports array');
      assert.ok(result.imports.length > 0, 'Should have at least one import');

      const stdioImport = result.imports.find((i: any) => i.path === 'Stdio');
      assert.ok(stdioImport, 'Should find Stdio import');
    });

    it('should track provenance depth', async () => {
      const code = `import Stdio;`;
      const result = await bridge.getWaterfallSymbols(code, 'test.pike', 1);

      assert.ok(result, 'Should return a result');
      // Direct imports should be at depth 0
      const directImport = result.imports.find((i: any) => i.depth === 0);
      assert.ok(directImport, 'Should have direct imports at depth 0');
    });
  });

  // =========================================================================
  // Preprocessor Block Parsing (P2 - Task 2.1)
  // =========================================================================

  describe('parsePreprocessorBlocks', () => {
    it('should parse simple #if/#endif block', async () => {
      const code = `
#if COND
int x;
#endif
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result, 'Should return a result');
      assert.ok(result.blocks, 'Should return blocks array');
      assert.ok(Array.isArray(result.blocks), 'Blocks should be an array');
      assert.ok(result.blocks.length > 0, 'Should find at least one block');

      const block = result.blocks[0];
      if (!block) throw new Error('Block should be defined');
      assert.equal(block.condition, 'COND', 'Should extract condition');
      assert.ok(block.branches, 'Should have branches');
      assert.ok(Array.isArray(block.branches), 'Branches should be an array');
    });

    it('should parse #if/#else/#endif block with two branches', async () => {
      const code = `
#if COND
int x;
#else
string y;
#endif
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result.blocks, 'Should return blocks array');
      assert.ok(result.blocks.length > 0, 'Should find at least one block');

      const block = result.blocks[0];
      if (!block) throw new Error('Block should be defined');
      assert.equal(block.condition, 'COND', 'Should extract condition');
      assert.equal(block.branches.length, 2, 'Should have 2 branches (if and else)');

      // Verify branch structure
      const ifBranch = block.branches[0];
      const elseBranch = block.branches[1];
      if (!ifBranch) throw new Error('If branch should be defined');
      if (!elseBranch) throw new Error('Else branch should be defined');
      assert.ok(ifBranch.startLine, 'If branch should have start line');
      assert.ok(elseBranch.startLine, 'Else branch should have start line');
    });

    it('should parse nested #if blocks', async () => {
      const code = `
#if A
#if B
int x;
#endif
#endif
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result.blocks, 'Should return blocks array');
      assert.ok(result.blocks.length >= 1, 'Should find at least one block');

      // Should have both outer and inner blocks
      const outerBlock = result.blocks.find((b: any) => b.condition === 'A');
      assert.ok(outerBlock, 'Should find outer #if A block');

      const innerBlock = result.blocks.find((b: any) => b.condition === 'B');
      assert.ok(innerBlock, 'Should find inner #if B block');
    });

    it('should parse #if/#elif/#else/#endif with multiple branches', async () => {
      const code = `
#if DEBUG
int x;
#elif RELEASE
int y;
#else
int z;
#endif
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result.blocks, 'Should return blocks array');
      assert.ok(result.blocks.length > 0, 'Should find at least one block');

      const block = result.blocks[0];
      if (!block) throw new Error('Block should be defined');
      assert.ok(block.branches.length >= 2, 'Should have at least 2 branches');
    });

    it('should handle split-block preprocessor branches', async () => {
      // Code where branches are syntactically incomplete
      const code = `
#if COND
class Foo {
#else
class Bar {
#endif
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result.blocks, 'Should return blocks array');
      assert.ok(result.blocks.length > 0, 'Should find at least one block');

      const block = result.blocks[0];
      if (!block) throw new Error('Block should be defined');
      assert.equal(block.condition, 'COND', 'Should extract condition');
      assert.ok(block.branches.length >= 2, 'Should have at least 2 branches');
    });

    it('should handle code without preprocessor directives', async () => {
      const code = `
int x = 42;
string hello() {
    return "world";
}
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result, 'Should return a result');
      assert.ok(result.blocks, 'Should return blocks array');
      assert.equal(result.blocks.length, 0, 'Should have no blocks');
    });

    it('should handle deeply nested #if blocks (variant cap)', async () => {
      // 5 levels of nesting = 32 theoretical variants (capped at 16)
      const code = `
#if A
#if B
#if C
#if D
#if E
int x;
#endif
#endif
#endif
#endif
#endif
`;
      const result = await bridge.parsePreprocessorBlocks(code);

      assert.ok(result.blocks, 'Should return blocks array');
      // Should parse without crashing
      assert.ok(result.blocks.length >= 1, 'Should find at least one block');
    });
  });
});
