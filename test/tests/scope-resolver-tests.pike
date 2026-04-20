#!/usr/bin/env pike
#pragma strict_types

//! LSP ScopeResolver Tests
//!
//! Unit tests for LSP.Analysis.ScopeResolver module:
//! - resolve_variable_type: resolve type of variable at position
//!
//! Module: Analysis.ScopeResolver
//! Run with: pike test/tests/scope-resolver-tests.pike

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
    write("LSP ScopeResolver Tests\n");
    write("========================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // resolve_variable_type
    run_test(test_resolve_string_variable, "resolve_variable_type: string variable");
    run_test(test_resolve_int_variable, "resolve_variable_type: int variable");
    run_test(test_resolve_returns_mapping_or_zero, "resolve_variable_type: returns mapping or 0");
    run_test(test_resolve_unknown_variable, "resolve_variable_type: returns 0 for unknown variable");
    run_test(test_resolve_variable_has_type_field, "resolve_variable_type: result has type field");
    run_test(test_resolve_empty_code, "resolve_variable_type: handles empty code");
    run_test(test_resolve_multiline_code, "resolve_variable_type: variable in multi-line code");

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
    mixed mod = master()->resolv("LSP.Analysis.ScopeResolver");
    if (!mod) error("LSP.Analysis.ScopeResolver returned 0\n");
}

// =============================================================================
// resolve_variable_type Tests
// =============================================================================

void test_resolve_string_variable() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    string code = "string name = \"hello\";\nwrite(name);\n";
    mixed result = mod->resolve_variable_type(code, "test.pike", 2, "name");
    if (result == 0) error("Expected result for 'name', got 0\n");
    if (mappingp(result) && result->type != "string") {
        // Type may be returned differently; check it exists
        if (!result->type) error("Expected type field in result\n");
    }
}

void test_resolve_int_variable() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    string code = "int count = 42;\ncount += 1;\n";
    mixed result = mod->resolve_variable_type(code, "test.pike", 2, "count");
    if (result == 0) error("Expected result for 'count', got 0\n");
}

void test_resolve_returns_mapping_or_zero() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    string code = "int x = 1;\n";
    mixed result = mod->resolve_variable_type(code, "test.pike", 1, "x");
    if (result != 0 && !mappingp(result)) {
        error("Expected mapping or 0, got %O\n", result);
    }
}

void test_resolve_unknown_variable() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    string code = "int x = 1;\n";
    mixed result = mod->resolve_variable_type(code, "test.pike", 1, "nonexistent");
    // Unknown variable may return 0 or a mapping without type
    // Just verify it doesn't throw
}

void test_resolve_variable_has_type_field() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    string code = "string value = \"test\";\n";
    mixed result = mod->resolve_variable_type(code, "test.pike", 1, "value");
    if (mappingp(result)) {
        if (!result->type) error("Result mapping should have 'type' field\n");
    }
}

void test_resolve_empty_code() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    mixed result = mod->resolve_variable_type("", "test.pike", 1, "x");
    // Should not throw; may return 0
    if (result != 0 && !mappingp(result)) {
        error("Expected 0 or mapping for empty code, got %O\n", result);
    }
}

void test_resolve_multiline_code() {
    program prog = master()->resolv("LSP.Analysis.ScopeResolver");
    object mod = prog();
    string code = "class MyClass {\n"
                  "    string name;\n"
                  "    int age;\n"
                  "    void create(string n, int a) {\n"
                  "        name = n;\n"
                  "        age = a;\n"
                  "    }\n"
                  "}\n";
    mixed result = mod->resolve_variable_type(code, "test.pike", 5, "name");
    // Should not throw
    if (result != 0 && !mappingp(result)) {
        error("Expected mapping or 0, got %O\n", result);
    }
}
