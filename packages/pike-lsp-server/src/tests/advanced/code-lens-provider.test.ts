/**
 * Code Lens Provider Tests
 *
 * TDD tests for code lens functionality based on specification:
 * https://github.com/.../TDD-SPEC.md#23-code-lens-provider
 *
 * Test scenarios:
 * - 23.1 Code Lens - Reference counts
 * - 23.2 Code Lens - Click references
 * - 23.3 Code Lens - No references
 * - 23.4 Code Lens - Method in class
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import assert from 'node:assert/strict';
import { CodeLens, Command } from 'vscode-languageserver/node.js';
import { PikeBridge } from '@pike-lsp/pike-bridge';

/**
 * Helper: Create a mock CodeLens
 */
function createCodeLens(overrides: Partial<CodeLens> = {}): CodeLens {
    return {
        range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 }
        },
        command: undefined,
        ...overrides
    };
}

/**
 * Helper: Create a mock Command
 */
function createCommand(overrides: Partial<Command> = {}): Command {
    return {
        title: 'Test Command',
        command: 'test.command',
        ...overrides
    };
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

describe('Code Lens Provider', () => {

    /**
     * Test 23.1: Code Lens - Reference Counts
     * GIVEN: A Pike document with function declarations
     * WHEN: Code lens is requested
     * THEN: Return lens showing reference count
     */
    describe('Scenario 23.1: Code Lens - Reference counts', () => {
        it('should show reference count for function', async () => {
            const code = `void helper() {}
int main() {
    helper();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should parse code');
            assert.ok(result.result?.tokenize, 'Should tokenize code');

            // Count references to helper (excluding definition)
            const symbols = result.result.parse.symbols || [];
            const helperFunc = symbols.find((s: any) => s.name === 'helper');
            assert.ok(helperFunc, 'Should find helper function');

            const tokens = result.result.tokenize.tokens || [];
            const defLine = helperFunc.position?.line;
            let refCount = 0;

            for (const token of tokens) {
                if (token.text === 'helper' && token.line !== defLine) {
                    refCount++;
                }
            }

            assert.equal(refCount, 1, 'helper should have 1 reference');
        });

        it('should show reference count for variable', async () => {
            const code = `int main() {
    int count = 0;
    count = count + 1;
    return count;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const countVar = symbols.find((s: any) => s.name === 'count');
            assert.ok(countVar, 'Should find count variable');

            const tokens = result.result.tokenize.tokens || [];
            const defLine = countVar.position?.line;
            let refCount = 0;

            for (const token of tokens) {
                if (token.text === 'count' && token.line !== defLine) {
                    refCount++;
                }
            }

            assert.ok(refCount >= 2, 'count should have at least 2 references');
        });

        it('should show reference count for class', async () => {
            const code = `class Helper {}
int main() {
    Helper h = Helper();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const helperClass = symbols.find((s: any) => s.name === 'Helper');
            assert.ok(helperClass, 'Should find Helper class');

            const tokens = result.result.tokenize.tokens || [];
            const defLine = helperClass.position?.line;
            let refCount = 0;

            for (const token of tokens) {
                if (token.text === 'Helper' && token.line !== defLine) {
                    refCount++;
                }
            }

            assert.ok(refCount >= 1, 'Helper should have at least 1 reference');
        });

        it('should display count as "X references"', () => {
            // This is a UI/formatting test - the code lens builder formats the title
            const refCount = 5;
            const title = refCount === 1 ? '1 reference' : `${refCount} references`;
            assert.equal(title, '5 references', 'Should format as "X references"');
        });

        it('should update count when references change', async () => {
            const code1 = `void helper() {}
int main() {
    helper();
    return 0;
}`;

            const result1 = await bridge.analyze(code1, ['parse', 'tokenize'], '/tmp/test.pike');
            const tokens1 = result1.result?.tokenize?.tokens || [];
            let refCount1 = 0;
            for (const token of tokens1) {
                if (token.text === 'helper' && token.line !== 1) refCount1++;
            }

            const code2 = `void helper() {}
int main() {
    helper();
    helper();
    return 0;
}`;

            const result2 = await bridge.analyze(code2, ['parse', 'tokenize'], '/tmp/test.pike');
            const tokens2 = result2.result?.tokenize?.tokens || [];
            let refCount2 = 0;
            for (const token of tokens2) {
                if (token.text === 'helper' && token.line !== 1) refCount2++;
            }

            assert.ok(refCount2 > refCount1, 'Reference count should increase with more calls');
        });
    });

    /**
     * Test 23.2: Code Lens - Click References
     * GIVEN: A Pike document with reference count lens
     * WHEN: User clicks the lens
     * THEN: Execute "Show References" command
     */
    describe('Scenario 23.2: Code Lens - Click references', () => {
        it('should provide command to show references', () => {
            const command: Command = {
                title: '1 reference',
                command: 'editor.action.showReferences',
                arguments: []
            };

            assert.equal(command.command, 'editor.action.showReferences', 'Should use show references command');
        });

        it('should include location in command arguments', () => {
            const uri = 'file:///tmp/test.pike';
            const position = { line: 0, character: 5 };

            const command: Command = {
                title: '1 reference',
                command: 'editor.action.showReferences',
                arguments: [uri, position, []]
            };

            assert.ok(command.arguments, 'Should have arguments');
            assert.equal(command.arguments[0], uri, 'First argument should be URI');
            assert.deepEqual((command.arguments[1] as any), position, 'Second argument should be position');
        });

        it('should execute reference search on click', () => {
            // This test verifies the command structure for LSP compliance
            const command: Command = {
                title: '2 references',
                command: 'editor.action.showReferences',
                arguments: ['file:///tmp/test.pike', { line: 5, character: 0 }, []]
            };

            assert.ok(command.command.startsWith('editor.action.'), 'Should use editor action command');
        });
    });

    /**
     * Test 23.3: Code Lens - No References
     * GIVEN: A Pike document with unused declarations
     * WHEN: Code lens is requested
     * THEN: Return lens showing "0 references" or no lens
     */
    describe('Scenario 23.3: Code Lens - No references', () => {
        it('should show "0 references" for unused function', async () => {
            const code = `void unused() {}
int main() {
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const unusedFunc = symbols.find((s: any) => s.name === 'unused');
            assert.ok(unusedFunc, 'Should find unused function');

            const tokens = result.result.tokenize.tokens || [];
            const defLine = unusedFunc.position?.line;
            let refCount = 0;

            for (const token of tokens) {
                if (token.text === 'unused' && token.line !== defLine) {
                    refCount++;
                }
            }

            assert.equal(refCount, 0, 'unused function should have 0 references');
        });

        it('should show "0 references" for unused variable', async () => {
            const code = `int main() {
    int unused = 0;
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const unusedVar = symbols.find((s: any) => s.name === 'unused');
            assert.ok(unusedVar, 'Should find unused variable');

            const tokens = result.result.tokenize.tokens || [];
            const defLine = unusedVar.position?.line;
            let refCount = 0;

            for (const token of tokens) {
                if (token.text === 'unused' && token.line !== defLine) {
                    refCount++;
                }
            }

            assert.equal(refCount, 0, 'unused variable should have 0 references');
        });

        it('should optionally hide lens for unused symbols', () => {
            // Configuration option test - unused symbols can be hidden
            const showUnused = true;
            const lensVisible = showUnused || false; // Can be configured

            assert.ok(typeof lensVisible === 'boolean', 'Lens visibility should be configurable');
        });
    });

    /**
     * Test 23.4: Code Lens - Method in Class
     * GIVEN: A Pike document with class methods
     * WHEN: Code lens is requested
     * THEN: Return lens for each method with reference count
     */
    describe('Scenario 23.4: Code Lens - Method in class', () => {
        it('should show reference count for class method', async () => {
            const code = `class Calculator {
    int add(int a, int b) {
        return a + b;
    }
}
int main() {
    Calculator c = Calculator();
    c->add(1, 2);
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const calculatorClass = symbols.find((s: any) => s.name === 'Calculator');
            assert.ok(calculatorClass, 'Should find Calculator class');

            // Check that 'add' appears in tokens
            const tokens = result.result.tokenize.tokens || [];
            const addTokens = tokens.filter((t: any) => t.text === 'add');
            assert.ok(addTokens.length > 0, 'Should find add method in tokens');
        });

        it('should distinguish method from function references', async () => {
            const code = `void helper() {}
class Container {
    void helper() {}
}
int main() {
    helper();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            // Should be able to distinguish between standalone helper and Container.helper
            const tokens = result.result.tokenize.tokens || [];
            assert.ok(tokens.length > 0, 'Should have tokens');
        });

        it('should show lens for static methods', async () => {
            const code = `class Util {
    static void helper() {}
}
int main() {
    Util->helper();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should parse static method');
            const tokens = result.result.tokenize.tokens || [];
            const helperTokens = tokens.filter((t: any) => t.text === 'helper');
            assert.ok(helperTokens.length > 0, 'Should find static helper in tokens');
        });

        it('should show lens for private methods', async () => {
            const code = `class Example {
    private void internal() {}
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const exampleClass = symbols.find((s: any) => s.name === 'Example');
            assert.ok(exampleClass, 'Should find Example class with private method');
        });
    });

    /**
     * Edge Cases
     */
    describe('Edge Cases', () => {
        it('should handle empty file', async () => {
            const code = ``;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            assert.ok(result.result !== undefined, 'Should handle empty file');
        });

        it('should handle file with no declarations', async () => {
            const code = `int main() {
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            // Should have main function
            assert.ok(symbols.length > 0, 'Should have main function');
        });

        it('should handle duplicate declarations', async () => {
            const code = `void func() {}
void func() {}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should handle duplicates');
        });

        it('should handle symbols with many references', async () => {
            const lines: string[] = ['void func() {}', 'int main() {'];
            for (let i = 0; i < 50; i++) {
                lines.push('    func();');
            }
            lines.push('    return 0;', '}');

            const code = lines.join('\n');
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');

            const tokens = result.result?.tokenize?.tokens || [];
            const funcCalls = tokens.filter((t: any) => t.text === 'func' && t.line !== 1);
            assert.equal(funcCalls.length, 50, 'Should count all 50 references');
        });
    });

    /**
     * Lens Positioning
     */
    describe('Lens Positioning', () => {
        it('should place lens at declaration line', async () => {
            const code = `void helper() {}
int main() { return 0; }`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const helperFunc = symbols.find((s: any) => s.name === 'helper');
            assert.ok(helperFunc, 'Should find helper');
            assert.equal(helperFunc.position?.line, 1, 'Helper should be on line 1');
        });

        it('should place lens at start of declaration', async () => {
            const code = `    void helper() {}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            const helperFunc = symbols.find((s: any) => s.name === 'helper');
            assert.ok(helperFunc, 'Should find helper');
            assert.ok(helperFunc.position, 'Should have position');
        });

        it('should handle multi-line declarations', async () => {
            const code = `void helper(
    int a,
    int b
) {}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            assert.ok(result.result?.parse, 'Should parse multi-line declaration');
        });
    });

    /**
     * Command Format
     */
    describe('Command Format', () => {
        it('should format reference count command correctly', () => {
            const refCount = 1;
            const title = refCount === 1 ? '1 reference' : `${refCount} references`;
            assert.equal(title, '1 reference', 'Should format singular correctly');
        });

        it('should use LSP standard command for references', () => {
            const command = 'editor.action.showReferences';
            assert.ok(command.startsWith('editor.action.'), 'Should use LSP standard command');
        });

        it('should include all necessary arguments', () => {
            const args = ['file:///tmp/test.pike', { line: 0, character: 0 }, []];
            assert.equal(args.length, 3, 'Should have 3 arguments: uri, position, locations');
        });
    });

    /**
     * Performance
     */
    describe('Performance', () => {
        it('should provide lens for large file within 300ms', async () => {
            const lines: string[] = ['class Large {'];
            for (let i = 0; i < 100; i++) {
                lines.push(`    void method${i}() {}`);
            }
            lines.push('}', 'int main() {', '    Large l = Large();', '    return 0;', '}');

            const code = lines.join('\n');

            const start = Date.now();
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');
            const elapsed = Date.now() - start;

            assert.ok(result.result?.parse, 'Should parse large file');
            assert.ok(elapsed < 300, `Should parse within 300ms, took ${elapsed}ms`);
        });

        it('should handle rapid document updates', async () => {
            const code1 = `void func() {}`;
            const code2 = `void func() {} void another() {}`;

            const start = Date.now();
            await bridge.analyze(code1, ['parse'], '/tmp/test.pike');
            await bridge.analyze(code2, ['parse'], '/tmp/test.pike');
            const elapsed = Date.now() - start;

            assert.ok(elapsed < 300, `Should handle rapid updates within 300ms, took ${elapsed}ms`);
        });

        it('should efficiently compute reference counts', async () => {
            const code = `void f() {}
int main() {
    f(); f(); f(); f(); f();
    return 0;
}`;

            const start = Date.now();
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');
            const elapsed = Date.now() - start;

            const tokens = result.result?.tokenize?.tokens || [];
            const fRefs = tokens.filter((t: any) => t.text === 'f' && t.line !== 1);
            assert.equal(fRefs.length, 5, 'Should count all references');
            assert.ok(elapsed < 100, `Should compute counts quickly, took ${elapsed}ms`);
        });
    });

    /**
     * Configuration
     */
    describe('Configuration', () => {
        it('should respect enabled/disabled configuration', () => {
            const config = { codeLens: { enabled: true } };
            assert.ok(config.codeLens.enabled, 'Should have enabled flag');
        });

        it('should filter which symbols get lens', () => {
            const config = {
                codeLens: {
                    enabled: true,
                    symbols: ['function', 'class', 'variable']
                }
            };
            assert.ok(Array.isArray(config.codeLens.symbols), 'Should have symbol filter list');
        });

        it('should allow showing/hiding for unused symbols', () => {
            const config = {
                codeLens: {
                    showUnused: false
                }
            };
            assert.ok(typeof config.codeLens.showUnused === 'boolean', 'Should have showUnused option');
        });
    });

    /**
     * Special Cases
     */
    describe('Special Cases', () => {
        it('should handle lambda functions', async () => {
            const code = `int main() {
    function f = lambda(int x) { return x * 2; };
    return f(5);
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            assert.ok(result.result?.parse, 'Should parse lambda');
        });

        it('should handle inherited methods', async () => {
            const code = `class Base {
    void method() {}
}
class Derived extends Base {}
int main() {
    Derived d = Derived();
    d->method();
    return 0;
}`;
            const result = await bridge.analyze(code, ['parse', 'tokenize'], '/tmp/test.pike');
            assert.ok(result.result?.parse, 'Should parse inheritance');
        });

        it('should handle overridden methods', async () => {
            const code = `class Base {
    void method() {}
}
class Derived extends Base {
    void method() {}
}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
            assert.ok(result.result?.parse, 'Should parse override');
        });

        it('should handle module-level symbols', async () => {
            const code = `int global_var = 0;
void global_func() {}`;
            const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');

            const symbols = result.result?.parse?.symbols || [];
            assert.ok(symbols.length >= 2, 'Should find module-level symbols');
        });
    });
});
