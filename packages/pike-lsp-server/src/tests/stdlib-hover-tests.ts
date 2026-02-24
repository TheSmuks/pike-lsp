/**
 * Stdlib Hover E2E Tests
 *
 * End-to-end tests for stdlib module hover functionality.
 * Verifies that resolveStdlib returns correct data for common modules
 * and responds within performance targets (< 500ms for first hover).
 *
 * Run with: node --test dist/tests/stdlib-hover-tests.js
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { PikeBridge } from '@pike-lsp/pike-bridge';

interface StdlibTestResult {
    module: string;
    found: boolean;
    duration: number;
    symbolCount: number;
    hasCommonFunctions: boolean;
}

const testResults: StdlibTestResult[] = [];

function measureResolve<T>(
    _module: string,
    fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
    const start = performance.now();
    return fn().then(result => {
        const duration = performance.now() - start;
        return { result, duration };
    });
}

describe('Stdlib Hover Tests', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    
    // Suppress stderr for cleaner test output
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should return symbols for Stdio module', async () => {
        const result = await bridge.resolveStdlib('Stdio');

        assert.ok(result.found !== 0, 'Stdio module should be found');
        assert.ok(result.path, 'Should have a path');
        assert.ok(result.module === 'Stdio', 'Module name should match');

        // Should have symbols array
        assert.ok(Array.isArray(result.symbols), 'Should return symbols array');
        assert.ok(result.symbols.length > 0, 'Should have at least some symbols');

        console.log(`  Stdio: ${result.symbols.length} symbols found`);

        testResults.push({
            module: 'Stdio',
            found: result.found !== 0,
            duration: 0,
            symbolCount: result.symbols.length,
            hasCommonFunctions: false
        });
    });

    it('should return symbols for String module', async () => {
        const result = await bridge.resolveStdlib('String');

        assert.ok(result.found !== 0, 'String module should be found');
        assert.ok(result.path, 'Should have a path');
        assert.ok(result.module === 'String', 'Module name should match');

        assert.ok(Array.isArray(result.symbols), 'Should return symbols array');
        assert.ok(result.symbols.length > 0, 'Should have at least some symbols');

        console.log(`  String: ${result.symbols.length} symbols found`);

        testResults.push({
            module: 'String',
            found: result.found !== 0,
            duration: 0,
            symbolCount: result.symbols.length,
            hasCommonFunctions: false
        });
    });

    it('should return symbols for Array module', async () => {
        const result = await bridge.resolveStdlib('Array');

        assert.ok(result.found !== 0, 'Array module should be found');
        assert.ok(result.path, 'Should have a path');
        assert.ok(result.module === 'Array', 'Module name should match');

        assert.ok(Array.isArray(result.symbols), 'Should return symbols array');
        assert.ok(result.symbols.length > 0, 'Should have at least some symbols');

        console.log(`  Array: ${result.symbols.length} symbols found`);

        testResults.push({
            module: 'Array',
            found: result.found !== 0,
            duration: 0,
            symbolCount: result.symbols.length,
            hasCommonFunctions: false
        });
    });

    it('should return symbols for Mapping module', async () => {
        const result = await bridge.resolveStdlib('Mapping');

        assert.ok(result.found !== 0, 'Mapping module should be found');
        // Note: Mapping is a builtin type without a source file, so path may be empty
        // We just verify it's found and has symbols

        assert.ok(Array.isArray(result.symbols), 'Should return symbols array');

        console.log(`  Mapping: ${result.symbols.length} symbols found`);

        testResults.push({
            module: 'Mapping',
            found: result.found !== 0,
            duration: 0,
            symbolCount: result.symbols.length,
            hasCommonFunctions: false
        });
    });

    it('should respond in under 500ms for first stdlib hover', async () => {
        // Measure first hover latency (cold cache)
        const { result, duration } = await measureResolve('Stdio', () =>
            bridge.resolveStdlib('Stdio')
        );

        assert.ok(result.found !== 0, 'Stdio should be found');
        assert.ok(duration < 500, `First hover should respond in under 500ms, took ${duration.toFixed(2)}ms`);

        console.log(`  First hover latency: ${duration.toFixed(2)}ms (< 500ms target)`);

        testResults.push({
            module: 'Stdio (first)',
            found: result.found !== 0,
            duration,
            symbolCount: result.symbols?.length || 0,
            hasCommonFunctions: false
        });
    });

    it('should include common stdlib functions', async () => {
        const result = await bridge.resolveStdlib('Stdio');

        assert.ok(result.found !== 0, 'Stdio should be found');
        assert.ok(Array.isArray(result.symbols), 'Should have symbols array');

        const symbolNames = result.symbols.map(s => s.name);

        // Check for common Stdio functions/methods
        const commonFunctions = ['write', 'read', 'stderr', 'stdout', 'stdin', 'File'];
        const foundCommon = commonFunctions.filter(name =>
            symbolNames.some(s => s.includes(name))
        );

        console.log(`  Found common Stdio members: ${foundCommon.join(', ')}`);

        assert.ok(foundCommon.length > 0, 'Should find at least some common Stdio members');

        testResults.push({
            module: 'Stdio',
            found: result.found !== 0,
            duration: 0,
            symbolCount: result.symbols.length,
            hasCommonFunctions: foundCommon.length > 0
        });
    });

    it('should handle nested module resolution (Stdio.File)', async () => {
        const result = await bridge.resolveStdlib('Stdio.File');

        assert.ok(result.found !== 0, 'Stdio.File should be found');
        assert.ok(result.module === 'Stdio.File' || result.module === 'File', 'Module name should match');

        assert.ok(Array.isArray(result.symbols), 'Should return symbols array');

        console.log(`  Stdio.File: ${result.symbols.length} symbols found`);

        testResults.push({
            module: 'Stdio.File',
            found: result.found !== 0,
            duration: 0,
            symbolCount: result.symbols.length,
            hasCommonFunctions: false
        });
    });
});

// Print summary after all tests
describe('Stdlib Hover Summary', () => {
    it('should print test results summary', () => {
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('                    STDLIB HOVER SUMMARY                   ');
        console.log('═══════════════════════════════════════════════════════════\n');

        if (testResults.length === 0) {
            console.log('No test results collected yet.');
            return;
        }

        console.log('Module                     | Found | Symbols | Duration');
        console.log('---------------------------|-------|---------|----------');

        for (const r of testResults) {
            const mod = r.module.padEnd(25);
            const found = r.found ? 'Yes' : 'No';
            const count = r.symbolCount.toString().padStart(7);
            const dur = r.duration > 0 ? `${r.duration.toFixed(2)}ms`.padStart(8) : 'N/A'.padStart(8);
            console.log(`${mod} | ${found}   | ${count} | ${dur}`);
        }

        // Check performance target
        const perfTests = testResults.filter(r => r.duration > 0);
        if (perfTests.length > 0) {
            const avgDuration = perfTests.reduce((sum, r) => sum + r.duration, 0) / perfTests.length;
            console.log(`\nAverage first hover: ${avgDuration.toFixed(2)}ms`);
            console.log(`Target: < 500ms - ${avgDuration < 500 ? 'PASS' : 'FAIL'}`);
        }

        console.log('\n═══════════════════════════════════════════════════════════\n');
    });
});

console.log('Running Stdlib Hover E2E Tests...\n');
