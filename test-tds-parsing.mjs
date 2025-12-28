import { PikeBridge } from './packages/pike-bridge/dist/index.js';

const bridge = new PikeBridge({ debug: false });
await bridge.start();
bridge.on('stderr', () => {});

// Read the tds.pike file
const fs = await import('fs');
const code = fs.readFileSync('/home/user/Antigravity/Pike LSP/Pike/lib/modules/Sql.pmod/tds.pike', 'utf-8');

console.log('File size:', code.length);
console.log('First 500 chars:');
console.log(code.substring(0, 500));

const result = await bridge.parse(code, 'tds.pike');
console.log('\n=== Symbols found:', result.symbols.length, '===\n');

result.symbols.forEach((s, i) => {
  console.log(`[${i}] name="${s.name}", kind=${s.kind}, line=${s.position?.line ?? 'N/A'}`);
});

await bridge.stop();
