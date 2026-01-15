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

console.log('File size:', code.length);
console.log('First 500 chars:');
console.log(code.substring(0, 500));

const result = await bridge.parse(code, 'tds.pike');
console.log('\n=== Symbols found:', result.symbols.length, '===\n');

result.symbols.forEach((s, i) => {
  console.log(`[${i}] name="${s.name}", kind=${s.kind}, line=${s.position?.line ?? 'N/A'}`);
});

await bridge.stop();
