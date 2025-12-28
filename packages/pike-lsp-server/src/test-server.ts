/**
 * Test script for pike-lsp-server
 * 
 * Tests the LSP server by simulating client requests.
 * Run with: node dist/test-server.js
 */

import { PikeBridge } from '@pike-lsp/pike-bridge';

const testCode = `
int x = 5;
string name = "test";
void hello(string msg) {
  write(msg);
}
class MyClass {
  int value;
}
`;

const testCodeWithError = `
int x = ;
`;

async function main(): Promise<void> {
    console.log('Testing Pike LSP Server components...\n');

    const bridge = new PikeBridge();

    bridge.on('stderr', (msg: string) => {
        console.log('[Pike]', msg);
    });

    try {
        // Start the bridge
        console.log('--- Starting Pike Bridge ---');
        await bridge.start();
        console.log('Bridge started\n');

        // Test parse
        console.log('--- Testing Parse (for document symbols) ---');
        const parseResult = await bridge.parse(testCode, 'test.pike');
        console.log('Symbols found:', parseResult.symbols.length);
        for (const sym of parseResult.symbols) {
            const detail = getSymbolDetail(sym);
            console.log(`  ${sym.kind}: ${sym.name}${detail ? ` (${detail})` : ''}`);
        }
        console.log('');

        // Test compile without error
        console.log('--- Testing Compile (valid code) ---');
        const compileResult = await bridge.compile(testCode, 'test.pike');
        console.log('Diagnostics:', compileResult.diagnostics.length);
        console.log('');

        // Test compile with error
        console.log('--- Testing Compile (code with error) ---');
        const errorResult = await bridge.compile(testCodeWithError, 'error.pike');
        console.log('Diagnostics:', errorResult.diagnostics.length);
        for (const diag of errorResult.diagnostics) {
            console.log(`  [${diag.severity}] Line ${diag.position.line}: ${diag.message}`);
        }
        console.log('');

        // Stop the bridge
        console.log('--- Stopping Bridge ---');
        await bridge.stop();
        console.log('Bridge stopped\n');

        console.log('✓ All LSP server components working!');
        console.log('\nThe LSP server is ready for VSCode integration.');

    } catch (err) {
        console.error('Error:', err);
        await bridge.stop();
        process.exit(1);
    }
}

function getSymbolDetail(sym: unknown): string | undefined {
    const s = sym as Record<string, unknown>;
    if (s['returnType']) {
        const returnType = s['returnType'] as { name?: string };
        const argTypes = s['argTypes'] as Array<{ name?: string }> | undefined;
        const args = argTypes?.map(t => t?.name ?? 'mixed').join(', ') ?? '';
        return `${returnType.name ?? 'mixed'}(${args})`;
    }

    if (s['type']) {
        const type = s['type'] as { name?: string };
        return type.name;
    }

    return undefined;
}

main();
