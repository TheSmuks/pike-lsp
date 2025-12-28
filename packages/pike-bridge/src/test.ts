/**
 * Test script for pike-bridge
 * 
 * Run with: node dist/test.js
 */

import { PikeBridge } from './bridge.js';

async function main(): Promise<void> {
    console.log('Creating Pike bridge...');
    const bridge = new PikeBridge();

    // Log stderr for debugging
    bridge.on('stderr', (msg: string) => {
        console.log('[Pike stderr]:', msg);
    });

    try {
        // Check Pike version
        console.log('\n--- Checking Pike ---');
        const available = await bridge.checkPike();
        console.log('Pike available:', available);

        if (available) {
            const version = await bridge.getVersion();
            console.log('Pike version:', version);
        }

        // Start the bridge
        console.log('\n--- Starting bridge ---');
        await bridge.start();
        console.log('Bridge started');

        // Test parsing
        console.log('\n--- Testing parse ---');
        const parseResult = await bridge.parse(`
int x = 5;
string name = "test";
void hello(string msg) {
  write(msg);
}
class MyClass {
  int value;
}
`, 'test.pike');

        console.log('Parse result:');
        console.log('  Symbols:', parseResult.symbols.length);
        for (const sym of parseResult.symbols) {
            console.log(`    - ${sym.kind}: ${sym.name}`);
        }
        console.log('  Diagnostics:', parseResult.diagnostics.length);

        // Test tokenization
        console.log('\n--- Testing tokenize ---');
        const tokens = await bridge.tokenize('int x = 5;');
        console.log('Tokens:', tokens.length);
        console.log('  First 5:', tokens.slice(0, 5).map(t => t.text).join(', '));

        // Test compilation with error
        console.log('\n--- Testing compile (with error) ---');
        const compileResult = await bridge.compile('int x = ;', 'error.pike');
        console.log('Compile result:');
        console.log('  Diagnostics:', compileResult.diagnostics.length);
        for (const diag of compileResult.diagnostics) {
            console.log(`    - ${diag.severity} at line ${diag.position.line}: ${diag.message}`);
        }

        // Test module resolution
        console.log('\n--- Testing resolve ---');
        const stdioPath = await bridge.resolveModule('Stdio');
        console.log('Stdio module path:', stdioPath);

        console.log('\n--- Stopping bridge ---');
        await bridge.stop();
        console.log('Bridge stopped');

        console.log('\n✓ All tests passed!');

    } catch (error) {
        console.error('Error:', error);
        await bridge.stop();
        process.exit(1);
    }
}

main();
