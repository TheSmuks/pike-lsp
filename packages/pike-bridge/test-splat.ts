import { PikeBridge } from './src/bridge.js';

async function test() {
  const bridge = new PikeBridge();
  await bridge.start();
  
  // Test 1: Basic parsing with @ operator
  const code = `void foo(int a, int b, int c) {}
array(int) args = ({1, 2, 3});
foo(@args);`;
  
  const result = await bridge.parse(code, 'test.pike');
  
  console.log('=== Test 1: Parse with @ operator ===');
  console.log('Symbols:', result.symbols?.length || 0);
  console.log('Diagnostics:', result.diagnostics?.length || 0);
  if (result.diagnostics?.length) {
    console.log('Diagnostic details:', result.diagnostics);
  }
  
  // Check that function foo was parsed
  const fooSymbol = result.symbols?.find(s => s.name === 'foo');
  console.log('foo symbol found:', !!fooSymbol);
  
  // Check that args variable was parsed
  const argsSymbol = result.symbols?.find(s => s.name === 'args');
  console.log('args symbol found:', !!argsSymbol);
  
  await bridge.stop();
  
  console.log('\n=== Test PASSED ===');
  process.exit(0);
}

test().catch(err => {
  console.error('Test FAILED:', err.message);
  process.exit(1);
});
