//! Roxen defvar parsing tests - TDD RED phase
//! These tests MUST fail before implementing the fixes

// Load the module directly
string module_dir = combine_path(__FILE__, "../..");
program RoxenProg = compile_file(module_dir + "/Roxen.pike");

//! Test 1: Standard 5-arg defvar -> extracts name, type, name_string, doc_str
void test_defvar_standard_5_arg(program Roxen) {
    werror("TEST: test_defvar_standard_5_arg\n");

    string code = "void create() {\n" +
    "    defvar(\"name\", \"default\", \"Display Name\", TYPE_STRING, \"Description\");\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_vars(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) vars = result->result->variables || ({});

    if (sizeof(vars) != 1) {
        werror("FAIL: Should have 1 variable, got %d\n", sizeof(vars));
        exit(1);
    }

    mapping var = vars[0];

    if (var->name != "name") {
        werror("FAIL: Variable name should be 'name', got '%s'\n", var->name);
        exit(1);
    }

    if (var->type != "TYPE_STRING") {
        werror("FAIL: Variable type should be TYPE_STRING, got '%s'\n", var->type);
        exit(1);
    }

    if (var->name_string != "Display Name") {
        werror("FAIL: name_string should be 'Display Name', got '%s'\n", var->name_string);
        exit(1);
    }

    if (var->doc_str != "Description") {
        werror("FAIL: doc_str should be 'Description', got '%s'\n", var->doc_str);
        exit(1);
    }

    werror("PASS: test_defvar_standard_5_arg\n");
}

//! Test 2: LOCALE-wrapped name_string -> extracts string
void test_defvar_locale_wrapped(program Roxen) {
    werror("TEST: test_defvar_locale_wrapped\n");

    string code = "void create() {\n" +
    "    defvar(\"name\", \"default\", LOCALE(0, \"Localized Name\"), TYPE_STRING, \"Description\");\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_vars(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) vars = result->result->variables || ({});

    if (sizeof(vars) != 1) {
        werror("FAIL: Should have 1 variable, got %d\n", sizeof(vars));
        exit(1);
    }

    mapping var = vars[0];

    // Should extract the string from LOCALE call (bug: currently skips it)
    if (var->name_string == "") {
        werror("FAIL: Should extract name_string from LOCALE() call, got empty string\n");
        exit(1);
    }

    // At minimum should have the variable name
    if (var->name != "name") {
        werror("FAIL: Variable name should be 'name', got '%s'\n", var->name);
        exit(1);
    }

    werror("PASS: test_defvar_locale_wrapped\n");
}

//! Test 3: defvar with TYPE_FLAG|VAR_INITIAL -> captures TYPE_FLAG
void test_defvar_with_flag_combination(program Roxen) {
    werror("TEST: test_defvar_with_flag_combination\n");

    string code = "void create() {\n" +
    "    defvar(\"enabled\", 1, \"Enabled\", TYPE_FLAG | VAR_INITIAL, \"Enable feature\");\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_vars(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) vars = result->result->variables || ({});

    if (sizeof(vars) != 1) {
        werror("FAIL: Should have 1 variable, got %d\n", sizeof(vars));
        exit(1);
    }

    mapping var = vars[0];

    // Should capture TYPE_FLAG (bug: currently doesn't handle | combinations)
    if (var->type == "") {
        werror("FAIL: Should capture type from TYPE_FLAG|VAR_INITIAL combination\n");
        exit(1);
    }

    // At minimum should contain TYPE_FLAG
    if (!has_value(var->type || "", "TYPE_FLAG")) {
        werror("FAIL: Type should contain TYPE_FLAG, got '%s'\n", var->type);
        exit(1);
    }

    werror("PASS: test_defvar_with_flag_combination\n");
}

//! Test 4: Position is actual line number (not 1,1)
void test_defvar_position_tracking(program Roxen) {
    werror("TEST: test_defvar_position_tracking\n");

    string code = "void create() {\n" +
    "    // Line 2\n" +
    "    defvar(\"name\", \"default\", \"Display Name\", TYPE_STRING, \"Description\");\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_vars(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) vars = result->result->variables || ({});

    if (sizeof(vars) != 1) {
        werror("FAIL: Should have 1 variable, got %d\n", sizeof(vars));
        exit(1);
    }

    mapping pos = vars[0]->position;

    // Position should be actual line 3 (bug: currently returns 1,1)
    if (pos->line == 1) {
        werror("FAIL: Position should be actual line number (3), not 1\n");
        exit(1);
    }

    if (pos->line != 3) {
        werror("FAIL: Position line should be 3, got %d\n", pos->line);
        exit(1);
    }

    werror("PASS: test_defvar_position_tracking\n");
}

//! Main test runner
int main(int argc, array(string) argv) {
    werror("=== Roxen Defvar Parsing Tests (RED phase) ===\n\n");

    test_defvar_standard_5_arg(RoxenProg);
    test_defvar_locale_wrapped(RoxenProg);
    test_defvar_with_flag_combination(RoxenProg);
    test_defvar_position_tracking(RoxenProg);

    werror("\n=== ALL TESTS PASSED (but they should FAIL - this is RED phase) ===\n");
    return 0;
}
