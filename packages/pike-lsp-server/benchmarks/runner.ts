import { run, bench, group, summary } from 'mitata';
import { PikeBridge } from '@pike-lsp/pike-bridge';

async function runBenchmarks() {
  group('LSP Server Foundations', () => {
    bench('PikeBridge.start() [Cold Start]', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.stop();
    });

    bench('Cold Start + First Request (getVersionInfo)', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.getVersionInfo();
      await bridge.stop();
    });

    bench('Cold Start + Introspect', async () => {
      const bridge = new PikeBridge();
      await bridge.start();
      await bridge.introspect('int x;', 'test.pike');
      await bridge.stop();
    });
  });

  await run();
}

runBenchmarks().catch(console.error);
