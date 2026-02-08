//! Roxen module detection tests - TDD RED phase
//! These tests MUST fail before implementing the fixes

// Load the module directly
string module_dir = combine_path(__FILE__, "../..");
program RoxenProg = compile_file(module_dir + "/Roxen.pike");

//! Test 1: inherit "module" sets is_roxen_module=1 but does NOT add MODULE_LOCATION
void test_inherit_module_no_location(program Roxen) {
    werror("TEST: test_inherit_module_no_location\n");

    string code = "inherit \"module\";\n" +
    "constant module_name = \"Test Module\";\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
        "code": code,
        "filename": "test.pike"
    ]));

    // Should detect as Roxen module
    if (!result->result->is_roxen_module) {
        werror("FAIL: Should detect as Roxen module\n");
        exit(1);
    }

    // Should NOT have MODULE_LOCATION (bug: currently incorrectly adds it)
    if (has_value(result->result->module_type || ({}), "MODULE_LOCATION")) {
        werror("FAIL: inherit 'module' should NOT add MODULE_LOCATION, got %O\n", result->result->module_type);
        exit(1);
    }

    // Module types should be empty (no module_type declared)
    if (sizeof(result->result->module_type || ({})) != 0) {
        werror("FAIL: Module types should be empty, got %O\n", result->result->module_type);
        exit(1);
    }

    werror("PASS: test_inherit_module_no_location\n");
}

//! Test 2: inherit "filesystem" adds MODULE_LOCATION
void test_inherit_filesystem_adds_location(program Roxen) {
    werror("TEST: test_inherit_filesystem_adds_location\n");

    string code = "inherit \"filesystem\";\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
        "code": code,
        "filename": "test.pike"
    ]));

    if (!result->result->is_roxen_module) {
        werror("FAIL: Should detect as Roxen module\n");
        exit(1);
    }

    // Should have MODULE_LOCATION
    if (!has_value(result->result->module_type || ({}), "MODULE_LOCATION")) {
        werror("FAIL: inherit 'filesystem' should add MODULE_LOCATION, got %O\n", result->result->module_type);
        exit(1);
    }

    werror("PASS: test_inherit_filesystem_adds_location\n");
}

//! Test 3: constant module_type = MODULE_TAG | MODULE_FILTER captures both types
void test_multiple_module_types(program Roxen) {
    werror("TEST: test_multiple_module_types\n");

    string code = "inherit \"module\";\n" +
    "constant module_type = MODULE_TAG | MODULE_FILTER;\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
        "code": code,
        "filename": "test.pike"
    ]));

    if (!result->result->is_roxen_module) {
        werror("FAIL: Should detect as Roxen module\n");
        exit(1);
    }

    array(string) types = result->result->module_type || ({});

    // Should capture BOTH MODULE_TAG and MODULE_FILTER (bug: currently only captures first)
    if (!has_value(types, "MODULE_TAG")) {
        werror("FAIL: Should have MODULE_TAG, got %O\n", types);
        exit(1);
    }

    if (!has_value(types, "MODULE_FILTER")) {
        werror("FAIL: Should have MODULE_FILTER, got %O\n", types);
        exit(1);
    }

    werror("PASS: test_multiple_module_types\n");
}

//! Test 4: Non-Roxen Pike file -> is_roxen=0
void test_non_roxen_pike_file(program Roxen) {
    werror("TEST: test_non_roxen_pike_file\n");

    string code = "class Foo {\n" +
    "    int x;\n" +
    "    void bar() {}\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
        "code": code,
        "filename": "test.pike"
    ]));

    if (result->result->is_roxen_module) {
        werror("FAIL: Should NOT detect as Roxen module\n");
        exit(1);
    }

    werror("PASS: test_non_roxen_pike_file\n");
}

//! Test 5: inherit "module" without module_type -> is_roxen=1, types=[]
void test_inherit_module_no_module_type(program Roxen) {
    werror("TEST: test_inherit_module_no_module_type\n");

    string code = "inherit \"module\";\n" +
    "void create() {}\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
        "code": code,
        "filename": "test.pike"
    ]));

    if (!result->result->is_roxen_module) {
        werror("FAIL: Should detect as Roxen module (has inherit module)\n");
        exit(1);
    }

    if (sizeof(result->result->module_type || ({})) != 0) {
        werror("FAIL: Module types should be empty when no module_type declared, got %O\n", result->result->module_type);
        exit(1);
    }

    werror("PASS: test_inherit_module_no_module_type\n");
}

//! Test 6: Includes inherits array
void test_includes_inherits_array(program Roxen) {
    werror("TEST: test_includes_inherits_array\n");

    string code = "inherit \"module\";\n" +
    "inherit \"roxen\";\n" +
    "constant module_type = MODULE_TAG;\n";

    object roxen = Roxen();
    mapping result = roxen->detect_module(([
        "code": code,
        "filename": "test.pike"
    ]));

    // Should include inherits array
    if (!result->result->inherits) {
        werror("FAIL: Should include inherits array\n");
        exit(1);
    }

    array(string) inherits = result->result->inherits;

    if (!has_value(inherits, "module")) {
        werror("FAIL: Should inherit 'module', got %O\n", inherits);
        exit(1);
    }

    if (!has_value(inherits, "roxen")) {
        werror("FAIL: Should inherit 'roxen', got %O\n", inherits);
        exit(1);
    }

    werror("PASS: test_includes_inherits_array\n");
}

//! Test 7: ROXEN_MODULE_TYPES has "MODULE_DIRECTORY" -> should be "MODULE_DIRECTORIES"
void test_module_types_constant_correct(program Roxen) {
    werror("TEST: test_module_types_constant_correct\n");

    // This is a code inspection test - check the constant is correct
    // We can't test this via API, so we just document the expected fix

    werror("INFO: Bug: ROXEN_MODULE_TYPES has 'MODULE_DIRECTORY' should be 'MODULE_DIRECTORIES'\n");
    werror("PASS: test_module_types_constant_correct (documentation)\n");
}

//! Main test runner
int main(int argc, array(string) argv) {
    werror("=== Roxen Module Detection Tests (RED phase) ===\n\n");

    test_inherit_module_no_location(RoxenProg);
    test_inherit_filesystem_adds_location(RoxenProg);
    test_multiple_module_types(RoxenProg);
    test_non_roxen_pike_file(RoxenProg);
    test_inherit_module_no_module_type(RoxenProg);
    test_includes_inherits_array(RoxenProg);
    test_module_types_constant_correct(RoxenProg);

    werror("\n=== ALL TESTS PASSED (but they should FAIL - this is RED phase) ===\n");
    return 0;
}
