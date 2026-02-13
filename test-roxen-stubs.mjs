import { PikeBridge } from './packages/pike-bridge/dist/src/index.js';

const BRIDGE_TEST_CODE = `
// Test Roxen framework API usage
class TestRoxen {
    void test_request_id() {
        RequestID id = RequestID();
        id->variables = ([]);
        id->config = ([]);
        id->set_max_cache(3600);
        string base = id->url_base();
    }
    
    void test_tag() {
        Tag t = Tag("mytag", ([]));
        TagSet ts = TagSet("myset", ({t}));
        ts->add_tag(t);
    }
    
    void test_constants() {
        int mt = MODULE_TAG | MODULE_LOCATION | MODULE_FILTER;
        int st = TYPE_STRING | TYPE_INT | TYPE_FLOAT;
    }
}
`;

async function test() {
    const bridge = new PikeBridge();
    await bridge.start();
    
    try {
        console.log('Testing Roxen code compilation...');
        
        // Use analyze() method with correct signature
        const result = await bridge.analyze(BRIDGE_TEST_CODE, ['parse', 'introspect'], '/tmp/test-roxen.pike');
        
        if (result.result) {
            console.log('✓ Roxen code compiles successfully (stubs working)');

            if (result.result.diagnostics) {
                console.log('  Total diagnostics:', result.result.diagnostics.length);
                const roxenErrors = result.result.diagnostics.filter(d =>
                    d.message && d.message.includes('Undefined identifier') &&
                    (d.message.includes('RequestID') || d.message.includes('Tag') ||
                     d.message.includes('MODULE_') || d.message.includes('TYPE_') ||
                     d.message.includes('RXML') || d.message.includes('TagSet'))
                );
                if (roxenErrors.length > 0) {
                    console.log('✗ FAILED: Roxen undefined identifier errors found:');
                    roxenErrors.forEach(e => console.log('  -', e.message));
                    process.exit(1);
                } else {
                    console.log('✓ No Roxen-related undefined identifier errors (stubs working!)');
                }
            } else {
                console.log('✓ No diagnostics (clean compilation)');
            }
        } else {
            console.log('Result result?:', result.result);
            console.log('Result failures?:', result.failures);
            console.log('✗ FAILED: Compilation failed');
            process.exit(1);
        }
    } finally {
        await bridge.stop();
    }
}

test().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
