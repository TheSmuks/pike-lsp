import { PikeBridge } from './packages/pike-bridge/dist/index.js';

const bridge = new PikeBridge({ debug: false });
await bridge.start();
bridge.on('stderr', () => {});

// Test with Connection class directly
const testCode = `
//! TDS Connection class
class Connection {
  //! Send a packet
  InPacket send_packet(Packet p, int flag, int|void last) {
    return 0;
  }

  //! Another method
  void test_method() {}
}
`;

const result = await bridge.parse(testCode, 'test.pike');
console.log('Symbols found:', result.symbols.length);
result.symbols.forEach((s, i) => {
  console.log(`  [${i}] name="${s.name}", kind=${s.kind}`);
});

await bridge.stop();
