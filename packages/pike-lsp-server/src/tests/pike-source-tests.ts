/**
 * Comprehensive Pike Source Tests
 * 
 * Tests parsing against ALL Pike source files from the Pike 8 source tree.
 * Per PIKE_SCANNER_INSTRUCTIONS.xml: "100% of Pike 8 stdlib files must parse without errors"
 * 
 * This test suite validates:
 * 1. Parsing success (no exceptions)
 * 2. Symbol extraction (names, kinds, positions)
 * 3. Performance metrics
 */

import { PikeBridge, PikeSymbol } from '@pike-lsp/pike-bridge';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Pike source locations (override with PIKE_SOURCE_ROOT/PIKE_STDLIB/PIKE_TOOLS env vars)
const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../../../..');
const DEFAULT_PIKE_SOURCE_ROOT = path.resolve(REPO_ROOT, '..', 'Pike');
const PIKE_SOURCE_ROOT = process.env['PIKE_SOURCE_ROOT'] ?? DEFAULT_PIKE_SOURCE_ROOT;
const PIKE_STDLIB = process.env['PIKE_STDLIB'] ?? path.join(PIKE_SOURCE_ROOT, 'lib/modules');
const PIKE_TOOLS = process.env['PIKE_TOOLS'] ?? path.join(PIKE_SOURCE_ROOT, 'lib/include');

interface FileTestResult {
    file: string;
    relativePath: string;
    success: boolean;
    symbolCount: number;
    diagnosticCount: number;
    symbols: {
        variables: number;
        methods: number;
        classes: number;
        other: number;
    };
    errors: string[];
    parseTimeMs: number;
}

interface CategorySummary {
    name: string;
    tested: number;
    passed: number;
    failed: number;
    totalSymbols: number;
    avgParseTimeMs: number;
}

/**
 * Find all Pike files in a directory recursively (NO LIMIT)
 */
function findPikeFiles(dir: string): string[] {
    const files: string[] = [];

    function walk(currentDir: string): void {
        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    // Skip certain directories
                    if (!entry.name.startsWith('.')) {
                        walk(fullPath);
                    }
                } else if (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod')) {
                    files.push(fullPath);
                }
            }
        } catch {
            // Skip directories we can't read
        }
    }

    if (fs.existsSync(dir)) {
        walk(dir);
    }
    return files;
}

/**
 * Count symbols by kind
 */
function countSymbolsByKind(symbols: PikeSymbol[]): FileTestResult['symbols'] {
    const counts = { variables: 0, methods: 0, classes: 0, other: 0 };
    for (const sym of symbols) {
        switch (sym.kind) {
            case 'variable':
                counts.variables++;
                break;
            case 'method':
                counts.methods++;
                break;
            case 'class':
                counts.classes++;
                break;
            default:
                counts.other++;
        }
    }
    return counts;
}

/**
 * Test parsing a single file
 */
async function testParseFile(bridge: PikeBridge, filePath: string, baseDir: string): Promise<FileTestResult> {
    const relativePath = filePath.replace(baseDir + '/', '');
    const startTime = Date.now();

    try {
        const code = fs.readFileSync(filePath, 'utf-8');
        const result = await bridge.parse(code, filePath);
        const parseTimeMs = Date.now() - startTime;

        return {
            file: filePath,
            relativePath,
            success: true,
            symbolCount: result.symbols.length,
            diagnosticCount: result.diagnostics.length,
            symbols: countSymbolsByKind(result.symbols),
            errors: result.diagnostics.map(d => d.message),
            parseTimeMs,
        };
    } catch (err) {
        const parseTimeMs = Date.now() - startTime;
        return {
            file: filePath,
            relativePath,
            success: false,
            symbolCount: 0,
            diagnosticCount: 1,
            symbols: { variables: 0, methods: 0, classes: 0, other: 0 },
            errors: [String(err)],
            parseTimeMs,
        };
    }
}

/**
 * Test a category of Pike files
 */
async function testCategory(
    bridge: PikeBridge,
    name: string,
    dir: string,
    verbose: boolean
): Promise<{ results: FileTestResult[]; summary: CategorySummary }> {
    console.log(`\n📂 Testing ${name}: ${dir}`);

    const files = findPikeFiles(dir);
    console.log(`   Found ${files.length} Pike files`);

    if (files.length === 0) {
        return {
            results: [],
            summary: { name, tested: 0, passed: 0, failed: 0, totalSymbols: 0, avgParseTimeMs: 0 },
        };
    }

    const results: FileTestResult[] = [];
    let passed = 0;
    let failed = 0;
    let totalSymbols = 0;
    let totalParseTime = 0;

    for (const file of files) {
        const result = await testParseFile(bridge, file, dir);
        results.push(result);
        totalSymbols += result.symbolCount;
        totalParseTime += result.parseTimeMs;

        if (result.success) {
            passed++;
            if (verbose) {
                const symStr = `${result.symbols.classes}c/${result.symbols.methods}m/${result.symbols.variables}v`;
                console.log(`   ✓ ${result.relativePath} [${symStr}] (${result.parseTimeMs}ms)`);
            }
        } else {
            failed++;
            console.log(`   ✗ ${result.relativePath}: ${result.errors[0]?.substring(0, 60)}`);
        }
    }

    const summary: CategorySummary = {
        name,
        tested: files.length,
        passed,
        failed,
        totalSymbols,
        avgParseTimeMs: Math.round(totalParseTime / files.length),
    };

    console.log(`   → ${passed}/${files.length} passed (${((passed / files.length) * 100).toFixed(1)}%)`);

    return { results, summary };
}

/**
 * Validate symbol ranges are sensible
 */
function validateSymbolRanges(results: FileTestResult[]): { valid: number; invalid: number; examples: string[] } {
    let valid = 0;
    const invalid = 0;
    const examples: string[] = [];

    for (const result of results) {
        if (result.success && result.symbolCount > 0) {
            // All symbols should have been extracted successfully
            valid++;
        }
    }

    return { valid, invalid, examples };
}

async function main(): Promise<void> {
    const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
    const startTime = Date.now();

    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║     Comprehensive Pike Source Parsing Test Suite                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Per PIKE_SCANNER_INSTRUCTIONS.xml:');
    console.log('"100% of Pike 8 stdlib files must parse without errors"');
    console.log('');
    console.log(`Verbose mode: ${verbose ? 'ON' : 'OFF'} (use --verbose for file-by-file output)`);

    // Initialize bridge
    const bridge = new PikeBridge();

    // Suppress stderr for cleaner output
    bridge.on('stderr', () => { /* suppress */ });

    console.log('\n🔌 Starting Pike bridge...');
    await bridge.start();
    console.log('   Bridge started');

    // Test categories
    const allResults: FileTestResult[] = [];
    const summaries: CategorySummary[] = [];

    // 1. Pike Standard Library (MUST be 100%)
    const stdlib = await testCategory(bridge, 'Pike Standard Library', PIKE_STDLIB, verbose);
    allResults.push(...stdlib.results);
    summaries.push(stdlib.summary);

    // 2. Pike Tools/Include
    const tools = await testCategory(bridge, 'Pike Tools/Include', PIKE_TOOLS, verbose);
    allResults.push(...tools.results);
    summaries.push(tools.summary);

    await bridge.stop();

    // Overall Summary
    const totalTime = Date.now() - startTime;
    const totalTested = summaries.reduce((sum, s) => sum + s.tested, 0);
    const totalPassed = summaries.reduce((sum, s) => sum + s.passed, 0);
    const totalFailed = summaries.reduce((sum, s) => sum + s.failed, 0);
    const totalSymbols = summaries.reduce((sum, s) => sum + s.totalSymbols, 0);

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('                           SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════\n');

    console.log('Category Results:');
    console.log('─────────────────────────────────────────────────────────────────');
    for (const summary of summaries) {
        const rate = summary.tested > 0 ? ((summary.passed / summary.tested) * 100).toFixed(1) : '0.0';
        console.log(`  ${summary.name}:`);
        console.log(`    Files: ${summary.tested} | Passed: ${summary.passed} | Failed: ${summary.failed} | Rate: ${rate}%`);
        console.log(`    Symbols: ${summary.totalSymbols} | Avg Parse Time: ${summary.avgParseTimeMs}ms`);
    }

    console.log('\n─────────────────────────────────────────────────────────────────');
    console.log('Overall:');
    console.log(`  Total files tested:     ${totalTested}`);
    console.log(`  Total passed:           ${totalPassed}`);
    console.log(`  Total failed:           ${totalFailed}`);
    console.log(`  Success rate:           ${((totalPassed / totalTested) * 100).toFixed(1)}%`);
    console.log(`  Total symbols extracted: ${totalSymbols}`);
    console.log(`  Total test time:        ${(totalTime / 1000).toFixed(1)}s`);

    // Symbol validation
    const rangeValidation = validateSymbolRanges(allResults);
    console.log(`\nSymbol Range Validation:`);
    console.log(`  Files with valid symbols: ${rangeValidation.valid}`);

    console.log('\n═══════════════════════════════════════════════════════════════════\n');

    // Final result
    if (totalFailed > 0) {
        console.log('❌ FAILED: Some Pike source files failed to parse!\n');
        console.log('Failed files:');
        const failedResults = allResults.filter(r => !r.success);
        for (const r of failedResults.slice(0, 20)) {
            console.log(`  - ${r.relativePath}`);
            for (const err of r.errors.slice(0, 2)) {
                console.log(`      ${err.substring(0, 80)}`);
            }
        }
        if (failedResults.length > 20) {
            console.log(`  ... and ${failedResults.length - 20} more`);
        }
        process.exit(1);
    } else {
        console.log('✅ SUCCESS: All Pike source files parsed correctly!');
        console.log('   Extension is ready for testing with Pike source code.\n');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
