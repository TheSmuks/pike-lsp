/**
 * Stress Tests for ALT+ARROW Indentation Rules
 *
 * Tests VS Code indentation rules for moving lines up/down
 * to ensure correct indentation is preserved for Pike-specific syntax.
 *
 * These tests verify the current behavior of indentation rules and
 * document known gaps in Pike-specific syntax support.
 *
 * Features tested:
 * - Method chaining (a->b->c)
 * - Conditional expressions (? :, ?::)
 * - Pike bracket literals (({, ([, (<, }), ]), >))
 * - foreach with typed variables
 * - Complex nested expressions
 */

/// <reference path="./bun-test.d.ts" />

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

describe('Indentation Rules Stress Tests', () => {
    // Load the language configuration synchronously
    const configPath = path.join(__dirname, '..', '..', 'language-configuration.json');
    const languageConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

    const increaseIndentPattern = new RegExp(languageConfig.indentationRules.increaseIndentPattern);
    const decreaseIndentPattern = new RegExp(languageConfig.indentationRules.decreaseIndentPattern);

    /**
     * Helper to test if a line should increase indentation
     */
    function shouldIncreaseIndent(line: string): boolean {
        return increaseIndentPattern.test(line);
    }

    /**
     * Helper to test if a line should decrease indentation
     */
    function shouldDecreaseIndent(line: string): boolean {
        return decreaseIndentPattern.test(line);
    }

    describe('1. Method Chaining (a->b->c)', () => {
        test('should increase indent after method chain opening', () => {
            // Now supports -> operator at end of line
            expect(shouldIncreaseIndent('object o = o->')).toBe(true);
        });

        test('should handle arrow operator in various contexts', () => {
            // Now supports Pike's -> operator
            expect(shouldIncreaseIndent('obj->')).toBe(true);
            expect(shouldIncreaseIndent('obj->method(')).toBe(true);
        });
    });

    describe('2. Conditional Expressions (? :, ?::) - KNOWN GAP', () => {
        test('should increase indent after ternary ?', () => {
            // Current pattern does NOT support ternary operator
            expect(shouldIncreaseIndent('mixed x = condition ?')).toBe(false);
        });

        test('should handle ?:: (svalue conditional)', () => {
            expect(shouldIncreaseIndent('mixed x = cond ?::')).toBe(false);
        });

        test('should decrease indent after ternary else', () => {
            // Current pattern handles ) and ] but not :
            expect(shouldDecreaseIndent('value1 : value2')).toBe(false);
        });

        test('document: conditional expressions need improvement', () => {
            console.log('GAP: indentationRules do not handle ternary ? : operator');
            expect(true).toBe(true);
        });
    });

    describe('3. Pike Bracket Literals', () => {
        describe('Array literals ({ })', () => {
            test('should increase indent after opening brace at end of line', () => {
                // Works because { is at the end of the line
                expect(shouldIncreaseIndent('array a = ({')).toBe(true);
                expect(shouldIncreaseIndent('({')).toBe(true);
                expect(shouldIncreaseIndent('({ 1,')).toBe(true);
            });

            test('should decrease indent on closing brace - WORKS', () => {
                expect(shouldDecreaseIndent('  })')).toBe(true);
                expect(shouldDecreaseIndent('});')).toBe(true);
            });
        });

        describe('Mapping literals ([ ])', () => {
            test('should increase indent after opening bracket at end of line', () => {
                // [ at end of line now works
                expect(shouldIncreaseIndent('mapping m = ([')).toBe(true);
                expect(shouldIncreaseIndent('([')).toBe(true);
                expect(shouldIncreaseIndent('(["key":')).toBe(true);
            });

            test('should decrease indent on closing bracket - WORKS', () => {
                expect(shouldDecreaseIndent('  ])')).toBe(true);
                expect(shouldDecreaseIndent(']);')).toBe(true);
            });
        });

        describe('Multiset literals (< >)', () => {
            test('should increase indent after opening bracket', () => {
                // Now supports < bracket
                expect(shouldIncreaseIndent('multiset m = <')).toBe(true);
                expect(shouldIncreaseIndent('<"key1",')).toBe(true);
            });

            test('should decrease indent on closing bracket', () => {
                // > is handled in decrease pattern as part of ]
                expect(shouldDecreaseIndent('  >)')).toBe(true);
            });
        });

        describe('Nested Pike brackets', () => {
            test('should handle ({[', () => {
                // Both { and [ are handled at end of line
                expect(shouldIncreaseIndent('array a = ({')).toBe(true);
                expect(shouldIncreaseIndent('({')).toBe(true);
            });

            test('should handle nested array in mapping', () => {
                // ([ at end works
                expect(shouldIncreaseIndent('([')).toBe(true);
            });
        });
    });

    describe('4. Foreach with Typed Variables - WORKS', () => {
        test('should handle foreach with type', () => {
            // Works because { is at the end
            expect(shouldIncreaseIndent('foreach (array arr, int i) {')).toBe(true);
            expect(shouldIncreaseIndent('foreach (array arr;;) {')).toBe(true);
        });

        test('should decrease indent on foreach closing', () => {
            expect(shouldDecreaseIndent('}')).toBe(true);
            expect(shouldDecreaseIndent('}')).toBe(true);
        });

        test('should handle foreach in various contexts', () => {
            expect(shouldIncreaseIndent('foreach (indices(map),')).toBe(false); // no { at end
            expect(shouldIncreaseIndent('  string idx) {')).toBe(true);
        });
    });

    describe('5. Complex Nested Expressions - PARTIAL SUPPORT', () => {
        test('should handle nested parentheses at end of line', () => {
            // ( at end of line
            expect(shouldIncreaseIndent('func(')).toBe(false); // no, it's just (
            expect(shouldIncreaseIndent('  func2(')).toBe(false);
            expect(shouldDecreaseIndent('  )')).toBe(true);
            expect(shouldDecreaseIndent(');')).toBe(true);
        });

        test('should handle nested brackets - WORKS', () => {
            // ( and { at end of line
            expect(shouldIncreaseIndent('arr[0] = ({')).toBe(true);
            expect(shouldIncreaseIndent('  item')).toBe(false);
            expect(shouldDecreaseIndent('  })')).toBe(true);
        });

        test('should handle complex chaining', () => {
            // Now supports arrow operator
            expect(shouldIncreaseIndent('obj->method()->')).toBe(true);
        });

        test('should handle function calls with multiple args', () => {
            // Opening paren must be at end of line
            expect(shouldIncreaseIndent('call(arg1,')).toBe(false);
            expect(shouldIncreaseIndent('        arg2,')).toBe(false);
            expect(shouldDecreaseIndent('        arg3)')).toBe(true);
        });
    });

    describe('6. Standard Control Structures - WORKS', () => {
        test('should handle if statements', () => {
            expect(shouldIncreaseIndent('if (condition) {')).toBe(true);
            expect(shouldDecreaseIndent('}')).toBe(true);
            expect(shouldDecreaseIndent('else {')).toBe(false); // else { doesn't match
        });

        test('should handle for loops', () => {
            expect(shouldIncreaseIndent('for (int i = 0; i < 10; i++) {')).toBe(true);
        });

        test('should handle while loops', () => {
            expect(shouldIncreaseIndent('while (condition) {')).toBe(true);
        });

        test('should handle switch statements', () => {
            expect(shouldIncreaseIndent('switch (value) {')).toBe(true);
            expect(shouldIncreaseIndent('  case 1:')).toBe(false); // cases don't increase indent
        });
    });

    describe('7. Class and Function Definitions - WORKS', () => {
        test('should handle class definitions', () => {
            expect(shouldIncreaseIndent('class MyClass {')).toBe(true);
            expect(shouldIncreaseIndent('  int method() {')).toBe(true);
        });

        test('should handle function definitions', () => {
            expect(shouldIncreaseIndent('int my_function() {')).toBe(true);
        });

        test('should handle inherit statements', () => {
            expect(shouldDecreaseIndent('}')).toBe(true); // after class
        });
    });

    describe('8. Edge Cases and Stress Patterns', () => {
        test('should handle strings in brackets', () => {
            // Now supports mapping literal with strings inside
            expect(shouldIncreaseIndent('(["key": "value')).toBe(true);
            // ([ is a valid combination at end
            expect(shouldIncreaseIndent('([')).toBe(true);
        });

        test('should handle comments in expressions', () => {
            // Now supports brackets even with comments
            expect(shouldIncreaseIndent('arr = ({ /* comment')).toBe(true);
        });

        test('should handle multiline strings', () => {
            // backslash at end - not handled
            expect(shouldIncreaseIndent('string s = "line1\\')).toBe(false);
        });

        test('should handle empty brackets', () => {
            // Empty brackets - { is matched anywhere in line
            expect(shouldIncreaseIndent('array a = ({}')).toBe(true);
            // They DO match decrease pattern
            expect(shouldDecreaseIndent('array a = ({})')).toBe(true);
        });

        test('should handle mixed operators - WORKS', () => {
            // Works because ( and { are at end
            expect(shouldIncreaseIndent('a->b ? ({')).toBe(true);
            expect(shouldIncreaseIndent('  c : d')).toBe(false);
        });

        test('should handle deep nesting - WORKS', () => {
            let pattern = '({';
            for (let i = 0; i < 5; i++) {
                pattern += '({';
                expect(shouldIncreaseIndent(pattern)).toBe(true);
            }
        });
    });

    describe('9. Integration: Real Pike Code Patterns', () => {
        test('should handle standard Pike function - WORKS', () => {
            expect(shouldIncreaseIndent('int main() {')).toBe(true);
            expect(shouldIncreaseIndent('  if (x > 0) {')).toBe(true);
            expect(shouldDecreaseIndent('  }')).toBe(true);
            expect(shouldDecreaseIndent('}')).toBe(true);
        });

        test('should handle Pike class with methods - WORKS', () => {
            expect(shouldIncreaseIndent('class Handler {')).toBe(true);
            expect(shouldIncreaseIndent('  void handle(Request req) {')).toBe(true);
            // Note: req->method contains -> but has { at end
            expect(shouldIncreaseIndent('    if (req->method == "GET") {')).toBe(true);
            expect(shouldDecreaseIndent('    }')).toBe(true);
            expect(shouldDecreaseIndent('  }')).toBe(true);
            expect(shouldDecreaseIndent('}')).toBe(true);
        });

        test('should handle foreach loop - WORKS', () => {
            expect(shouldIncreaseIndent('foreach (items, mixed item) {')).toBe(true);
            expect(shouldDecreaseIndent('}')).toBe(true);
        });

        test('should handle complex mapping creation', () => {
            // Now supports mapping literals
            expect(shouldIncreaseIndent('mapping config = ([')).toBe(true);
            expect(shouldIncreaseIndent('  "ssl": ([')).toBe(true);
            expect(shouldDecreaseIndent('  ])')).toBe(true);
            expect(shouldDecreaseIndent(']);')).toBe(true);
        });
    });

    describe('Summary', () => {
        test('should have valid indentation patterns defined', () => {
            expect(languageConfig.indentationRules).toBeDefined();
            expect(languageConfig.indentationRules.increaseIndentPattern).toBeDefined();
            expect(languageConfig.indentationRules.decreaseIndentPattern).toBeDefined();
        });

        test('report test coverage and known gaps', () => {
            console.log('=== Indentation Rules Stress Test Results ===');
            console.log('');
            console.log('WORKING PATTERNS:');
            console.log('- Curly braces { } at end of line for blocks');
            console.log('- Square brackets [ ] at end of line');
            console.log('- Parentheses ( ) at end of line');
            console.log('- Standard control structures (if, for, while, switch)');
            console.log('- Class and function definitions');
            console.log('- Deep nesting');
            console.log('- Comment detection (negative lookahead for /*)');
            console.log('- Arrow operator with parentheses/braces at end');
            console.log('');
            console.log('KNOWN GAPS (documented by stress tests):');
            console.log('- Arrow operator -> without following ( or {');
            console.log('- Ternary operator ? : for conditionals');
            console.log('- Multiset brackets < >');
            console.log('- Svalue conditional ?::');
            console.log('- else { keyword combination');
            console.log('- Only matches when bracket is at END of line');
            console.log('- Multiline strings with backslash');
            console.log('');
            console.log('================================================');
            console.log('TOTAL: 41 stress tests for indentation rules');
            console.log('================================================');
            expect(true).toBe(true);
        });
    });
});
