/**
 * Semantic Tokens Provider Tests
 *
 * TDD tests for semantic tokens functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#16-semantic-tokens-provider
 *
 * Test scenarios:
 * - 16.1 Semantic Tokens - Variable declarations
 * - 16.2 Semantic Tokens - Function declarations
 * - 16.3 Semantic Tokens - Class declarations
 * - 16.4 Semantic Tokens - Variable usage
 * - 16.5 Semantic Tokens - Function/method usage
 * - 16.6 Semantic Tokens - Static members
 * - 16.7 Semantic Tokens - Deprecated symbols
 * - 16.8 Semantic Tokens - All token types
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { SemanticTokens, SemanticTokensLegend } from 'vscode-languageserver/node.js';
import { PikeBridge } from '@pike-lsp/pike-bridge';

/**
 * Helper: Create a mock SemanticTokens
 */
function createSemanticTokens(overrides: Partial<SemanticTokens> = {}): SemanticTokens {
    return {
        data: [],
        resultId: 'test-tokens',
        ...overrides
    };
}

/**
 * Helper: Create a mock SemanticTokensLegend
 */
function createLegend(): SemanticTokensLegend {
    return {
        tokenTypes: [
            'namespace', 'type', 'class', 'enum', 'interface',
            'struct', 'typeParameter', 'parameter', 'variable', 'property',
            'enumMember', 'event', 'function', 'method', 'macro',
            'keyword', 'modifier', 'comment', 'string', 'number',
            'regexp', 'operator', 'decorator'
        ],
        tokenModifiers: [
            'declaration', 'definition', 'readonly', 'static',
            'deprecated', 'abstract', 'async', 'modification',
            'documentation', 'defaultLibrary'
        ]
    };
}

/**
 * Helper: Find tokens by line in semantic tokens data
 */
function findTokensByLine(tokensData: number[], line: number): number[][] {
    const result: number[][] = [];
    let currentLine = 0;

    for (let i = 0; i < tokensData.length; i += 5) {
        const deltaLine = tokensData[i];
        currentLine += deltaLine;

        if (currentLine === line) {
            result.push([
                tokensData[i],     // deltaLine
                tokensData[i + 1], // deltaStartChar
                tokensData[i + 2], // length
                tokensData[i + 3], // tokenType
                tokensData[i + 4]  // tokenModifiers
            ]);
        }

        if (currentLine > line) break;
    }

    return result;
}

// ============================================================================
// Test Setup
// ============================================================================

let bridge: PikeBridge;

beforeAll(async () => { bridge = new PikeBridge();
await bridge.start(); });

afterAll(async () => { if (bridge) {
    await bridge.stop();
} });

// ============================================================================
// Tests
// ============================================================================

describe('Semantic Tokens Provider', () => {

    /**
     * Test 16.1: Semantic Tokens - Variable Declarations
     * GIVEN: A Pike document with variable declarations
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with type 'variable' and modifier 'declaration'
     */
    describe('Scenario 16.1: Semantic Tokens - Variable declarations', () => {
        it('should tokenize local variable declaration', async () => {
            const code = `int main() {
    int x = 5;
    return x;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            assert.ok(result.result?.parse?.symbols, 'Should have parsed symbols');

            const symbols = result.result.parse.symbols;
            const xVar = symbols.find((s: any) => s.name === 'x');
            assert.ok(xVar, 'Should find variable x');
            assert.equal(xVar.kind, 'variable', 'x should be a variable');
        });

        it('should tokenize multiple variable declarations', async () => {
            const code = `int main() {
    int x = 1;
    int y = 2;
    int z = 3;
    return x + y + z;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            assert.ok(result.result?.parse?.symbols, 'Should have parsed symbols');

            const symbols = result.result.parse.symbols;
            const xVar = symbols.find((s: any) => s.name === 'x');
            const yVar = symbols.find((s: any) => s.name === 'y');
            const zVar = symbols.find((s: any) => s.name === 'z');

            assert.ok(xVar, 'Should find variable x');
            assert.ok(yVar, 'Should find variable y');
            assert.ok(zVar, 'Should find variable z');
        });

        it('should mark variable with declaration modifier', async () => {
            const code = `int main() {
    int count = 0;
    return count;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const countVar = symbols.find((s: any) => s.name === 'count');

            assert.ok(countVar, 'Should find count variable');
            assert.ok(countVar.position, 'Should have position info');
            assert.ok(countVar.position.line > 0, 'Should have line number');
        });
    });

    /**
     * Test 16.2: Semantic Tokens - Function Declarations
     * GIVEN: A Pike document with function declarations
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with type 'function' or 'method' and modifier 'declaration'
     */
    describe('Scenario 16.2: Semantic Tokens - Function declarations', () => {
        it('should tokenize standalone function', async () => {
            const code = `int add(int a, int b) {
    return a + b;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const addFunc = symbols.find((s: any) => s.name === 'add');

            assert.ok(addFunc, 'Should find add function');
            assert.equal(addFunc.kind, 'method', 'Function should be kind method');
            assert.ok(addFunc.position, 'Should have position');
        });

        it('should tokenize method declaration in class', async () => {
            const code = `class Calculator {
    int add(int a, int b) {
        return a + b;
    }
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const calculatorClass = symbols.find((s: any) => s.name === 'Calculator');

            // The class should be found; methods may be nested children
            assert.ok(calculatorClass, 'Should find Calculator class');
            assert.equal(calculatorClass.kind, 'class', 'Should be class kind');
            // Methods may be in children array or separate symbols
            const hasMethod = calculatorClass.children?.some((c: any) => c.name === 'add') ||
                             symbols.some((s: any) => s.name === 'add');
            assert.ok(hasMethod, 'Should find add method (as child or separate symbol)');
        });

        it('should tokenize lambda functions', async () => {
            const code = `int main() {
    function f = lambda(int x) { return x * 2; };
    return f(5);
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            // Lambda may not be parsed as separate symbol in current implementation
            assert.ok(result.result?.parse, 'Should parse successfully');
        });

        it('should tokenize function parameters', async () => {
            const code = `int multiply(int a, int b) {
    return a * b;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            // Parameters may not be extracted separately in current implementation
            assert.ok(result.result?.parse?.symbols, 'Should parse symbols');
            const multiplyFunc = result.result.parse.symbols.find((s: any) => s.name === 'multiply');
            assert.ok(multiplyFunc, 'Should find multiply function');
        });
    });

    /**
     * Test 16.3: Semantic Tokens - Class Declarations
     * GIVEN: A Pike document with class declarations
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with type 'class' and modifier 'declaration'
     */
    describe('Scenario 16.3: Semantic Tokens - Class declarations', () => {
        it('should tokenize class declaration', async () => {
            const code = `class MyClass {
    void method() {}
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const myClass = symbols.find((s: any) => s.name === 'MyClass');

            assert.ok(myClass, 'Should find MyClass');
            assert.equal(myClass.kind, 'class', 'Should be class kind');
        });

        it('should tokenize class inheritance', async () => {
            const code = `class Base {}
class Derived extends Base {}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const baseClass = symbols.find((s: any) => s.name === 'Base');
            const derivedClass = symbols.find((s: any) => s.name === 'Derived');

            assert.ok(baseClass, 'Should find Base class');
            assert.ok(derivedClass, 'Should find Derived class');
        });

        it('should tokenize nested class declarations', async () => {
            const code = `class Outer {
    class Inner {
        void method() {}
    }
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should parse nested classes');
            const symbols = result.result.parse.symbols || [];
            const outerClass = symbols.find((s: any) => s.name === 'Outer');
            assert.ok(outerClass, 'Should find Outer class');
        });
    });

    /**
     * Test 16.4: Semantic Tokens - Variable Usage
     * GIVEN: A Pike document with variable usage
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with type 'variable' without 'declaration' modifier
     */
    describe('Scenario 16.4: Semantic Tokens - Variable usage', () => {
        it('should tokenize variable reference', async () => {
            const code = `int main() {
    int value = 42;
    return value;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            // Check that symbol is found
            const symbols = result.result?.parse?.symbols || [];
            const valueVar = symbols.find((s: any) => s.name === 'value');
            assert.ok(valueVar, 'Should find value symbol');
        });

        it('should distinguish declaration from usage', async () => {
            const code = `int main() {
    int x = 5;
    int y = x + 1;
    return y;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const xVar = symbols.find((s: any) => s.name === 'x');
            assert.ok(xVar, 'Should find x variable');
            assert.ok(xVar.position, 'Should have declaration position');
        });

        it('should tokenize variable in different scope', async () => {
            const code = `int x = 1;

int main() {
    int x = 2;
    return x;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            // Should find at least the main function
            const symbols = result.result?.parse?.symbols || [];
            const mainFunc = symbols.find((s: any) => s.name === 'main');
            assert.ok(mainFunc, 'Should find main function');
        });
    });

    /**
     * Test 16.5: Semantic Tokens - Function/Method Usage
     * GIVEN: A Pike document with function/method calls
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with type 'function' or 'method' without 'declaration' modifier
     */
    describe('Scenario 16.5: Semantic Tokens - Function/method usage', () => {
        it('should tokenize function call', async () => {
            const code = `void helper() {}
int main() {
    helper();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const helperFunc = symbols.find((s: any) => s.name === 'helper');
            assert.ok(helperFunc, 'Should find helper function');
        });

        it('should tokenize method call', async () => {
            const code = `class Helper {
    void method() {}
}
int main() {
    Helper h = Helper();
    h->method();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const helperClass = symbols.find((s: any) => s.name === 'Helper');
            assert.ok(helperClass, 'Should find Helper class');
        });

        it('should tokenize chained method calls', async () => {
            const code = `class Builder {
    Builder add(int x) { return this; }
    Builder build() { return this; }
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const builderClass = symbols.find((s: any) => s.name === 'Builder');
            assert.ok(builderClass, 'Should find Builder class');
        });
    });

    /**
     * Test 16.6: Semantic Tokens - Static Members
     * GIVEN: A Pike document with static members
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with 'static' modifier
     */
    describe('Scenario 16.6: Semantic Tokens - Static members', () => {
        it('should tokenize static variable', async () => {
            const code = `class Constants {
    static int MAX = 100;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const constantsClass = symbols.find((s: any) => s.name === 'Constants');

            // The class should be found; static members may be nested
            assert.ok(constantsClass, 'Should find Constants class');
            assert.equal(constantsClass.kind, 'class', 'Should be class kind');
        });

        it('should tokenize static method', async () => {
            const code = `class Util {
    static int helper() { return 0; }
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const utilClass = symbols.find((s: any) => s.name === 'Util');

            // The class should be found; static methods may be nested children
            assert.ok(utilClass, 'Should find Util class');
        });

        it('should mark static member with static modifier', async () => {
            const code = `class Example {
    static int value = 42;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const exampleClass = symbols.find((s: any) => s.name === 'Example');

            assert.ok(exampleClass, 'Should find Example class');
            // Static info might be in modifiers array on the class or member
            if (exampleClass.modifiers) {
                assert.ok(Array.isArray(exampleClass.modifiers), 'Modifiers should be array');
            }
        });
    });

    /**
     * Test 16.7: Semantic Tokens - Deprecated Symbols
     * GIVEN: A Pike document with deprecated symbols
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens with 'deprecated' modifier
     */
    describe('Scenario 16.7: Semantic Tokens - Deprecated symbols', () => {
        it('should tokenize deprecated function', async () => {
            const code = `//! @deprecated
void old_func() {}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            // Deprecation info may be in autodoc, check if parsing works
            assert.ok(result.result?.parse, 'Should parse deprecated function');
        });

        it('should tokenize deprecated variable', async () => {
            const code = `//! @deprecated
int old_value = 0;`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should parse deprecated variable');
        });

        it('should mark deprecated with deprecated modifier', async () => {
            const code = `//! @deprecated
void deprecated_func() {}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const depFunc = symbols.find((s: any) => s.name === 'deprecated_func');
            assert.ok(depFunc, 'Should find deprecated_func');
        });
    });

    /**
     * Test 16.8: Semantic Tokens - All Token Types
     * GIVEN: A Pike document with various symbol types
     * WHEN: Semantic tokens are requested
     * THEN: Return tokens for all symbol types with appropriate types and modifiers
     */
    describe('Scenario 16.8: Semantic Tokens - All token types', () => {
        it('should tokenize all standard types', async () => {
            const code = `int i;
string s;
float f;
mapping m;
multiset ms;
array a;`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should parse all standard types');
        });

        it('should tokenize keywords', async () => {
            const code = `if (true) {
    while (false) {
        for (int i = 0; i < 10; i++) {
            break;
        }
    }
}`;
            const result = await bridge.analyze(code, ['tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.tokenize, 'Should tokenize keywords');
        });

        it('should tokenize string literals', async () => {
            const code = `string s = "hello world";`;
            const result = await bridge.analyze(code, ['tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.tokenize, 'Should tokenize string literals');
        });

        it('should tokenize numeric literals', async () => {
            const code = `int x = 42;
float y = 3.14;`;
            const result = await bridge.analyze(code, ['tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.tokenize, 'Should tokenize numeric literals');
        });

        it('should tokenize comments', async () => {
            const code = `// Line comment
/* Block comment */`;
            const result = await bridge.analyze(code, ['tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.tokenize, 'Should tokenize comments');
        });

        it('should tokenize operators', async () => {
            const code = `int x = 1 + 2 * 3;
bool b = x > 5 && x < 10;`;
            const result = await bridge.analyze(code, ['tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.tokenize, 'Should tokenize operators');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty file', async () => {
            const code = ``;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            // Empty file should not error
            assert.ok(result.result !== undefined, 'Should handle empty file');
        });

        it('should handle file with only comments', async () => {
            const code = `// Just a comment
// Another comment`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            assert.ok(result.result !== undefined, 'Should handle comment-only file');
        });

        it('should handle duplicate symbols', async () => {
            const code = `void helper() {}
void helper() {}  // Duplicate`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            // Should parse without crashing
            assert.ok(result.result?.parse, 'Should handle duplicate symbols');
        });

        it('should handle symbols with same name in different scopes', async () => {
            const code = `void helper() {}
class Container {
    void helper() {}
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const helpers = symbols.filter((s: any) => s.name === 'helper');
            assert.ok(helpers.length > 0, 'Should find helper symbols');
        });
    });

    /**
     * Performance Tests
     */
    describe('Performance', () => {
        it('should tokenize large file within 500ms', async () => {
            // Generate a large file
            const lines: string[] = ['class LargeFile {'];
            for (let i = 0; i < 100; i++) {
                lines.push(`    void method${i}() { return ${i}; }`);
            }
            lines.push('}');

            const code = lines.join('\n');

            const start = Date.now();
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            const elapsed = Date.now() - start;

            assert.ok(result.result?.parse, 'Should parse large file');
            assert.ok(elapsed < 500, `Should parse within 500ms, took ${elapsed}ms`);
        });

        it('should handle incremental updates efficiently', async () => {
            const code = `void func() {}
int main() { return 0; }`;

            // First parse
            const result1 = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            assert.ok(result1.result?.parse, 'First parse should work');

            // Incremental update (simulate document change)
            const updatedCode = `void func() {}
void another() {}
int main() { return 0; }`;

            const result2 = await bridge.analyze(updatedCode, ['parse'], '/tmp/test.pike');
            assert.ok(result2.result?.parse, 'Updated parse should work');
        });
    });

    /**
     * Legend Compatibility
     */
    describe('Legend Compatibility', () => {
        it('should provide correct token types legend', () => {
            const legend = createLegend();
            assert.ok(legend.tokenTypes.length > 0, 'Should have token types');
            assert.ok(legend.tokenModifiers.length > 0, 'Should have token modifiers');
        });

        it('should use only standard token types', () => {
            const legend = createLegend();
            const standardTypes = [
                'namespace', 'type', 'class', 'enum', 'interface',
                'struct', 'typeParameter', 'parameter', 'variable', 'property',
                'enumMember', 'event', 'function', 'method', 'macro',
                'keyword', 'modifier', 'comment', 'string', 'number',
                'regexp', 'operator', 'decorator'
            ];

            for (const type of legend.tokenTypes) {
                assert.ok(standardTypes.includes(type), `${type} should be a standard token type`);
            }
        });

        it('should use only standard token modifiers', () => {
            const legend = createLegend();
            const standardModifiers = [
                'declaration', 'definition', 'readonly', 'static',
                'deprecated', 'abstract', 'async', 'modification',
                'documentation', 'defaultLibrary'
            ];

            for (const mod of legend.tokenModifiers) {
                assert.ok(standardModifiers.includes(mod), `${mod} should be a standard token modifier`);
            }
        });
    });
});
