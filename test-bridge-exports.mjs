import { PikeBridge } from './packages/pike-bridge/dist/src/index.js';

const bridge = new PikeBridge();
console.log('Bridge exports:', Object.keys(bridge));
console.log('Bridge instance:', typeof bridge);
