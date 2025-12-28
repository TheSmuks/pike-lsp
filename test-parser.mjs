import { PikeBridge } from './packages/pike-bridge/dist/index.js';

const bridge = new PikeBridge({ debug: false });
await bridge.start();
bridge.on('stderr', () => {});

const testCode = `
class TestClass {
  void method1() {}
  void method2() {}
  int variable1;
}
`;

const result = await bridge.parse(testCode, 'test.pike');
console.log('Symbols found:', result.symbols.length);
result.symbols.forEach((s, i) => {
  console.log(`  Symbol ${i}: name="${s.name}", kind=${s.kind}`);
});

await bridge.stop();
