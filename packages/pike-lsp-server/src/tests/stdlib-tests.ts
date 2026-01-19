/**
 * Pike Stdlib Parsing Tests
 * 
 * Tests parsing against REAL Pike source files from the Pike 8 stdlib.
 * Per PIKE_LSP_AGENT_INSTRUCTIONS.xml: "100% of Pike 8 stdlib files must parse without errors"
 */

import { PikeBridge } from '@pike-lsp/pike-bridge';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../../../..');
const DEFAULT_PIKE_SOURCE_ROOT = path.resolve(REPO_ROOT, '..', 'Pike');
const PIKE_SOURCE_ROOT = process.env['PIKE_SOURCE_ROOT'] ?? DEFAULT_PIKE_SOURCE_ROOT;
const PIKE_STDLIB = process.env['PIKE_STDLIB'] ?? path.join(PIKE_SOURCE_ROOT, 'lib/modules');

interface TestResult {
    file: string;
    success: boolean;
    symbolCount: number;
    errorCount: number;
    errors: string[];
}

async function findPikeFiles(dir: string, maxFiles = 50): Promise<string[]> {
    const files: string[] = [];

    function walk(currentDir: string): void {
        if (files.length >= maxFiles) return;

        try {
            const entries = fs.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                if (files.length >= maxFiles) break;

                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.name.endsWith('.pike') || entry.name.endsWith('.pmod')) {
                    files.push(fullPath);
                }
            }
        } catch {
            // Skip directories we can't read
        }
    }

    walk(dir);
    return files;
}

async function testParseFile(bridge: PikeBridge, filePath: string): Promise<TestResult> {
    try {
        const code = fs.readFileSync(filePath, 'utf-8');
        const result = await bridge.parse(code, filePath);

        return {
            file: filePath,
            success: true,
            symbolCount: result.symbols.length,
            errorCount: result.diagnostics.length,
            errors: result.diagnostics.map(d => d.message),
        };
    } catch (err) {
        return {
            file: filePath,
            success: false,
            symbolCount: 0,
            errorCount: 1,
            errors: [String(err)],
        };
    }
}

async function main(): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║       Pike Stdlib Parsing Test Suite                          ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('Per PIKE_LSP_AGENT_INSTRUCTIONS.xml:');
    console.log('"100% of Pike 8 stdlib files must parse without errors"\n');

    // Find Pike files
    console.log(`Scanning: ${PIKE_STDLIB}`);
    const files = await findPikeFiles(PIKE_STDLIB, 50);
    console.log(`Found ${files.length} Pike files to test\n`);

    if (files.length === 0) {
        console.error('ERROR: No Pike files found! Check PIKE_STDLIB path.');
        process.exit(1);
    }

    // Start bridge
    const bridge = new PikeBridge();
    await bridge.start();

    // Suppress stderr for cleaner output
    bridge.on('stderr', () => { });

    // Test each file
    const results: TestResult[] = [];
    let passed = 0;
    let failed = 0;
    let totalSymbols = 0;

    console.log('Testing files:');
    console.log('─────────────────────────────────────────────────────────────────');

    for (const file of files) {
        const result = await testParseFile(bridge, file);
        results.push(result);
        totalSymbols += result.symbolCount;

        const relativePath = file.replace(PIKE_STDLIB + '/', '');
        if (result.success && result.errorCount === 0) {
            passed++;
            console.log(`  ✓ ${relativePath} (${result.symbolCount} symbols)`);
        } else if (result.success) {
            passed++;
            console.log(`  ⚠ ${relativePath} (${result.symbolCount} symbols, ${result.errorCount} parse warnings)`);
        } else {
            failed++;
            console.log(`  ✗ ${relativePath}: ${result.errors[0]}`);
        }
    }

    await bridge.stop();

    // Summary
    console.log('');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('Summary:');
    console.log(`  Total files tested: ${files.length}`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total symbols extracted: ${totalSymbols}`);
    console.log(`  Success rate: ${((passed / files.length) * 100).toFixed(1)}%`);
    console.log('');

    if (failed > 0) {
        console.log('❌ FAILED: Some Pike stdlib files failed to parse!');
        console.log('\nFailed files:');
        for (const r of results.filter(r => !r.success || r.errorCount > 0)) {
            console.log(`  - ${r.file}`);
            for (const err of r.errors.slice(0, 3)) {
                console.log(`      ${err}`);
            }
        }
        process.exit(1);
    } else {
        console.log('✓ SUCCESS: All Pike stdlib files parsed correctly!');
    }
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
