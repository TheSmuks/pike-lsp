import { PikeBridge } from './src/bridge.js';

const bridge = new PikeBridge();
await bridge.start();
await new Promise(r => setTimeout(r, 200));

const code = `
inherit "module";
constant module_type = MODULE_LOCATION;
string query_location() {
    return "/path";
}
`;

const result = await bridge.roxenValidate(code, 'test.pike');
console.log('Diagnostics:', JSON.stringify(result.diagnostics, null, 2));

await bridge.stop();
