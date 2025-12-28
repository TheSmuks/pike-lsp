import { PikeBridge } from './packages/pike-bridge/dist/index.js';

const bridge = new PikeBridge({ debug: false });
await bridge.start();
bridge.on('stderr', () => {});

console.log('Testing PERF-002: Batch Parse\n');

// Test 1: Basic batch parse
console.log('Test 1: Basic batch parse');
const files1 = [
    { code: 'int x = 1;', filename: 'test1.pike' },
    { code: 'string s = "hello";', filename: 'test2.pike' },
    { code: 'class Foo { void bar() {} }', filename: 'test3.pike' },
];

const result1 = await bridge.batchParse(files1);
console.log(`  Files processed: ${result1.count}`);
console.log(`  Results: ${result1.results.length}`);
console.log(`  File 1: ${result1.results[0]?.filename}, symbols: ${result1.results[0]?.symbols.length}`);
console.log(`  File 2: ${result1.results[1]?.filename}, symbols: ${result1.results[1]?.symbols.length}`);
console.log(`  File 3: ${result1.results[2]?.filename}, symbols: ${result1.results[2]?.symbols.length}`);

// Test 2: Performance comparison
console.log('\nTest 2: Performance comparison (10 files)');
const files2 = [];
for (let i = 0; i < 10; i++) {
    files2.push({
        code: `int var${i} = ${i};\nstring str${i} = "test${i}";\n`,
        filename: `bench${i}.pike`,
    });
}

// Sequential parse
const seqStart = Date.now();
for (const file of files2) {
    await bridge.parse(file.code, file.filename);
}
const seqTime = Date.now() - seqStart;

// Batch parse
const batchStart = Date.now();
await bridge.batchParse(files2);
const batchTime = Date.now() - batchStart;

console.log(`  Sequential: ${seqTime}ms`);
console.log(`  Batch: ${batchTime}ms`);
console.log(`  Speedup: ${(seqTime / batchTime).toFixed(2)}x`);

await bridge.stop();

console.log('\nBatch parse test complete!');
