#!/usr/bin/env pike
#pragma strict_types

//! LSP ModuleResolution Tests
//!
//! Unit tests for LSP.Intelligence.ModuleResolution module:
//! - Constants: INCLUDE, IMPORT, INHERIT, REQUIRE
//! - create: constructor accepts context
//! - handle_extract_imports: extract import statements from code
//!
//! Module: Intelligence.ModuleResolution
//! Run with: pike test/tests/module-resolution-tests.pike

int test_count = 0;
int pass_count = 0;
int fail_count = 0;
array(string) failure_messages = ({});

void setup_module_path() {
    string script_path = __FILE__;
    string base_path = dirname(script_path);
    for (int i = 0; i < 10; i++) {
        if (basename(base_path) == "pike-lsp") { break; }
        string parent = dirname(base_path);
        if (parent == base_path || parent == "") break;
        base_path = parent;
    }
    if (basename(base_path) != "pike-lsp") base_path = ".";
    string pike_scripts_path = combine_path(base_path, "pike-scripts");
    master()->add_module_path(pike_scripts_path);
}

void run_test(function test_func, string name) {
    test_count++;
    mixed err = catch {
        test_func();
        pass_count++;
        write("\033[32m[PASS]\033[0m %s\n", name);
    };
    if (err) {
        fail_count++;
        failure_messages += ({ name });
        write("\033[31m[FAIL]\033[0m %s\n", name);
        if (arrayp(err)) { write("    Error: %s\n", err[0] || "Unknown error"); }
        else { write("    Error: %s\n", sprintf("%O", err)); }
    }
}

int main() {
    setup_module_path();
    write("LSP ModuleResolution Tests\n");
    write("===========================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // Constants
    run_test(test_include_constant, "INCLUDE constant is 'include'");
    run_test(test_import_constant, "IMPORT constant is 'import'");
    run_test(test_inherit_constant, "INHERIT constant is 'inherit'");
    run_test(test_require_constant, "REQUIRE constant is 'require'");

    // Constructor
    run_test(test_create_no_context, "create: constructor with zero context");

    // handle_extract_imports
    run_test(test_extract_imports_basic, "handle_extract_imports: basic import statement");
    run_test(test_extract_imports_result_structure, "handle_extract_imports: result has imports and dependencies");
    run_test(test_extract_imports_multiple, "handle_extract_imports: multiple imports");
    run_test(test_extract_imports_inherit, "handle_extract_imports: inherit statement");
    run_test(test_extract_imports_include, "handle_extract_imports: include statement");
    run_test(test_extract_imports_empty_code, "handle_extract_imports: empty code");
    run_test(test_extract_imports_no_imports, "handle_extract_imports: code with no imports");

    write("\n");
    write("Results: %d run, %d passed, %d failed\n", test_count, pass_count, fail_count);
    if (fail_count > 0) {
        write("\nFailed tests:\n");
        foreach (failure_messages, string name) { write("  - %s\n", name); }
        return 1;
    }
    return 0;
}

// =============================================================================
// Module Loading
// =============================================================================

void test_module_loads() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    if (!mod) error("LSP.Intelligence.ModuleResolution returned 0\n");
}

// =============================================================================
// Constants
// =============================================================================

void test_include_constant() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    if (mod->INCLUDE != "include") error("INCLUDE should be 'include', got %O\n", mod->INCLUDE);
}

void test_import_constant() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    if (mod->IMPORT != "import") error("IMPORT should be 'import', got %O\n", mod->IMPORT);
}

void test_inherit_constant() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    if (mod->INHERIT != "inherit") error("INHERIT should be 'inherit', got %O\n", mod->INHERIT);
}

void test_require_constant() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    if (mod->REQUIRE != "require") error("REQUIRE should be 'require', got %O\n", mod->REQUIRE);
}

// =============================================================================
// Constructor
// =============================================================================

void test_create_no_context() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    if (!obj) error("ModuleResolution(0) returned 0\n");
}

// =============================================================================
// handle_extract_imports Tests
// =============================================================================

void test_extract_imports_basic() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    string code = "import Stdio;\n";
    mapping result = obj->handle_extract_imports((["code": code]));
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_extract_imports_result_structure() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    string code = "import Stdio;\n";
    mapping result = obj->handle_extract_imports((["code": code]));
    mapping r = result->result;
    // Should have imports array and dependencies array
    if (r->imports && !arrayp(r->imports)) error("imports should be array\n");
    if (r->dependencies && !arrayp(r->dependencies)) error("dependencies should be array\n");
}

void test_extract_imports_multiple() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    string code = "import Stdio;\nimport String;\nimport Array;\n";
    mapping result = obj->handle_extract_imports((["code": code]));
    mapping r = result->result;
    if (!arrayp(r->imports)) error("imports should be array\n");
    if (sizeof(r->imports) < 3) error("Expected at least 3 imports, got %d\n", sizeof(r->imports));
}

void test_extract_imports_inherit() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    string code = "inherit Stdio.File;\n";
    mapping result = obj->handle_extract_imports((["code": code]));
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_extract_imports_include() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    string code = "#include \"constants.h\"\n";
    mapping result = obj->handle_extract_imports((["code": code]));
    if (!mappingp(result)) error("Expected mapping\n");
}

void test_extract_imports_empty_code() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    mapping result = obj->handle_extract_imports((["code": ""]));
    if (!mappingp(result)) error("Expected mapping\n");
    mapping r = result->result;
    if (arrayp(r->imports) && sizeof(r->imports) != 0) {
        error("Expected 0 imports for empty code, got %d\n", sizeof(r->imports));
    }
}

void test_extract_imports_no_imports() {
    mixed mod = master()->resolv("LSP.Intelligence.ModuleResolution");
    mixed obj = mod(0);
    string code = "int x = 5;\nstring y = \"hello\";\n";
    mapping result = obj->handle_extract_imports((["code": code]));
    if (!mappingp(result)) error("Expected mapping\n");
    mapping r = result->result;
    if (arrayp(r->imports) && sizeof(r->imports) != 0) {
        error("Expected 0 imports for code with no imports, got %d\n", sizeof(r->imports));
    }
}
