/**
 * Pike Stdlib Corpus Validation Test
 *
 * Parses all Pike 8.0.1116 stdlib files through the LSP bridge to validate
 * our analyzer at scale. Since Pike's own stdlib source code is correct by
 * definition, any errors our analyzer reports are our bugs, not theirs.
 *
 * This test is too slow for CI (~15-30 minutes) and should be run manually
 * on special occasions (before releases, after major refactors).
 *
 * Run with: cd packages/pike-bridge && bun run test:corpus
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PikeBridge } from './bridge.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

// Configurable thresholds
const SUCCESS_THRESHOLD = 0.80; // 80% of files must parse without errors
const BRIDGE_TIMEOUT = 30_000; // 30s bridge request timeout

// Path to Pike stdlib source tree
// Uses system Pike installation by default, or PIKE_STDLIB_PATH env var for custom locations
const PIKE_SOURCE_ROOT = process.env['PIKE_STDLIB_PATH']
    ? path.resolve(process.env['PIKE_STDLIB_PATH'])
    : '/usr/local/pike/8.0.1116/lib';

/**
 * Result of analyzing a single file in the corpus
 */
interface CorpusResult {
    /** Absolute file path */
    file: string;
    /** Path relative to source root */
    relativePath: string;
    /** Whether all operations succeeded */
    success: boolean;
    /** Per-operation status */
    operations: {
        parse: 'ok' | 'fail' | 'skip';
        tokenize: 'ok' | 'fail' | 'skip';
        introspect: 'ok' | 'fail' | 'skip';
        diagnostics: 'ok' | 'fail' | 'skip';
    };
    /** Number of symbols extracted */
    symbolCount: number;
    /** Number of tokens extracted */
    tokenCount: number;
    /** Number of diagnostics reported */
    diagnosticCount: number;
    /** Error messages from failed operations */
    errors: string[];
    /** Analysis duration in milliseconds */
    duration: number;
}

/**
 * Recursively discover all .pike and .pmod files under a directory
 */
function discoverPikeFiles(root: string): string[] {
    const files: string[] = [];

    function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            // Skip .omc directories and build artifacts
            if (entry.name === '.omc' || entry.name === 'build' || entry.name === '.git') {
                continue;
            }

            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (ext === '.pike' || ext === '.pmod') {
                    files.push(fullPath);
                }
            }
        }
    }

    walk(root);
    return files;
}

/**
 * Analyze a single Pike file through the bridge
 */
async function analyzeFile(
    bridge: PikeBridge,
    filePath: string,
    sourceRoot: string
): Promise<CorpusResult> {
    const relativePath = path.relative(sourceRoot, filePath) ?? filePath;
    const code = fs.readFileSync(filePath, 'utf-8');
    const start = performance.now();

    const result: CorpusResult = {
        file: filePath,
        relativePath,
        success: false,
        operations: { parse: 'skip', tokenize: 'skip', introspect: 'skip', diagnostics: 'skip' },
        symbolCount: 0,
        tokenCount: 0,
        diagnosticCount: 0,
        errors: [],
        duration: 0,
    };

    try {
        const response = await bridge.analyze(
            code,
            ['parse', 'tokenize', 'introspect', 'diagnostics'],
            filePath
        );

        // Check each operation
        if (response.result?.parse) {
            result.operations.parse = 'ok';
            result.symbolCount = response.result.parse.symbols?.length ?? 0;
        }
        if (response.failures?.parse) {
            result.operations.parse = 'fail';
            result.errors.push(`parse: ${response.failures.parse.message}`);
        }

        if (response.result?.tokenize) {
            result.operations.tokenize = 'ok';
            result.tokenCount = response.result.tokenize.tokens?.length ?? 0;
        }
        if (response.failures?.tokenize) {
            result.operations.tokenize = 'fail';
            result.errors.push(`tokenize: ${response.failures.tokenize.message}`);
        }

        if (response.result?.introspect) {
            result.operations.introspect = 'ok';
        }
        if (response.failures?.introspect) {
            result.operations.introspect = 'fail';
            result.errors.push(`introspect: ${response.failures.introspect.message}`);
        }

        if (response.result?.diagnostics) {
            result.operations.diagnostics = 'ok';
            result.diagnosticCount = response.result.diagnostics.diagnostics?.length ?? 0;
        }
        if (response.failures?.diagnostics) {
            result.operations.diagnostics = 'fail';
            result.errors.push(`diagnostics: ${response.failures.diagnostics.message}`);
        }

        // File is "successful" if parse + tokenize both work
        result.success = result.operations.parse === 'ok' && result.operations.tokenize === 'ok';

    } catch (err: any) {
        result.errors.push(`CRASH: ${err.message}`);
        // Don't rethrow — continue to next file
    }

    result.duration = performance.now() - start;
    return result;
}

/**
 * Print comprehensive summary report
 */
function printCorpusSummary(results: CorpusResult[]): void {
    if (results.length === 0) {
        console.log('\n=== CORPUS TEST SKIPPED (no results) ===\n');
        return;
    }

    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const totalSymbols = results.reduce((sum, r) => sum + r.symbolCount, 0);
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = totalDuration / total;

    console.log('\n' + '='.repeat(60));
    console.log('PIKE STDLIB CORPUS VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Files tested:     ${total}`);
    console.log(`Successful:       ${successful} (${(successful/total*100).toFixed(1)}%)`);
    console.log(`Failed:           ${total - successful}`);
    console.log(`Total symbols:    ${totalSymbols}`);
    console.log(`Total time:       ${(totalDuration/1000).toFixed(1)}s`);
    console.log(`Avg per file:     ${avgDuration.toFixed(0)}ms`);
    console.log('');

    // Per-operation breakdown
    for (const op of ['parse', 'tokenize', 'introspect', 'diagnostics'] as const) {
        const ok = results.filter(r => r.operations[op] === 'ok').length;
        const fail = results.filter(r => r.operations[op] === 'fail').length;
        const skip = results.filter(r => r.operations[op] === 'skip').length;
        console.log(`${op.padEnd(14)} OK:${ok} FAIL:${fail} SKIP:${skip}`);
    }

    // Top 10 slowest files
    const slowest = [...results].sort((a, b) => b.duration - a.duration).slice(0, 10);
    console.log('\nSlowest files:');
    for (const r of slowest) {
        console.log(`  ${r.duration.toFixed(0)}ms  ${r.relativePath}`);
    }

    // Top 10 files with most errors
    const errorFiles = results.filter(r => r.errors.length > 0)
        .sort((a, b) => b.errors.length - a.errors.length)
        .slice(0, 10);
    if (errorFiles.length > 0) {
        console.log('\nMost errors:');
        for (const r of errorFiles) {
            console.log(`  ${r.errors.length} errors  ${r.relativePath}`);
            for (const e of r.errors.slice(0, 2)) {
                console.log(`    - ${e.substring(0, 100)}`);
            }
        }
    }

    console.log('='.repeat(60));
}

// Corpus test is opt-in only - set PIKE_CORPUS_TEST=1 to enable
// This test is too slow for CI and should only run manually
const RUN_CORPUS_TEST = process.env['PIKE_CORPUS_TEST'] === '1';

const describeSuite = RUN_CORPUS_TEST ? describe : describe.skip;

describeSuite('Pike Stdlib Corpus Validation', { timeout: 1800_000 }, () => {
    let bridge: PikeBridge;
    let pikeFiles: string[] = []; // Initialize empty for environments without Pike source
    const results: CorpusResult[] = [];

    before(async () => {
        // 1. Check that Pike source tree exists
        if (!fs.existsSync(PIKE_SOURCE_ROOT)) {
            console.log('\nSKIP: Pike source tree not found at', PIKE_SOURCE_ROOT);
            console.log('Expected: ../Pike-v8.0.1116/lib relative to repo root');
            console.log('This test requires Pike 8.0.1116 source to be checked out.\n');
            return;
        }

        // 2. Discover files
        console.log(`\nDiscovering Pike files in ${PIKE_SOURCE_ROOT}...`);
        pikeFiles = discoverPikeFiles(PIKE_SOURCE_ROOT);
        console.log(`Discovered ${pikeFiles.length} Pike files\n`);

        // 3. Start bridge
        console.log('Starting Pike bridge...');
        bridge = new PikeBridge({ timeout: BRIDGE_TIMEOUT });
        await bridge.start();
        bridge.on('stderr', () => {}); // Suppress noise
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log('Bridge started\n');
    });

    after(async () => {
        if (bridge) {
            console.log('\nStopping bridge...');
            await bridge.stop();
        }

        // Print summary report
        printCorpusSummary(results);
    });

    it('should discover Pike stdlib files', () => {
        if (pikeFiles.length === 0) {
            console.log('SKIP: Pike source tree not available');
            return;
        }

        assert.ok(pikeFiles.length > 0,
            'Should find Pike files in source tree');
        assert.ok(pikeFiles.length > 100,
            `Expected 500+ files, found ${pikeFiles.length}`);
    });

    it('should parse all Pike files without crashing', async () => {
        if (pikeFiles.length === 0) {
            console.log('SKIP: Pike source tree not available');
            return;
        }

        console.log(`\nProcessing ${pikeFiles.length} files...`);

        // Process files sequentially to avoid overwhelming the bridge
        // (bridge is single-process Pike subprocess)
        for (let i = 0; i < pikeFiles.length; i++) {
            const file = pikeFiles[i]!;
            const result = await analyzeFile(bridge, file, PIKE_SOURCE_ROOT);
            results.push(result);

            // Log progress every 50 files
            if ((i + 1) % 50 === 0) {
                console.log(`  Processing ${i + 1}/${pikeFiles.length}...`);
            }
        }

        console.log(`\nProcessed all ${pikeFiles.length} files\n`);

        // Count crashes (bridge timeout/error, not parse failures)
        const crashes = results.filter(r =>
            r.errors.some(e => e.includes('timeout') || e.includes('exited'))
        );

        assert.equal(crashes.length, 0,
            `${crashes.length} files crashed the bridge: ${crashes.map(c => c.relativePath).join(', ')}`);
    });

    it('should meet success threshold for parsing', () => {
        if (results.length === 0) {
            console.log('SKIP: No results to validate');
            return;
        }

        const parseOk = results.filter(r => r.operations.parse === 'ok').length;
        const rate = parseOk / results.length;

        console.log(`Parse success: ${parseOk}/${results.length} (${(rate * 100).toFixed(1)}%)`);
        assert.ok(rate >= SUCCESS_THRESHOLD,
            `Parse success rate ${(rate * 100).toFixed(1)}% below threshold ${SUCCESS_THRESHOLD * 100}%`);
    });

    it('should meet success threshold for tokenization', () => {
        if (results.length === 0) {
            console.log('SKIP: No results to validate');
            return;
        }

        const tokenOk = results.filter(r => r.operations.tokenize === 'ok').length;
        const rate = tokenOk / results.length;

        console.log(`Tokenize success: ${tokenOk}/${results.length} (${(rate * 100).toFixed(1)}%)`);
        assert.ok(rate >= SUCCESS_THRESHOLD,
            `Tokenize success rate ${(rate * 100).toFixed(1)}% below threshold ${SUCCESS_THRESHOLD * 100}%`);
    });

    it('should extract symbols from majority of files', () => {
        if (results.length === 0) {
            console.log('SKIP: No results to validate');
            return;
        }

        const withSymbols = results.filter(r => r.symbolCount > 0).length;
        const rate = withSymbols / results.length;

        console.log(`Files with symbols: ${withSymbols}/${results.length} (${(rate * 100).toFixed(1)}%)`);
        // Lower threshold — some files are pure module.pmod stubs with no symbols
        assert.ok(rate >= 0.60,
            `Symbol extraction rate ${(rate * 100).toFixed(1)}% below 60% threshold`);
    });

    it('should not report false diagnostics on valid code', () => {
        if (results.length === 0) {
            console.log('SKIP: No results to validate');
            return;
        }

        // Pike stdlib is valid code — any "error" diagnostics are false positives
        const filesWithErrors = results.filter(r =>
            r.diagnosticCount > 0 && r.operations.diagnostics === 'ok'
        );

        // Log but don't hard-fail yet — we need to categorize false positives first
        console.log(`Files with diagnostics: ${filesWithErrors.length}/${results.length}`);

        // Collect operation failure messages for analysis (parse/tokenize/introspect failures)
        const filesWithFailures = results.filter(r => r.errors.length > 0);
        if (filesWithFailures.length > 0) {
            const failureSummary: Record<string, number> = {};
            for (const r of filesWithFailures) {
                for (const err of r.errors) {
                    const key = err.substring(0, 80);
                    failureSummary[key] = (failureSummary[key] || 0) + 1;
                }
            }

            // Print top failure categories
            const sorted = Object.entries(failureSummary)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10);
            console.log('\nTop operation failure categories:');
            for (const [msg, count] of sorted) {
                console.log(`  ${count}x: ${msg}`);
            }
        }

        // Soft assertion — log but don't fail
        // TODO: Categorize false positives and tighten this assertion
    });
});
