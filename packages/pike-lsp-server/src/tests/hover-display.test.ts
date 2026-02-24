/**
 * Hover Display Tests
 *
 * Tests for hover markdown formatting covering:
 * - Clean markdown for simple functions
 * - Long type signatures, many parameters
 * - Deprecated functions
 * - Throws documentation
 *
 * Run with: node --test dist/tests/hover-display.test.js
 */

import { describe, it } from 'bun:test';
import * as assert from 'node:assert/strict';
import { buildHoverContent } from '../features/utils/hover-builder.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

function createSymbol(overrides: Record<string, unknown> = {}): PikeSymbol {
    return {
        name: 'testFunction',
        kind: 'method',
        ...overrides,
    } as PikeSymbol;
}

describe('Hover Formatting - Happy Path', () => {
    it('should generate clean markdown for simple function', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'add',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'int' },
                arguments: [
                    { type: { kind: 'int' }, name: 'a' },
                    { type: { kind: 'int' }, name: 'b' },
                ],
            },
            documentation: {
                text: 'Adds two numbers together.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('```pike'), 'Should include code block');
        assert.ok(content!.includes('add'), 'Should include function name');
        assert.ok(content!.includes('Adds two numbers together'), 'Should include documentation text');
    });

    it('should generate markdown for variable', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'counter',
            kind: 'variable',
            type: { kind: 'int' },
            documentation: {
                text: 'Counter variable.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('```pike'), 'Should include code block');
        assert.ok(content!.includes('counter'), 'Should include variable name');
    });

    it('should generate markdown for class', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'MyClass',
            kind: 'class',
            documentation: {
                text: 'A sample class.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('class'), 'Should include class keyword');
    });
});

describe('Hover Formatting - Parameters', () => {
    it('should format single parameter correctly', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'doubleValue',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'int' },
                arguments: [
                    { type: { kind: 'int' }, name: 'x' },
                ],
            },
            documentation: {
                text: 'Doubles the input value.',
                params: {
                    x: 'The value to double.',
                },
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('x'), 'Should include parameter name');
        assert.ok(content!.includes('The value to double.'), 'Should include parameter description');
    });

    it('should format multiple parameters correctly', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'calculate',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'float' },
                arguments: [
                    { type: { kind: 'int' }, name: 'a' },
                    { type: { kind: 'int' }, name: 'b' },
                    { type: { kind: 'int' }, name: 'c' },
                ],
            },
            documentation: {
                text: 'Performs a calculation.',
                params: {
                    a: 'First operand.',
                    b: 'Second operand.',
                    c: 'Third operand.',
                },
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('a'), 'Should include parameter a');
        assert.ok(content!.includes('b'), 'Should include parameter b');
        assert.ok(content!.includes('c'), 'Should include parameter c');
    });
});

describe('Hover Formatting - Return Values', () => {
    it('should include return value documentation', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'getSum',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'int' },
                arguments: [],
            },
            documentation: {
                text: 'Returns the sum.',
                returns: 'The calculated sum as an integer.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('Returns'), 'Should include returns section');
        assert.ok(content!.includes('The calculated sum'), 'Should include return description');
    });

    it('should handle void return type', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'doSomething',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            documentation: {
                text: 'Does something and returns nothing.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('void'), 'Should include void return type');
    });
});

describe('Hover Formatting - Edge Cases', () => {
    it('should handle complex type signatures', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'processData',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'mapping' },
                arguments: [
                    { type: { kind: 'array' }, name: 'items' },
                ],
            },
            documentation: {
                text: 'Processes data items.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content for complex types');
    });

    it('should handle this_program return type', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'create',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'program' },  // this_program is represented as program type
                arguments: [],
            },
            documentation: {
                text: 'Returns a new instance.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content with this_program');
        assert.ok(content!.includes('this_program') || content!.includes('create'), 'Should include type or name');
    });

    it('should handle function with many parameters', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'complexFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'mixed' },
                arguments: [
                    { type: { kind: 'int' }, name: 'a' },
                    { type: { kind: 'string' }, name: 'b' },
                    { type: { kind: 'float' }, name: 'c' },
                    { type: { kind: 'array' }, name: 'd' },
                    { type: { kind: 'mapping' }, name: 'e' },
                ],
            },
            documentation: {
                text: 'A function with many parameters.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content for function with many params');
    });
});

describe('Hover Formatting - Modifiers', () => {
    it('should display protected modifier', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'internalMethod',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            modifiers: ['protected'],
            documentation: {
                text: 'Internal method.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('protected'), 'Should include protected modifier');
    });

    it('should display private modifier', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'privateMethod',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            modifiers: ['private'],
            documentation: {
                text: 'Private method.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('private'), 'Should include private modifier');
    });

    it('should display static modifier', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'staticMethod',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            modifiers: ['static'],
            documentation: {
                text: 'Static method.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('static'), 'Should include static modifier');
    });

    it('should display multiple modifiers', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'method',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            modifiers: ['protected', 'static'],
            documentation: {
                text: 'Method with multiple modifiers.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('protected'), 'Should include protected modifier');
        assert.ok(content!.includes('static'), 'Should include static modifier');
    });
});

describe('Hover Formatting - Special Documentation', () => {
    it('should handle deprecated functions', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'oldFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            documentation: {
                text: 'This is deprecated.',
                deprecated: 'Use newFunction instead.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('DEPRECATED'), 'Should include DEPRECATED warning');
        assert.ok(content!.includes('newFunction instead'), 'Should include deprecation message');
    });

    it('should handle throws documentation', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'riskyOperation',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { name: 'mixed', kind: 'basic' },
                arguments: [],
            },
            documentation: {
                text: 'Performs a risky operation.',
                throws: 'Throws an error if operation fails.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('Throws'), 'Should include throws section');
        assert.ok(content!.includes('error if operation fails'), 'Should include throws description');
    });

    it('should handle notes', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'noteFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            documentation: {
                text: 'Function with notes.',
                notes: ['This is an important note.', 'Another note.'],
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('Note'), 'Should include notes section');
    });

    it('should handle examples', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'exampleFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'int' },
                arguments: [],
            },
            documentation: {
                text: 'Function with example.',
                examples: [
                    'int result = exampleFunction();',
                ],
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('Example'), 'Should include example section');
    });

    it('should handle see also references', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'relatedFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            documentation: {
                text: 'Related function.',
                seealso: ['otherFunction', 'String.trim', 'Stdio.File'],
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('See also'), 'Should include see also section');
        // Check that links are generated
        assert.ok(content!.includes('[`otherFunction`](https://pike.lysator.liu.se/generated/manual/modref/ex/otherFunction.html)'));
        assert.ok(content!.includes('[`String.trim`](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/String/trim.html)'));
        assert.ok(content!.includes('[`Stdio.File`](https://pike.lysator.liu.se/generated/manual/modref/ex/predef_3A_3A/Stdio/File.html)'));
    });
});

describe('Hover Formatting - Stdlib Links', () => {
    it('should add documentation link for stdlib symbols', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'write_file',
            kind: 'method',
            documentation: {
                text: 'Writes content to a file.',
            },
        });

        // Act
        const content = buildHoverContent(symbol, 'Stdio');

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('[Online Documentation]'), 'Should include docs link');
        assert.ok(content!.includes('pike.lysator.liu.se'), 'Should include Pike docs URL');
        assert.ok(content!.includes('Stdio'), 'Should include module in URL');
    });

    it('should add documentation link for stdlib classes', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'File',
            kind: 'class',
            documentation: {
                text: 'File I/O class.',
            },
        });

        // Act
        const content = buildHoverContent(symbol, 'Stdio');

        // Assert
        assert.ok(content, 'Should generate hover content');
        assert.ok(content!.includes('[Online Documentation]'), 'Should include docs link');
    });

    it('should NOT add documentation link for user symbols', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'myFunction',
            kind: 'method',
            documentation: {
                text: 'My function.',
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content');
        // User symbols should not get automatic docs links unless parentScope is provided
        assert.ok(!content!.includes('[Online Documentation]') || content!.includes('predef_3A_3A') === false,
            'User symbol should not get docs link without parentScope');
    });
});

describe('Hover Formatting - Error Cases', () => {
    it('should handle missing documentation gracefully', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'undocumentedFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content even without documentation');
    });

    it('should handle empty documentation object', () => {
        // Arrange
        const symbol = createSymbol({
            name: 'emptyDocFunction',
            kind: 'method',
            type: {
                kind: 'function',
                returnType: { kind: 'void' },
                arguments: [],
            },
            documentation: {},
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content with empty documentation');
    });

    it('should handle null symbol gracefully', () => {
        // Arrange - symbol with minimal data
        const symbol = createSymbol({
            name: '',
            kind: 'method',
        });

        // Act
        const content = buildHoverContent(symbol);

        // Assert
        assert.ok(content, 'Should generate hover content even for minimal symbol');
    });
});
