#!/usr/bin/env pike
#pragma strict_types

//! LSP TypeAnalysis Tests
//!
//! Unit tests for LSP.Intelligence.TypeAnalysis module:
//! - create: constructor accepts context
//! - parse_autodoc: parse Pike autodoc strings
//! - handle_get_inherited: get inherited members from a class
//!
//! Module: Intelligence.TypeAnalysis
//! Run with: pike test/tests/type-analysis-tests.pike

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
    write("LSP TypeAnalysis Tests\n");
    write("=======================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // Constructor
    run_test(test_create_with_zero_context, "create: accepts zero context");
    run_test(test_create_with_mapping_context, "create: accepts mapping context");

    // parse_autodoc
    run_test(test_parse_autodoc_basic, "parse_autodoc: basic doc string");
    run_test(test_parse_autodoc_returns_mapping, "parse_autodoc: returns mapping");
    run_test(test_parse_autodoc_empty_string, "parse_autodoc: empty string");
    run_test(test_parse_autodoc_param_tag, "parse_autodoc: @param tag");
    run_test(test_parse_autodoc_returns_tag, "parse_autodoc: @returns tag");
    run_test(test_parse_autodoc_note_tag, "parse_autodoc: @note tag");

    // handle_get_inherited
    run_test(test_get_inherited_returns_mapping, "handle_get_inherited: returns mapping");
    run_test(test_get_inherited_result_fields, "handle_get_inherited: result has found/members");
    run_test(test_get_inherited_nonexistent, "handle_get_inherited: nonexistent class");
    run_test(test_get_inherited_stdlib_class, "handle_get_inherited: stdlib class");

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
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    if (!mod) error("LSP.Intelligence.TypeAnalysis returned 0\n");
}

// =============================================================================
// Constructor
// =============================================================================

void test_create_with_zero_context() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    if (!obj) error("TypeAnalysis(0) returned 0\n");
}

void test_create_with_mapping_context() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(([]));
    if (!obj) error("TypeAnalysis(([])) returned 0\n");
}

// =============================================================================
// parse_autodoc Tests
// =============================================================================

void test_parse_autodoc_basic() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    string doc = "//! This is a test function\n";
    mapping result = obj->parse_autodoc(doc);
    if (!mappingp(result)) error("Expected mapping, got %O\n", result);
}

void test_parse_autodoc_returns_mapping() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    string doc = "//! Description line\n//! @param x\n//!   The x value\n";
    mapping result = obj->parse_autodoc(doc);
    if (!mappingp(result)) error("Expected mapping\n");
    // Should have at least a description or similar field
}

void test_parse_autodoc_empty_string() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    mapping result = obj->parse_autodoc("");
    if (!mappingp(result)) error("Expected mapping for empty string\n");
}

void test_parse_autodoc_param_tag() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    string doc = "//! Does something\n"
                 "//! @param name\n"
                 "//!   The name to use\n"
                 "//! @param value\n"
                 "//!   The value to set\n";
    mapping result = obj->parse_autodoc(doc);
    if (!mappingp(result)) error("Expected mapping\n");
}

void test_parse_autodoc_returns_tag() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    string doc = "//! Adds two numbers\n"
                 "//! @returns\n"
                 "//!   The sum\n";
    mapping result = obj->parse_autodoc(doc);
    if (!mappingp(result)) error("Expected mapping\n");
}

void test_parse_autodoc_note_tag() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    string doc = "//! A function\n"
                 "//! @note\n"
                 "//!   This is important\n";
    mapping result = obj->parse_autodoc(doc);
    if (!mappingp(result)) error("Expected mapping\n");
}

// =============================================================================
// handle_get_inherited Tests
// =============================================================================

void test_get_inherited_returns_mapping() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    mapping result = obj->handle_get_inherited((["class": "Stdio.File"]));
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_get_inherited_result_fields() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    mapping result = obj->handle_get_inherited((["class": "Stdio.File"]));
    mapping r = result->result;
    // Should have found and members fields
    if (zero_type(r->found) && zero_type(r->members)) {
        error("Expected found or members field\n");
    }
}

void test_get_inherited_nonexistent() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    mapping result = obj->handle_get_inherited((["class": "NonExistent.Class.XYZ"]));
    if (!mappingp(result)) error("Expected mapping\n");
    mapping r = result->result;
    // Should indicate not found
    if (!zero_type(r->found) && r->found) {
        error("NonExistent class should not be found\n");
    }
}

void test_get_inherited_stdlib_class() {
    mixed mod = master()->resolv("LSP.Intelligence.TypeAnalysis");
    mixed obj = mod(0);
    mapping result = obj->handle_get_inherited((["class": "Array"]));
    if (!mappingp(result)) error("Expected mapping\n");
    // Array is a stdlib module — may or may not have inherited members
    // Just verify it doesn't throw
}
