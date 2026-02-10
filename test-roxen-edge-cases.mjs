import { PikeBridge } from './packages/pike-bridge/dist/src/index.js';

const EDGE_CASE_TESTS = `
// Test 1: Bitwise OR on module types
inherit "module";
constant module_type = MODULE_TAG | MODULE_FILTER | MODULE_LOCATION;

// Test 2: All TYPE_ constants
defvar("string_var", "", TYPE_STRING, "String variable");
defvar("int_var", 0, TYPE_INT, "Integer variable");
defvar("float_var", 0.0, TYPE_FLOAT, "Float variable");
defvar("file_var", "", TYPE_FILE, "File variable");
defvar("dir_var", "", TYPE_DIR, "Directory variable");
defvar("flag_var", 1, TYPE_FLAG, "Flag variable");
defvar("string_list_var", ({}), TYPE_STRING_LIST, "String list");
defvar("int_list_var", ({}), TYPE_INT_LIST, "Integer list");
defvar("dir_list_var", ({}), TYPE_DIR_LIST, "Directory list");
defvar("file_list_var", ({}), TYPE_FILE_LIST, "File list");
defvar("location_var", "", TYPE_LOCATION, "Location");
defvar("text_var", "", TYPE_TEXT_FIELD, "Text field");
defvar("password_var", "", TYPE_PASSWORD, "Password");
defvar("module_var", 0, TYPE_MODULE, "Module reference");
defvar("url_var", "", TYPE_URL, "URL");
defvar("url_list_var", ({}), TYPE_URL_LIST, "URL list");

// Test 3: VAR flag combinations
defvar("expert_var", "", TYPE_STRING, "Expert", VAR_EXPERT);
defvar("more_var", "", TYPE_STRING, "More", VAR_MORE);
defvar("developer_var", "", TYPE_STRING, "Developer", VAR_DEVELOPER);
defvar("initial_var", "", TYPE_STRING, "Initial", VAR_INITIAL);
defvar("invisible_var", "", TYPE_STRING, "Invisible", VAR_INVISIBLE);
defvar("public_var", "", TYPE_STRING, "Public", VAR_PUBLIC);

// Test 4: RXML.Tag class inheritance
class MyTag {
    inherit RXML.Tag;
    void create(string name, mapping args) {
        ::create(name, args);
    }
}

// Test 5: RequestID property access
void test_request_id(RequestID id) {
    string var = id->variables["var"];
    string conf = id->config["conf"];
    string addr = id->remoteaddr;
    string query = id->query_string;
    string meth = id->method;
    string prot = id->protocol;
    string url = id->raw_url;
    string not_q = id->not_query;
    string virt = id->virtfile;
    string rest_q = id->rest_of_query;
    int t = id->time;
    int hr = id->hrtime;
    string q = id->query;
    string h = id->host;
    string rf = id->realfile;
    string pr = id->prot;
    string cp = id->clientprot;
    string auth = id->rawauth;
    int since = id->since;
    mixed data = id->data;
    string left = id->leftovers;
    mapping misc = id->misc;
    mapping conn = id->connection_misc;
    mapping cookies = id->real_cookies;

    // Test RequestID methods
    mapping vars = id->get_variables();
    string qs = id->get_query();
    string m = id->get_method();
    string p = id->get_protocol();
    int max = id->get_max_cache();
    id->set_max_cache(3600);
    id->lower_max_cache(1800);
    id->raise_max_cache(7200);
    string base = id->url_base();
    string scheme = id->client_scheme();
}

// Test 6: RXML.Tag and TagSet usage
string simpletag_test(mapping args, RequestID id) {
    return "test";
}

class TestModule {
    inherit "module";
    constant module_type = MODULE_TAG;
}
`;

async function test() {
    const bridge = new PikeBridge();
    await bridge.start();

    try {
        console.log('Testing Roxen edge cases...');

        const result = await bridge.analyze(EDGE_CASE_TESTS, ['parse', 'introspect'], '/tmp/test-edge-cases.pike');

        if (result.result) {
            console.log('✓ All edge case code compiles successfully');

            // Check for undefined identifier errors
            const parse = result.result.parse;
            if (parse && parse.diagnostics) {
                const errors = parse.diagnostics.filter(d =>
                    d.message && d.message.includes('Undefined identifier')
                );

                if (errors.length > 0) {
                    console.log('✗ FAILED: Undefined identifier errors:');
                    errors.forEach(e => console.log('  Line', d.position.line, ':', e.message));
                    process.exit(1);
                } else {
                    console.log('✓ No undefined identifier errors');
                }
            }

            console.log('✓ Edge case tests PASSED');
        } else if (result.failures?.parse) {
            console.log('✗ Parse failed:', result.failures.parse.message);
            process.exit(1);
        } else {
            console.log('✗ Unexpected result structure');
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
