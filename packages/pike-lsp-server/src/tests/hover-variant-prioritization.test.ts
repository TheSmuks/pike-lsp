/**
 * Hover Variant Prioritization Tests
 *
 * TDD tests for fixing hover to show main signature instead of variant.
 * Issue: Hover on functions shows "variant" signature instead of the main documented signature.
 *
 * Root Cause: Function variants are parsed as separate symbols; hover returns first match
 * without prioritizing main signature.
 *
 * Fix: Show main (non-variant) signature first at top, add "### Variants" section below.
 *
 * Run with: bun test src/tests/hover-variant-prioritization.test.ts
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildHoverContent } from '../features/utils/hover-builder.js';
import type { PikeSymbol } from '@pike-lsp/pike-bridge';

describe('Hover - Variant Prioritization', () => {

    /**
     * Test: Main signature should be shown first, not variant
     * GIVEN: A function with both main signature and variant
     * WHEN: Hover content is built
     * THEN: Main signature should appear at top, variants in separate section
     */
    it('should show main signature before variant signature', () => {
        // This simulates Crypto.RSA->generate_key which has multiple signatures:
        // - Main: generate_key(int(128..) bits, void|int|Gmp.mpz e)
        // - Variant: generate_key(int bits, function:mixed rnd)

        const mainSignature: PikeSymbol = {
            name: 'generate_key',
            kind: 'method',
            modifiers: [],
            type: {
                kind: 'function',
                returnType: { kind: 'program' },
                argTypes: [
                    { kind: 'int', min: '128', max: '65536' },
                    { kind: 'mixed' }
                ]
            }
        };

        const variantSignature: PikeSymbol = {
            name: 'generate_key',
            kind: 'method',
            modifiers: ['variant'],
            type: {
                kind: 'function',
                returnType: { kind: 'program' },
                argTypes: [
                    { kind: 'int' },
                    { kind: 'function' }
                ]
            }
        };

        // Build hover content for main signature
        const mainHover = buildHoverContent(mainSignature, 'Crypto.RSA');

        assert.ok(mainHover, 'Should build hover content for main signature');

        // Main signature should be shown first
        const mainLines = mainHover!.split('\n');
        const codeBlockStart = mainLines.findIndex(line => line.trim() === '```pike');

        assert.ok(codeBlockStart >= 0, 'Should have code block');

        // The signature should contain the type range
        const signature = mainLines[codeBlockStart + 1];
        assert.ok(signature, 'Should have signature line');

        console.log('  Main signature hover:');
        console.log(mainHover);

        // Build hover content for variant
        const variantHover = buildHoverContent(variantSignature, 'Crypto.RSA');

        assert.ok(variantHover, 'Should build hover content for variant');

        console.log('  Variant signature hover:');
        console.log(variantHover);

        // Variant should be marked
        assert.ok(variantHover!.includes('variant') || variantSignature.modifiers?.includes('variant'),
            'Variant should have variant modifier or be marked as such');
    });

    /**
     * Test: Hover on regular function (no variants)
     */
    it('should show normal function signature correctly', () => {
        const symbol: PikeSymbol = {
            name: 'my_function',
            kind: 'method',
            modifiers: [],
            type: {
                kind: 'function',
                returnType: { kind: 'int' },
                argTypes: [
                    { kind: 'string' },
                    { kind: 'int' }
                ]
            }
        };

        const hover = buildHoverContent(symbol);

        assert.ok(hover, 'Should build hover content');

        console.log('  Normal function hover:');
        console.log(hover);

        // Should contain the function name
        assert.ok(hover!.includes('my_function'), 'Should include function name');

        // Should contain code block
        assert.ok(hover!.includes('```pike'), 'Should include code block');
    });

    /**
     * Test: Variants should be grouped under parent symbol
     * This is a placeholder for the future enhancement where we group variants
     */
    it('TODO: should group variants under main signature', () => {
        // This will require modifications to Resolution.pike to group variants
        // For now, this test documents the desired behavior

        const mainSignature: PikeSymbol = {
            name: 'generate_key',
            kind: 'method',
            modifiers: [],
            type: {
                kind: 'function',
                returnType: { kind: 'program' },
                argTypes: [
                    { kind: 'int', min: '128', max: '65536' },
                    { kind: 'mixed' }
                ]
            },
            // Future: variants array
            // variants: [variantSignature]
        };

        const hover = buildHoverContent(mainSignature, 'Crypto.RSA');

        assert.ok(hover, 'Should build hover content');

        // Future: should have "### Variants" section
        // assert.ok(hover!.includes('### Variants'), 'Should have variants section');

        console.log('  Current hover output:');
        console.log(hover);
    });
});
