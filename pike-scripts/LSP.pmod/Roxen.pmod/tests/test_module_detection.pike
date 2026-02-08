//! Test Roxen module detection
//! TDD: These tests must fail before implementation

// Load the module directly
string module_dir = combine_path(__FILE__, "../..");
program RoxenProg = compile_file(module_dir + "/Roxen.pike");

//! Test 1: Detect simple location module
void test_detect_simple_location_module(program Roxen) {
    werror("TEST: test_detect_simple_location_module\n");

    string code = "inherit \"module\";\n" +
    "constant module_type = MODULE_LOCATION;\n" +
    "constant module_name = \"Test Module\";\n" +
    "\n" +
    "void create() {\n" +
    "    defvar(\"mountpoint\", \"/\", \"Mount point\");\n" +
    "}\n" +
    "\n" +
    "mapping|Stdio.File find_file(string path, RequestID id) {\n" +
    "    return 0;\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
    "code": code,
    "filename": "test.pike"
]));

    if (!result->result->is_roxen_module) {
    werror("FAIL: Should detect as Roxen module\n");
    exit(1);
    }

    if (!has_value(result->result->module_type || ({}), "MODULE_LOCATION")) {
    werror("FAIL: Should be MODULE_LOCATION type, got %O\n", result->result->module_type);
    exit(1);
    }

    werror("PASS: test_detect_simple_location_module\n");
}

//! Test 2: Detect tag module
void test_detect_tag_module(program Roxen) {
    werror("TEST: test_detect_tag_module\n");

    string code = "inherit \"module\";\n" +
    "constant module_type = MODULE_TAG;\n" +
    "\n" +
    "string simpletag_foo(mapping args, RequestID id) {\n" +
    "    return \"bar\";\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
    "code": code,
    "filename": "test.pike"
]));

    if (!result->result->is_roxen_module) {
    werror("FAIL: Should detect as Roxen module\n");
    exit(1);
    }

    if (!has_value(result->result->module_type || ({}), "MODULE_TAG")) {
    werror("FAIL: Should be MODULE_TAG type, got %O\n", result->result->module_type);
    exit(1);
    }

    if (sizeof(result->result->tags || ({})) != 1) {
    werror("FAIL: Should have 1 tag, got %d\n", sizeof(result->result->tags || ({})));
    exit(1);
    }

    if (result->result->tags[0]->name != "foo") {
    werror("FAIL: Tag name should be 'foo', got '%s'\n", result->result->tags[0]->name);
    exit(1);
    }

    werror("PASS: test_detect_tag_module\n");
}

//! Test 3: Parse defvar calls
void test_parse_defvar_calls(program Roxen) {
    werror("TEST: test_parse_defvar_calls\n");

    string code = "void create() {\n" +
    "    defvar(\"name\", \"default\", \"Display Name\",\n" +
    "        TYPE_STRING, \"Description\");\n" +
    "    defvar(\"enabled\", 1, \"Enabled\", TYPE_FLAG);\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_vars(([
    "code": code,
    "filename": "test.pike"
]));

    if (sizeof(result->result->variables || ({})) != 2) {
    werror("FAIL: Should have 2 variables, got %d\n", sizeof(result->result->variables || ({})));
    exit(1);
    }

    if (result->result->variables[0]->name != "name") {
    werror("FAIL: First var name should be 'name', got '%s'\n", result->result->variables[0]->name);
    exit(1);
    }

    werror("PASS: test_parse_defvar_calls\n");
}

//! Test 4: Parse tags (simpletag and container)
void test_parse_tags(program Roxen) {
    werror("TEST: test_parse_tags\n");

    string code = "string simpletag_foo(mapping args, RequestID id) {\n" +
    "    return \"bar\";\n" +
    "}\n" +
    "\n" +
    "string container_baz(string contents, mapping args, RequestID id) {\n" +
    "    return \"<parsed>\" + contents + \"</parsed>\";\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_tags(([
    "code": code,
    "filename": "test.pike"
]));

    if (sizeof(result->result->tags || ({})) != 2) {
    werror("FAIL: Should have 2 tags, got %d\n", sizeof(result->result->tags || ({})));
    exit(1);
    }

    if (result->result->tags[0]->name != "foo" || result->result->tags[0]->type != "simple") {
    werror("FAIL: First tag should be simple 'foo', got %O\n", result->result->tags[0]);
    exit(1);
    }

    if (result->result->tags[1]->name != "baz" || result->result->tags[1]->type != "container") {
    werror("FAIL: Second tag should be container 'baz', got %O\n", result->result->tags[1]);
    exit(1);
    }

    werror("PASS: test_parse_tags\n");
}

//! Test 5: Get lifecycle callbacks
void test_get_callbacks(program Roxen) {
    werror("TEST: test_get_callbacks\n");

    string code = "void create() {\n" +
    "    // Module initialization\n" +
    "}\n" +
    "\n" +
    "void start() {\n" +
    "    // Module started\n" +
    "}\n" +
    "\n" +
    "mapping|string handle_request(string path, RequestID id) {\n" +
    "    // Handle request\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->get_callbacks(([
    "code": code,
    "filename": "test.pike"
]));

    array(string) callbacks = result->result->lifecycle->callbacks || ({});

    if (!has_value(callbacks, "create")) {
    werror("FAIL: Should detect create() callback\n");
    exit(1);
    }

    if (!has_value(callbacks, "start")) {
    werror("FAIL: Should detect start() callback\n");
    exit(1);
    }

    werror("PASS: test_get_callbacks\n");
}

//! Main test runner
int main(int argc, array(string) argv) {
    werror("=== Roxen Module Detection Tests ===\n\n");

    test_detect_simple_location_module(RoxenProg);
    test_detect_tag_module(RoxenProg);
    test_parse_defvar_calls(RoxenProg);
    test_parse_tags(RoxenProg);
    test_get_callbacks(RoxenProg);

    werror("\n=== ALL TESTS PASSED ===\n");
    return 0;
}
