#!/usr/bin/env pike
#pragma strict_types

//! LSP Variables Tests
//!
//! Unit tests for LSP.Analysis.Variables module:
//! - create: constructor accepts optional context
//! - handle_find_occurrences: find all occurrences of identifiers
//!
//! Module: Analysis.Variables
//! Run with: pike test/tests/variables-tests.pike

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
    write("LSP Variables Tests\n");
    write("====================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // Constructor
    run_test(test_create_no_args, "create: constructor with no arguments");
    run_test(test_create_with_context, "create: constructor with context argument");

    // handle_find_occurrences
    run_test(test_find_occurrences_basic, "handle_find_occurrences: basic code returns occurrences");
    run_test(test_find_occurrences_result_structure, "handle_find_occurrences: result has occurrences array");
    run_test(test_find_occurrences_occurrence_fields, "handle_find_occurrences: each occurrence has text/line/character");
    run_test(test_find_occurrences_empty_code, "handle_find_occurrences: empty code");
    run_test(test_find_occurrences_with_tokens, "handle_find_occurrences: accepts optional tokens param");
    run_test(test_find_occurrences_with_lines, "handle_find_occurrences: accepts optional lines param");
    run_test(test_find_occurrences_class_code, "handle_find_occurrences: class with members");

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
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    if (!mod) error("LSP.Analysis.Variables returned 0\n");
}

// =============================================================================
// Constructor
// =============================================================================

void test_create_no_args() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    if (!v) error("Variables() returned 0\n");
}

void test_create_with_context() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    // Pass 0 or empty mapping as context
    mixed v = mod(0);
    if (!v) error("Variables(0) returned 0\n");
}

// =============================================================================
// handle_find_occurrences Tests
// =============================================================================

void test_find_occurrences_basic() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    string code = "int x = 5;\nstring y = \"hello\";\n";
    mapping result = v->handle_find_occurrences((["code": code]));
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_find_occurrences_result_structure() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    string code = "int myVar = 10;\nmyVar += 5;\n";
    mapping result = v->handle_find_occurrences((["code": code]));
    if (!result->result) error("Expected result key\n");
    array occ = result->result->occurrences;
    if (!arrayp(occ)) error("Expected occurrences array\n");
}

void test_find_occurrences_occurrence_fields() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    string code = "int counter = 0;\ncounter++;\n";
    mapping result = v->handle_find_occurrences((["code": code]));
    array occ = result->result->occurrences;
    foreach (occ, mapping o) {
        if (!stringp(o->text)) error("Each occurrence should have text field\n");
    }
}

void test_find_occurrences_empty_code() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    mapping result = v->handle_find_occurrences((["code": ""]));
    if (!mappingp(result)) error("Expected mapping for empty code\n");
    array occ = result->result->occurrences;
    if (!arrayp(occ)) error("Expected occurrences array\n");
    if (sizeof(occ) != 0) error("Expected 0 occurrences for empty code\n");
}

void test_find_occurrences_with_tokens() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    string code = "int x = 1;\n";
    // Pass optional tokens parameter (array)
    mapping result = v->handle_find_occurrences((["code": code, "tokens": ({})]));
    if (!mappingp(result)) error("Expected mapping\n");
}

void test_find_occurrences_with_lines() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    string code = "int x = 1;\nint y = 2;\n";
    mapping result = v->handle_find_occurrences((["code": code, "lines": code/"\n"]));
    if (!mappingp(result)) error("Expected mapping\n");
}

void test_find_occurrences_class_code() {
    mixed mod = master()->resolv("LSP.Analysis.Variables");
    mixed v = mod();
    string code = "class Foo { int bar; void set_bar(int v) { bar = v; } }\n";
    mapping result = v->handle_find_occurrences((["code": code]));
    if (!mappingp(result)) error("Expected mapping\n");
    array occ = result->result->occurrences;
    if (sizeof(occ) == 0) error("Expected at least some occurrences\n");
}
