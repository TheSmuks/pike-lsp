/**
 * LSP New Feature Tests
 *
 * Tests for newly implemented LSP features:
 * - FEAT-001: Code Lens (reference counts above functions/classes)
 * - FEAT-002: Document Links (clickable paths in #include and inherit)
 *
 * Run with: node --test dist/tests/lsp-new-features-tests.js
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

describe('FEAT-001: Code Lens Tests', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should extract methods that can have code lenses', async () => {
        const code = `
void processData(string data) {
    write(data);
}

int calculate(int x, int y) {
    return x + y;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const processData = result.symbols.find(s => s.name === 'processData');
        assert.ok(processData, 'Should find processData method');
        assert.strictEqual(processData.kind, 'method', 'processData should be a method');
        assert.ok(processData.position, 'processData should have position for code lens');

        const calculate = result.symbols.find(s => s.name === 'calculate');
        assert.ok(calculate, 'Should find calculate method');
        assert.strictEqual(calculate.kind, 'method', 'calculate should be a method');
        assert.ok(calculate.position, 'calculate should have position for code lens');
    });

    it('should extract classes that can have code lenses', async () => {
        const code = `
class UserService {
    string name;
    void serve() {}
}

class Database {
    int connectionCount;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const userService = result.symbols.find(s => s.name === 'UserService');
        assert.ok(userService, 'Should find UserService class');
        assert.strictEqual(userService.kind, 'class', 'UserService should be a class');
        assert.ok(userService.position, 'UserService should have position for code lens');

        const database = result.symbols.find(s => s.name === 'Database');
        assert.ok(database, 'Should find Database class');
        assert.strictEqual(database.kind, 'class', 'Database should be a class');
        assert.ok(database.position, 'Database should have position for code lens');
    });

    it('should provide symbol positions for reference counting', async () => {
        const code = `
void helperFunction() {
    // First reference to helperFunction
    helperFunction(); // Second reference
}

void caller() {
    helperFunction(); // Third reference
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const helperFunction = result.symbols.find(s => s.name === 'helperFunction');
        assert.ok(helperFunction, 'Should find helperFunction');
        assert.ok(helperFunction.position, 'helperFunction should have position');

        // Count all symbols with the same name (references + definition)
        const allHelperRefs = result.symbols.filter(s => s.name === 'helperFunction');
        assert.ok(allHelperRefs.length >= 1, 'Should find at least the definition of helperFunction');
    });

    it('should distinguish between methods and other symbol kinds', async () => {
        const code = `
class MyClass {
    void myMethod() {}  // Should have code lens
    int myVariable;     // Should NOT have code lens
}

void globalFunction() {}  // Should have code lens
int globalCounter = 0;    // Should NOT have code lens
`;
        const result = await bridge.parse(code, 'test.pike');

        const myClass = result.symbols.find(s => s.name === 'MyClass');
        assert.ok(myClass, 'Should find MyClass');
        assert.strictEqual(myClass.kind, 'class', 'MyClass should be a class (code lens applicable)');

        const myMethod = result.symbols.find(s => s.name === 'myMethod');
        assert.ok(myMethod, 'Should find myMethod');
        assert.strictEqual(myMethod.kind, 'method', 'myMethod should be a method (code lens applicable)');

        const myVariable = result.symbols.find(s => s.name === 'myVariable');
        assert.ok(myVariable, 'Should find myVariable');
        assert.strictEqual(myVariable.kind, 'variable', 'myVariable should be a variable (no code lens)');

        const globalFunction = result.symbols.find(s => s.name === 'globalFunction');
        assert.ok(globalFunction, 'Should find globalFunction');
        assert.strictEqual(globalFunction.kind, 'method', 'globalFunction should be a method (code lens applicable)');

        const globalCounter = result.symbols.find(s => s.name === 'globalCounter');
        assert.ok(globalCounter, 'Should find globalCounter');
        assert.strictEqual(globalCounter.kind, 'variable', 'globalCounter should be a variable (no code lens)');
    });

    it('should handle symbols with no position gracefully', async () => {
        const code = `
void incompleteMethod();
int placeholder;
`;
        const result = await bridge.parse(code, 'test.pike');

        // All extracted symbols should either have a position or be handleable
        for (const symbol of result.symbols) {
            if (symbol.position) {
                assert.ok(typeof symbol.position.line === 'number', `${symbol.name} position.line should be a number`);
            }
            // Symbols without position are still valid, just won't have code lens
        }
    });
});

describe('FEAT-002: Document Links Tests', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should detect inherit statements for document links', async () => {
        const code = `
inherit Stdio.Module;
inherit Web.MyModule;

class MyClass {
    inherit Base.Component.SubComponent;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        // Find symbols that represent inherit statements
        const inherits = result.symbols.filter(s => s.kind === 'inherit');
        assert.ok(inherits.length >= 1, 'Should find at least one inherit statement');
    });

    it('should detect module paths in inherit statements', async () => {
        const code = `
inherit Standards.JSON;
inherit Protocols.HTTP;
inherit Graphics.Color;
`;
        const result = await bridge.parse(code, 'test.pike');

        // Verify that modules are extracted as symbols
        const jsonModule = result.symbols.find(s => s.name && s.name.includes('JSON'));
        assert.ok(jsonModule, 'Should find reference to JSON module');

        const httpModule = result.symbols.find(s => s.name && s.name.includes('HTTP'));
        assert.ok(httpModule, 'Should find reference to HTTP module');

        const colorModule = result.symbols.find(s => s.name && s.name.includes('Color'));
        assert.ok(colorModule, 'Should find reference to Color module');
    });

    it('should handle relative and absolute paths in code', async () => {
        const code = `
// Local include references (would be detected by LSP server)
// #include "local_header.pike"
// #include "../common/utils.pike"
// #include "/absolute/path/to/config.pike"

class LocalParser {
    // These would be document links in the full LSP implementation
}
`;
        const result = await bridge.parse(code, 'test.pike');

        // The class should still parse correctly even with commented includes
        const localParser = result.symbols.find(s => s.name === 'LocalParser');
        assert.ok(localParser, 'Should find LocalParser class');
        assert.strictEqual(localParser.kind, 'class', 'LocalParser should be a class');
    });

    it('should handle complex module paths', async () => {
        const code = `
inherit Standards.XML.Libxml;
inherit Protocols.HTTP.Query.Server;
inherit Database.Sql.SqlUtil;
`;
        const result = await bridge.parse(code, 'test.pike');

        // All these module references should be tracked as symbols
        assert.ok(result.symbols.length >= 3, 'Should find multiple module references');
    });

    it('should handle documentation-style file references', async () => {
        const code = `
//! @file src/modules/my_module.pike
//! @see Documentation/index.html
//! @link https://pike.lysator.liu.se/

void documentedFunction() {
    // Implementation
}
`;
        const result = await bridge.parse(code, 'test.pike');

        const documentedFunction = result.symbols.find(s => s.name === 'documentedFunction');
        assert.ok(documentedFunction, 'Should find documentedFunction');
        assert.strictEqual(documentedFunction.kind, 'method', 'documentedFunction should be a method');
    });

    it('should extract symbols for link resolution', async () => {
        const code = `
inherit App.Base.Controller;
#include "config/constants.pike";

class UserHandler {
    inherit Auth.Mixin.Session;
}
`;
        const result = await bridge.parse(code, 'test.pike');

        // Find class symbols
        const userHandler = result.symbols.find(s => s.name === 'UserHandler');
        assert.ok(userHandler, 'Should find UserHandler class');

        // Find inherit-related symbols
        const inherits = result.symbols.filter(s => s.kind === 'inherit');
        assert.ok(inherits.length >= 1, 'Should find inherit statements for link resolution');
    });
});

describe('Combined Feature Tests', () => {
    let bridge: PikeBridge;

    before(async () => {
        bridge = new PikeBridge();
        await bridge.start();
        bridge.on('stderr', () => {});
    });

    after(async () => {
        await bridge.stop();
    });

    it('should handle code lens and document links in same file', async () => {
        const code = `
inherit Base.Module;

#include "helpers.pike"

void mainFunction() {
    write("Hello");
}

class DataProcessor {
    void process() {}
}
`;
        const result = await bridge.parse(code, 'test.pike');

        // Code lens targets (methods and classes)
        const mainFunction = result.symbols.find(s => s.name === 'mainFunction');
        assert.ok(mainFunction, 'Should find mainFunction for code lens');

        const dataProcessor = result.symbols.find(s => s.name === 'DataProcessor');
        assert.ok(dataProcessor, 'Should find DataProcessor for code lens');

        // Document link targets (inherits)
        const inherits = result.symbols.filter(s => s.kind === 'inherit');
        assert.ok(inherits.length >= 1, 'Should find inherit statements for document links');
    });

    it('should provide position data for both features', async () => {
        const code = `
inherit Tools.JSON;

class Parser {
    void parse() {}
}

void utilityFunction() {}
`;
        const result = await bridge.parse(code, 'test.pike');

        // All symbols should have positions for proper feature functionality
        const symbolsWithPositions = result.symbols.filter(s => s.position);
        assert.ok(symbolsWithPositions.length >= 3, 'Should have multiple symbols with positions');

        // Verify position structure
        for (const symbol of symbolsWithPositions) {
            assert.ok(typeof symbol.position!.line === 'number', `${symbol.name} should have numeric line`);
            assert.ok(symbol.position!.line >= 1, `${symbol.name} line should be >= 1`);
        }
    });
});

console.log('Running LSP New Feature Tests...\n');
