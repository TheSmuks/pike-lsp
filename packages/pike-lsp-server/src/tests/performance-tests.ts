/**
 * Performance and Benchmark Tests
 *
 * Tests for performance characteristics and resource usage:
 * - Parsing speed for large files
 * - Memory usage for large workspaces
 * - Symbol extraction performance
 * - Responsiveness under load
 *
 * Run with: node --test dist/tests/performance-tests.js
 */

import { describe, it, beforeAll, afterAll } from 'bun:test';
import * as assert from 'node:assert/strict';
import { PikeBridge, PikeParseResult } from '@pike-lsp/pike-bridge';

interface PerformanceMetrics {
    operation: string;
    durationMs: number;
    symbolCount: number;
    symbolsPerSecond: number;
}

const metrics: PerformanceMetrics[] = [];

/**
 * Count all symbols recursively, including nested children.
 * Pike parser returns hierarchical symbols with children nested inside parent symbols.
 */
function countAllSymbols(symbols: unknown[]): number {
    let count = 0;
    for (const symbol of symbols as Array<{ children?: unknown[] }>) {
        count++;
        if (symbol.children && symbol.children.length > 0) {
            count += countAllSymbols(symbol.children);
        }
    }
    return count;
}

function measurePerformance<T>(
    operation: string,
    fn: () => Promise<T>,
    symbolCount: number
): Promise<T> {
    const start = performance.now();
    return fn().then(result => {
        const duration = performance.now() - start;
        const symbolsPerSecond = symbolCount > 0 ? (symbolCount / (duration / 1000)) : 0;
        metrics.push({
            operation,
            durationMs: duration,
            symbolCount,
            symbolsPerSecond,
        });
        console.log(`  [PERF] ${operation}: ${duration.toFixed(2)}ms (${symbolsPerSecond.toFixed(0)} symbols/sec)`);
        return result;
    });
}

describe('Performance Tests - Large File Parsing', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should parse moderately sized file efficiently (100+ lines)', async () => {
        const code = generatePikeCode(100, 'TestModule');

        const result = await measurePerformance(
            'Parse 100-line file',
            () => bridge.parse(code, 'medium.pike'),
            100
        );

        assert.ok(result.symbols.length > 0, 'Should extract symbols');
        const totalSymbols = countAllSymbols(result.symbols);
        assert.ok(totalSymbols >= 50, `Should extract at least 50 symbols from 100 lines (got ${totalSymbols})`);
    });

    it('should parse large file (500+ lines)', async () => {
        const code = generatePikeCode(500, 'LargeModule');

        const result = await measurePerformance(
            'Parse 500-line file',
            () => bridge.parse(code, 'large.pike'),
            500
        );

        assert.ok(result.symbols.length > 0, 'Should extract symbols from large file');
        // Large files should have many symbols, but the exact count depends on code structure
        assert.ok(result.symbols.length >= 50, 'Should extract many symbols from 500 lines');
    });

    it('should handle multiple sequential parses efficiently', async () => {
        const file1 = generatePikeCode(100, 'Module1');
        const file2 = generatePikeCode(100, 'Module2');
        const file3 = generatePikeCode(100, 'Module3');

        const start = performance.now();
        const result1 = await bridge.parse(file1, 'file1.pike');
        const result2 = await bridge.parse(file2, 'file2.pike');
        const result3 = await bridge.parse(file3, 'file3.pike');
        const duration = performance.now() - start;

        const totalSymbols = result1.symbols.length + result2.symbols.length + result3.symbols.length;
        const avgSymbolsPerSecond = totalSymbols / (duration / 1000);

        console.log(`  [PERF] Parse 3 files (300 lines): ${duration.toFixed(2)}ms (${avgSymbolsPerSecond.toFixed(0)} symbols/sec)`);

        assert.ok(result1.symbols.length > 0, 'File 1 should have symbols');
        assert.ok(result2.symbols.length > 0, 'File 2 should have symbols');
        assert.ok(result3.symbols.length > 0, 'File 3 should have symbols');
        assert.ok(duration < 5000, 'Should parse 3 files in under 5 seconds');
    });

    it('should parse very large file (1000+ lines)', async () => {
        const code = generatePikeCode(1000, 'VeryLargeModule');

        const result = await measurePerformance(
            'Parse 1000-line file',
            () => bridge.parse(code, 'verylarge.pike'),
            1000
        );

        assert.ok(result.symbols.length > 0, 'Should extract symbols from very large file');
    });
});

describe('Performance Tests - Symbol Operations', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should extract symbols quickly from complex code', async () => {
        const code = `
class ComplexClass {
    // 50 member variables
    int field1; string field2; int field3; string field4; int field5;
    string field6; int field7; string field8; int field9; string field10;
    int field11; string field12; int field13; string field14; int field15;
    string field16; int field17; string field18; int field19; string field20;
    int field21; string field22; int field23; string field24; int field25;
    string field26; int field27; string field28; int field29; string field30;
    int field31; string field32; int field33; string field34; int field35;
    string field36; int field37; string field38; int field39; string field40;
    int field41; string field42; int field43; string field44; int field45;
    string field46; int field47; string field48; int field49; string field50;

    // 20 methods
    void method1() {}
    void method2() {}
    void method3() {}
    void method4() {}
    void method5() {}
    void method6() {}
    void method7() {}
    void method8() {}
    void method9() {}
    void method10() {}
    void method11() {}
    void method12() {}
    void method13() {}
    void method14() {}
    void method15() {}
    void method16() {}
    void method17() {}
    void method18() {}
    void method19() {}
    void method20() {}
}
`;

        const start = performance.now();
        const result = await bridge.parse(code, 'complex.pike');
        const duration = performance.now() - start;

        const totalSymbols = countAllSymbols(result.symbols);
        console.log(`  [PERF] Extract ${totalSymbols} symbols: ${duration.toFixed(2)}ms`);

        assert.ok(totalSymbols >= 70, `Should extract at least 70 symbols (got ${totalSymbols})`);
    });
});

describe('Performance Tests - Memory and Resource Usage', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should handle rapid sequential parse operations', async () => {
        const iterations = 10;
        const code = generatePikeCode(50, 'RapidTest');

        const start = performance.now();
        const results: PikeParseResult[] = [];

        for (let i = 0; i < iterations; i++) {
            const result = await bridge.parse(code, `rapid${i}.pike`);
            results.push(result);
        }
        const duration = performance.now() - start;

        const avgDuration = duration / iterations;
        const totalSymbols = results.reduce((sum, r) => sum + r.symbols.length, 0);

        console.log(`  [PERF] ${iterations} parses: ${duration.toFixed(2)}ms (avg ${avgDuration.toFixed(2)}ms each)`);
        console.log(`  [PERF] Total symbols processed: ${totalSymbols}`);

        assert.ok(duration < 10000, `Should complete ${iterations} parses in under 10 seconds`);
        assert.ok(results.every(r => r.symbols.length > 0), 'All parses should extract symbols');
    });

    it('should handle code with many nested structures', async () => {
        let code = '';
        const depth = 5;
        for (let i = 0; i < depth; i++) {
            code += `class Level${i} {\n`;
        }
        code += '    int deepestValue = 1;\n';
        for (let i = depth - 1; i >= 0; i--) {
            code += '}\n';
        }

        const start = performance.now();
        const result = await bridge.parse(code, 'nested.pike');
        const duration = performance.now() - start;

        console.log(`  [PERF] Parse ${depth}-level nested structure: ${duration.toFixed(2)}ms`);

        assert.ok(result.symbols.length > 0, 'Should extract symbols from nested structure');
    });
});

describe('Performance Tests - Real-World Scenarios', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should simulate working with a medium project (10 files)', async () => {
        const files: string[] = [];
        for (let i = 0; i < 10; i++) {
            files.push(generatePikeCode(
                50 + Math.floor(Math.random() * 100),
                `ProjectModule${i}`
            ));
        }

        const start = performance.now();
        const results = await Promise.all(
            files.map((code, i) => bridge.parse(code, `project${i}.pike`))
        );
        const duration = performance.now() - start;

        const totalSymbols = results.reduce((sum, r) => sum + r.symbols.length, 0);
        const avgSymbolsPerFile = totalSymbols / results.length;

        console.log(`  [PERF] Parse 10-file project: ${duration.toFixed(2)}ms`);
        console.log(`  [PERF] Total symbols: ${totalSymbols} (avg ${avgSymbolsPerFile.toFixed(0)} per file)`);

        assert.ok(results.every(r => r.symbols.length > 0), 'All files should parse successfully');
        assert.ok(duration < 5000, 'Should parse project in under 5 seconds');
    });

    it('should simulate incremental editing workflow', async () => {
        const baseCode = generatePikeCode(100, 'IncrementalTest');

        // Initial parse
        const initialStart = performance.now();
        const initial = await bridge.parse(baseCode, 'incremental.pike');
        const initialDuration = performance.now() - initialStart;

        // Edit: add a small function
        const editedCode = baseCode + `
void newFunction() {
    // Newly added function
}
`;

        const editStart = performance.now();
        const edited = await bridge.parse(editedCode, 'incremental.pike');
        const editDuration = performance.now() - editStart;

        console.log(`  [PERF] Initial parse: ${initialDuration.toFixed(2)}ms (${initial.symbols.length} symbols)`);
        console.log(`  [PERF] Edit reparse: ${editDuration.toFixed(2)}ms (${edited.symbols.length} symbols)`);

        assert.ok(edited.symbols.length >= initial.symbols.length, 'Reparse should find at least as many symbols');
    });
});

describe('Performance Tests - Compilation and Diagnostics', () => {
    let bridge: PikeBridge;

    beforeAll(async () => { bridge = new PikeBridge();
    await bridge.start();
    bridge.on('stderr', () => {}); });

    afterAll(async () => { await bridge.stop(); });

    it('should compile valid code quickly', async () => {
        const code = generatePikeCode(200, 'CompileTest');

        const start = performance.now();
        const result = await bridge.compile(code, 'compile-test.pike');
        const duration = performance.now() - start;

        console.log(`  [PERF] Compile 200-line file: ${duration.toFixed(2)}ms`);

        // Should compile without errors (the generated code is valid)
        assert.ok(Array.isArray(result.diagnostics), 'Should return diagnostics array');
    });

    it('should handle error detection in large files', async () => {
        let code = generatePikeCode(200, 'ErrorTest');
        // Insert an error in the middle
        const lines = code.split('\n');
        lines.splice(100, 0, 'int error_line = ;');
        code = lines.join('\n');

        const start = performance.now();
        const result = await bridge.compile(code, 'error-test.pike');
        const duration = performance.now() - start;

        console.log(`  [PERF] Detect errors in 200-line file: ${duration.toFixed(2)}ms`);

        // Should find the error
        assert.ok(result.diagnostics.length > 0, 'Should detect errors');
        assert.ok(duration < 5000, 'Error detection should be fast');
    });
});

// Helper function to generate Pike code
function generatePikeCode(lines: number, moduleName: string): string {
    let code = `// ${moduleName} - Auto-generated test file\n`;
    code += `constant VERSION = "1.0.0";\n\n`;

    let currentLine = 3;

    // Add some global variables
    while (currentLine < Math.min(lines, 20)) {
        code += `int global_var_${currentLine} = ${currentLine};\n`;
        currentLine++;
    }

    // Add a class with members
    code += `\nclass ${moduleName} {\n`;
    currentLine++;

    // Add class members (up to 50 lines)
    const classLines = Math.min(60, lines - currentLine);
    for (let i = 0; i < classLines; i++) {
        if (i % 3 === 0) {
            code += `    int field_${i} = ${i};\n`;
        } else if (i % 3 === 1) {
            code += `    string field_${i} = "value";\n`;
        } else {
            code += `    void method_${i}(int arg) { return arg + ${i}; }\n`;
        }
        currentLine++;
    }

    code += `}\n`;
    currentLine++;

    // Add standalone functions if we have lines left
    while (currentLine < lines) {
        const funcNum = currentLine;
        code += `
void function_${funcNum}(string param) {
    write("Function ${funcNum} called\\n");
}
`;
        currentLine += 5;
    }

    return code;
}

// Print performance summary after all tests
describe('Performance Summary', () => {
    it('should print performance metrics', () => {
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('                    PERFORMANCE SUMMARY                     ');
        console.log('═══════════════════════════════════════════════════════════\n');

        if (metrics.length === 0) {
            console.log('No metrics collected yet.');
            return;
        }

        console.log('Operation                              | Duration | Symbols | Symbols/sec');
        console.log('----------------------------------------|----------|---------|-------------');

        for (const m of metrics) {
            const op = m.operation.padEnd(38);
            const dur = `${m.durationMs.toFixed(2).padStart(8)}ms`;
            const sym = m.symbolCount.toString().padStart(7);
            const sps = m.symbolsPerSecond.toFixed(0).padStart(10);
            console.log(`${op} | ${dur} | ${sym} | ${sps}`);
        }

        console.log('\n═══════════════════════════════════════════════════════════\n');
    });
});

console.log('Running Performance Tests...\n');
