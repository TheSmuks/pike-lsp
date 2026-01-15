import { PikeBridge } from './packages/pike-bridge/dist/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const bridge = new PikeBridge({ debug: false });
await bridge.start();
bridge.on('stderr', () => {});

// Read the tds.pike file (override with PIKE_SOURCE_ROOT or PIKE_STDLIB)
const fs = await import('fs');
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir);
const defaultPikeSourceRoot = path.resolve(repoRoot, '..', 'Pike');
const pikeSourceRoot = process.env['PIKE_SOURCE_ROOT'] ?? defaultPikeSourceRoot;
const pikeStdlib = process.env['PIKE_STDLIB'] ?? path.join(pikeSourceRoot, 'lib/modules');
const tdsPath = path.join(pikeStdlib, 'Sql.pmod', 'tds.pike');
const code = fs.readFileSync(tdsPath, 'utf-8');

console.log('=== Testing Symbol Cache for LSP Features ===\n');

const result = await bridge.parse(code, 'tds.pike');
console.log(`Total symbols parsed: ${result.symbols.length}`);

// Simulate what the LSP server does: build a symbol lookup
const symbolCache = new Map();
for (const symbol of result.symbols) {
    if (symbol.name) {
        if (!symbolCache.has(symbol.name)) {
            symbolCache.set(symbol.name, []);
        }
        symbolCache.get(symbol.name).push(symbol);
    }
}

console.log(`\nUnique symbol names in cache: ${symbolCache.size}`);

// Test symbols the user originally wanted to find
const testSymbols = ['send_packet', 'Connection', 'compile_query', 'big_query'];

console.log('\n=== Symbol Lookup Results ===');
for (const name of testSymbols) {
    const found = symbolCache.has(name);
    const positions = symbolCache.get(name);
    console.log(`"${name}": ${found ? 'FOUND' : 'NOT FOUND'}`);
    if (found && positions) {
        positions.forEach(pos => {
            console.log(`  - kind=${pos.kind}, line=${pos.position?.line ?? 'N/A'}`);
        });
    }
}

// Test what happens when searching for send_packet (like go-to-definition does)
console.log('\n=== Simulating Go-To-Definition for "send_packet" ===');
const sendPacketSymbols = symbolCache.get('send_packet');
if (sendPacketSymbols && sendPacketSymbols.length > 0) {
    console.log('SUCCESS: Definition can be found!');
    sendPacketSymbols.forEach(sym => {
        console.log(`  Definition: kind=${sym.kind}, line=${sym.position?.line}, col=${sym.position?.character ?? 0}`);
    });
} else {
    console.log('FAILED: send_packet not in cache');
}

// Test hover functionality
console.log('\n=== Simulating Hover for "Connection" ===');
const connectionSymbols = symbolCache.get('Connection');
if (connectionSymbols && connectionSymbols.length > 0) {
    console.log('SUCCESS: Can provide hover info!');
    connectionSymbols.forEach(sym => {
        console.log(`  Hover: kind=${sym.kind}, line=${sym.position?.line}`);
        if (sym.documentation) {
            const doc = typeof sym.documentation === 'string'
                ? sym.documentation
                : JSON.stringify(sym.documentation);
            console.log(`  Documentation: "${doc.substring(0, 50)}..."`);
        }
    });
} else {
    console.log('FAILED: Connection not in cache');
}

await bridge.stop();

console.log('\n=== LSP Feature Test Complete ===');
