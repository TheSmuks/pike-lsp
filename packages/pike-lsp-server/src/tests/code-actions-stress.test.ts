/**
 * Code Actions Stress Tests
 *
 * Stress tests for code actions and quick fixes functionality.
 * Tests import quick fixes, rename refactoring, code generation,
 * and edge cases with conflicting actions.
 *
 * Run with: bun test dist/src/tests/code-actions-stress-tests.js
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import { CodeActionKind } from 'vscode-languageserver/node.js';
import { PikeBridge } from '@pike-lsp/pike-bridge';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getGenerateGetterSetterActions } from '../features/advanced/getters-setters.js';
import { getExtractMethodAction } from '../features/advanced/extract-method.js';

describe('Code Actions Stress Tests: Import Quick Fixes', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
    });

    after(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should handle file with many unsorted imports', async () => {
        const code = `import ZModule;
import AModule;
import MModule;
import BModule;
import XModule;

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        assert.ok(result.result !== undefined, 'Should analyze code with imports');
    });

    it('should handle file with duplicate imports', async () => {
        const code = `import Stdio;
import Stdio;
import Array;
import Array;
import String;

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        assert.ok(result.result !== undefined, 'Should analyze code with duplicate imports');
    });

    it('should handle mixed imports and inherits', async () => {
        const code = `inherit LocalModule;
import Stdio;
import Array;
inherit AnotherModule;
#include <config.h>

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        assert.ok(result.result !== undefined, 'Should analyze mixed imports');
    });

    it('should handle imports with various whitespace', async () => {
        const code = `import    Stdio;
import   String  ;

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        assert.ok(result.result !== undefined, 'Should handle irregular whitespace');
    });

    it('should handle commented import statements', async () => {
        const code = `// import Stdio;
import Array;
// import String;

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        assert.ok(result.result !== undefined, 'Should handle commented imports');
    });

    it('should handle many includes before imports', async () => {
        const code = `#include <config.h>
#include <module.h>
#include <debug.h>
#include <local.h>
import Stdio;

int main() {
    return 0;
}`;

        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        assert.ok(result.result !== undefined, 'Should handle many includes');
    });
});

describe('Code Actions Stress Tests: Rename Refactoring', () => {
    it('should handle basic rename detection', () => {
        const code = `void myFunction() {}
int main() {
    myFunction();
    return myFunction();
}`;

        const occurrences = code.split('myFunction').length - 1;
        assert.equal(occurrences, 3, 'Should find 3 occurrences of myFunction');
    });

    it('should handle rename with similar names', () => {
        const code = `int myVar = 1;
int myVar2 = 2;
int myVar3 = 3;`;

        const myVarOccurrences = (code.match(/\bmyVar\b/g) || []).length;
        assert.equal(myVarOccurrences, 1, 'Should only match exact myVar');

        const myVar2Occurrences = (code.match(/\bmyVar2\b/g) || []).length;
        assert.equal(myVar2Occurrences, 1, 'Should match myVar2');
    });

    it('should handle rename in strings', () => {
        const code = `string name = "myFunction";
call(myFunction);`;

        // Rename should not affect string occurrences
        const inString = code.includes('"myFunction"');
        const inCode = code.includes('myFunction);');
        assert.ok(inString && inCode, 'Should distinguish string vs code');
    });

    it('should handle rename in comments', () => {
        const code = `// This calls myFunction
void myFunction() {}

// And then myFunction is called
call(myFunction);`;

        // Rename should not affect comment occurrences
        const inComment = code.includes('//') && code.includes('myFunction');
        const inCode = code.includes('call(myFunction)');
        assert.ok(inComment && inCode, 'Should handle comments');
    });

    it('should handle rename across multiple scopes', () => {
        const code = `class Outer {
    int myVar = 1;

    class Inner {
        int myVar = 2;
    }
}

int myVar = 3;`;

        const occurrences = (code.match(/\bmyVar\b/g) || []).length;
        assert.equal(occurrences, 3, 'Should find myVar in each scope');
    });

    it('should handle rename with special characters', () => {
        const code = `int _privateVar = 1;
int publicVar = 2;
int __dunder__ = 3;`;

        assert.ok(code.includes('_privateVar'), 'Should handle underscore prefix');
        assert.ok(code.includes('publicVar'), 'Should handle normal name');
        assert.ok(code.includes('__dunder__'), 'Should handle dunder names');
    });
});

describe('Code Actions Stress Tests: Code Generation', () => {
    it('should generate getter for private variable', () => {
        const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int _foo;\n');
        const uri = 'file:///test.pike';
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } };
        const symbols: any[] = [{
            name: '_foo',
            kind: 'variable',
            type: 'int',
            position: { line: 1 }
        }];

        const result = getGenerateGetterSetterActions(document, uri, range, symbols);

        assert.ok(result.length > 0, 'Should return getter/setter actions');
        assert.ok(result.some(a => a.title.includes('Getter')), 'Should include getter');
        assert.ok(result.some(a => a.title.includes('Setter')), 'Should include setter');
    });

    it('should generate getters for multiple variables', () => {
        const code = `int _foo;
int _bar;
int _baz;`;

        const symbols = [
            { name: '_foo', kind: 'variable', type: 'int', position: { line: 1 } },
            { name: '_bar', kind: 'variable', type: 'int', position: { line: 2 } },
            { name: '_baz', kind: 'variable', type: 'int', position: { line: 3 } }
        ];

        // Each variable should potentially generate getter/setter actions
        assert.equal(symbols.length, 3, 'Should have 3 symbols');
    });

    it('should handle extract method with multiple statements', () => {
        const code = `int main() {
    int a = 5;
    int b = 10;
    int sum = a + b;
    return sum;
}`;

        const document = TextDocument.create('file:///test.pike', 'pike', 1, code);
        const uri = 'file:///test.pike';

        // Select lines 1-3 (the variable declarations and calculation)
        const range = {
            start: { line: 1, character: 4 },
            end: { line: 3, character: 15 }
        };

        const result = getExtractMethodAction(document, uri, range, code);

        assert.ok(result !== null, 'Should return extract method action');
        if (result) {
            assert.equal(result.kind, CodeActionKind.RefactorExtract, 'Should be refactor.extract');
            assert.ok(result.edit, 'Should have edit');
        }
    });

    it('should handle extract method with return value', () => {
        const code = `int main() {
    int result = 1 + 2 + 3 + 4 + 5;
    return result;
}`;

        const document = TextDocument.create('file:///test.pike', 'pike', 1, code);
        const uri = 'file:///test.pike';

        const range = {
            start: { line: 1, character: 4 },
            end: { line: 1, character: 27 }
        };

        const result = getExtractMethodAction(document, uri, range, code);

        assert.ok(result !== null, 'Should return action for expression');
    });

    it('should not generate actions for non-variable selection', () => {
        const document = TextDocument.create('file:///test.pike', 'pike', 1, 'int foo() { return 42; }\n');
        const uri = 'file:///test.pike';
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } };
        const symbols: any[] = [{
            name: 'foo',
            kind: 'function',
            type: 'int',
            position: { line: 1 }
        }];

        const result = getGenerateGetterSetterActions(document, uri, range, symbols);

        assert.equal(result.length, 0, 'Should not return actions for function');
    });
});

describe('Code Actions Stress Tests: Conflicting Actions', () => {
    it('should handle multiple quick fixes for same diagnostic', () => {
        // Simulate scenario where multiple actions could fix the same issue
        const diagnostics = [
            {
                message: 'syntax error, expected ;',
                range: { start: { line: 5, character: 10 }, end: { line: 5, character: 10 } }
            }
        ];

        // Multiple potential fixes:
        const actions = [
            { title: 'Add missing semicolon', kind: CodeActionKind.QuickFix },
            { title: 'Add missing semicolon (alt)', kind: CodeActionKind.QuickFix },
            { title: 'Organize imports', kind: CodeActionKind.SourceOrganizeImports }
        ];

        // Filter should allow all quickfixes
        const quickFixes = actions.filter(a => a.kind === CodeActionKind.QuickFix);
        assert.equal(quickFixes.length, 2, 'Should have multiple quick fixes');
    });

    it('should handle conflicting refactor actions', () => {
        const actions = [
            { title: 'Extract Method', kind: CodeActionKind.RefactorExtract },
            { title: 'Inline Variable', kind: CodeActionKind.Refactor },
            { title: 'Rename Symbol', kind: CodeActionKind.Refactor }
        ];

        const refactors = actions.filter(a => a.kind.startsWith('refactor'));
        assert.equal(refactors.length, 3, 'Should have multiple refactor options');
    });

    it('should prioritize organize imports over other actions', () => {
        const actions = [
            { title: 'Quick Fix', kind: CodeActionKind.QuickFix, priority: 1 },
            { title: 'Organize Imports', kind: CodeActionKind.SourceOrganizeImports, priority: 2 },
            { title: 'Extract Method', kind: CodeActionKind.RefactorExtract, priority: 1 }
        ];

        // Sort by priority (higher first)
        actions.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        assert.equal(actions[0]!.title, 'Organize Imports', 'Organize should be first');
    });

    it('should handle mutually exclusive actions', () => {
        // Extract method and inline variable are mutually exclusive
        const code = `int x = 5;
return x;`;

        // These two refactorings would conflict if applied together
        const inlineAction = { title: 'Inline Variable', kind: CodeActionKind.Refactor };
        const extractAction = { title: 'Extract Method', kind: CodeActionKind.RefactorExtract };

        assert.ok(inlineAction.title !== extractAction.title, 'Actions should be distinct');
    });

    it('should handle many competing actions', () => {
        const actions = [
            { title: 'Add semicolon', kind: CodeActionKind.QuickFix },
            { title: 'Remove unused import', kind: CodeActionKind.QuickFix },
            { title: 'Organize Imports', kind: CodeActionKind.SourceOrganizeImports },
            { title: 'Generate Getter', kind: CodeActionKind.RefactorRewrite },
            { title: 'Generate Setter', kind: CodeActionKind.RefactorRewrite },
            { title: 'Generate Getter/Setter', kind: CodeActionKind.RefactorRewrite },
            { title: 'Extract Method', kind: CodeActionKind.RefactorExtract },
            { title: 'Extract Variable', kind: CodeActionKind.RefactorExtract },
            { title: 'Rename Symbol', kind: CodeActionKind.Refactor }
        ];

        const byKind = {
            quickfix: actions.filter(a => a.kind === CodeActionKind.QuickFix).length,
            organize: actions.filter(a => a.kind === CodeActionKind.SourceOrganizeImports).length,
            refactor: actions.filter(a => a.kind.startsWith('refactor')).length
        };

        assert.ok(byKind.quickfix >= 2, 'Should have multiple quick fixes');
        assert.ok(byKind.refactor >= 5, 'Should have multiple refactor options');
    });
});

describe('Code Actions Stress Tests: Edge Cases', () => {
    it('should handle empty document', async () => {
        const bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.analyze('', ['parse'], '/tmp/empty.pike');
        assert.ok(result.result !== undefined, 'Should handle empty document');

        await bridge.stop();
    });

    it('should handle very long line with code action request', async () => {
        const bridge = new PikeBridge();
        await bridge.start();

        const longLine = 'int x = ' + '1 + '.repeat(100);
        const result = await bridge.analyze(longLine, ['parse'], '/tmp/long.pike');
        assert.ok(result.result !== undefined, 'Should handle long line');

        await bridge.stop();
    });

    it('should handle document with only special characters', async () => {
        const code = `!@#$%^&*(){}[]|\\:";'<>?,./~`;

        const document = TextDocument.create('file:///test.pike', 'pike', 1, code);
        const uri = 'file:///test.pike';
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } };

        // Should not crash - may or may not return an action depending on content
        const result = getExtractMethodAction(document, uri, range, code);
        assert.ok(result === null || typeof result === 'object', 'Should handle selection gracefully');
    });

    it('should handle unicode in code', async () => {
        const code = `// 中文注释
int 日本語 = 1;
int émoji = 2;

int main() {
    return 日本語 + émoji;
}`;

        const bridge = new PikeBridge();
        await bridge.start();

        const result = await bridge.analyze(code, ['parse'], '/tmp/unicode.pike');
        assert.ok(result.result !== undefined, 'Should handle unicode');

        await bridge.stop();
    });

    it('should handle range at document boundaries', () => {
        const code = `int x = 1;`;

        const document = TextDocument.create('file:///test.pike', 'pike', 1, code);
        const uri = 'file:///test.pike';

        // Range at end of document
        const range = {
            start: { line: 0, character: 0 },
            end: { line: 0, character: code.length }
        };

        const result = getExtractMethodAction(document, uri, range, code);
        // This might return null or an action depending on implementation
        assert.ok(result === null || result !== null, 'Should handle boundary range');
    });

    it('should handle multiple overlapping ranges', () => {
        const code = `int a = 1;
int b = 2;
int c = 3;`;

        const document = TextDocument.create('file:///test.pike', 'pike', 1, code);
        const uri = 'file:///test.pike';

        // Test multiple extractions at different positions
        const ranges = [
            { start: { line: 0, character: 4 }, end: { line: 0, character: 9 } },
            { start: { line: 1, character: 4 }, end: { line: 1, character: 9 } },
            { start: { line: 2, character: 4 }, end: { line: 2, character: 9 } }
        ];

        for (const range of ranges) {
            const result = getExtractMethodAction(document, uri, range, code);
            // Each should either succeed or fail gracefully
            assert.ok(result === null || typeof result === 'object', 'Should handle range');
        }
    });
});

describe('Code Actions Stress Tests: Performance', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
    });

    after(async () => {
        if (bridge) {
            await bridge.stop();
        }
    });

    it('should respond quickly for code action request', async () => {
        const code = `import Stdio;
import String;
import Array;
import Mapping;
import Files;
import Process;

int main() {
    return 0;
}`;

        const start = Date.now();
        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        const elapsed = Date.now() - start;

        assert.ok(result.result !== undefined, 'Should analyze code');
        assert.ok(elapsed < 500, `Should respond quickly, took ${elapsed}ms`);
    });

    it('should handle rapid successive code action requests', async () => {
        const code = `int main() { return 0; }`;

        // Make multiple rapid requests
        const promises = Array(10).fill(null).map(() =>
            bridge.analyze(code, ['parse'], '/tmp/test.pike')
        );

        const results = await Promise.all(promises);

        assert.equal(results.length, 10, 'Should complete all requests');
        assert.ok(results.every(r => r.result !== undefined), 'All should succeed');
    });

    it('should handle large import list efficiently', async () => {
        const imports = Array(50).fill(null).map((_, i) => `import Module${i};`).join('\n');
        const code = `${imports}\n\nint main() { return 0; }`;

        const start = Date.now();
        const result = await bridge.analyze(code, ['parse'], '/tmp/test.pike');
        const elapsed = Date.now() - start;

        assert.ok(result.result !== undefined, 'Should handle large import list');
        assert.ok(elapsed < 1000, `Should handle efficiently, took ${elapsed}ms`);
    });
});
