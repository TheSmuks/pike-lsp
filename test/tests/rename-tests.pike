#!/usr/bin/env pike
#pragma strict_types

//! LSP Rename Tests
//!
//! Unit tests for LSP.Rename module:
//! - prepare_rename: find symbol at position, return range info
//! - find_rename_positions: find all occurrences of a symbol for rename
//! - Request wrappers: prepare_rename_request, find_rename_positions_request
//!
//! Module: Rename
//! Run with: pike test/tests/rename-tests.pike

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
        if (parent == base_path) break;
        base_path = parent;
    }
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
    write("LSP Rename Tests\n");
    write("=================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // prepare_rename
    run_test(test_prepare_rename_finds_symbol, "prepare_rename: finds symbol at position");
    run_test(test_prepare_rename_returns_range, "prepare_rename: returns name and range fields");
    run_test(test_prepare_rename_no_symbol, "prepare_rename: returns result 0 when no symbol");
    run_test(test_prepare_rename_with_filename, "prepare_rename: accepts filename parameter");

    // find_rename_positions
    run_test(test_find_rename_positions_basic, "find_rename_positions: finds occurrences of symbol");
    run_test(test_find_rename_positions_returns_edits, "find_rename_positions: returns edits array and count");
    run_test(test_find_rename_positions_empty_code, "find_rename_positions: handles empty code");
    run_test(test_find_rename_positions_multiline, "find_rename_positions: finds across multiple lines");

    // Request wrappers
    run_test(test_prepare_rename_request, "prepare_rename_request: wraps params correctly");
    run_test(test_find_rename_positions_request, "find_rename_positions_request: wraps params correctly");

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
    mixed mod = master()->resolv("LSP.Rename");
    if (!mod) error("LSP.Rename returned 0\n");
}

// =============================================================================
// prepare_rename Tests
// =============================================================================

void test_prepare_rename_finds_symbol() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "int myVar = 5;\n";
    mapping result = mod->prepare_rename(code, "test.pike", 1, 4);
    if (!mappingp(result)) error("Expected mapping, got %O\n", result);
    if (!result->result) error("Expected result key\n");
}

void test_prepare_rename_returns_range() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "int myVar = 5;\n";
    mapping result = mod->prepare_rename(code, "test.pike", 1, 4);
    if (result->result == 0) error("Should find symbol at position of myVar\n");
    mapping r = result->result;
    if (!r->name) error("Expected name field in result\n");
    if (!intp(r->line)) error("Expected line field\n");
    if (!intp(r->character)) error("Expected character field\n");
    if (!intp(r->endLine)) error("Expected endLine field\n");
    if (!intp(r->endCharacter)) error("Expected endCharacter field\n");
}

void test_prepare_rename_no_symbol() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "int x = 5;\n";
    // Position on the '=' sign (column 7, 0-indexed), which is not an identifier
    mapping result = mod->prepare_rename(code, "test.pike", 1, 7);
    if (!mappingp(result)) error("Expected mapping\n");
    // result->result may be 0 when no symbol found
}

void test_prepare_rename_with_filename() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "string name = \"test\";\n";
    mapping result = mod->prepare_rename(code, "myfile.pike", 1, 7);
    if (!mappingp(result)) error("Expected mapping\n");
}

// =============================================================================
// find_rename_positions Tests
// =============================================================================

void test_find_rename_positions_basic() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "int counter = 0;\ncounter += 1;\n";
    mapping result = mod->find_rename_positions(code, "test.pike", "counter", 1, 4);
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_find_rename_positions_returns_edits() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "int counter = 0;\ncounter += 1;\nwrite((string)counter);\n";
    mapping result = mod->find_rename_positions(code, "test.pike", "counter", 1, 4);
    mapping r = result->result;
    if (r->edits && !arrayp(r->edits)) error("edits should be array\n");
    if (!intp(r->count)) error("count should be int\n");
    // Should find at least 2 occurrences of "counter"
    if (r->count < 2) error("Expected count >= 2 for 3 occurrences, got %d\n", r->count);
}

void test_find_rename_positions_empty_code() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    mapping result = mod->find_rename_positions("", "test.pike", "x", 1, 0);
    if (!mappingp(result)) error("Expected mapping\n");
    mapping r = result->result;
    if (r->count != 0) error("Expected count 0 for empty code, got %d\n", r->count);
}

void test_find_rename_positions_multiline() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    string code = "int total = 0;\n"
                  "foreach (values, int val) {\n"
                  "    total += val;\n"
                  "}\n"
                  "return total;\n";
    mapping result = mod->find_rename_positions(code, "test.pike", "total", 1, 4);
    mapping r = result->result;
    if (r->count < 2) error("Expected at least 2 occurrences of 'total', got %d\n", r->count);
}

// =============================================================================
// Request Wrapper Tests
// =============================================================================

void test_prepare_rename_request() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    mapping params = ([
        "textDocument": (["uri": "file:///test.pike"]),
        "position": (["line": 0, "character": 4]),
        "code": "int myVar = 5;\n"
    ]);
    mapping result = mod->prepare_rename_request(params);
    if (!mappingp(result)) error("Expected mapping\n");
}

void test_find_rename_positions_request() {
    program prog = master()->resolv("LSP.Rename");
    object mod = prog();
    mapping params = ([
        "textDocument": (["uri": "file:///test.pike"]),
        "position": (["line": 0, "character": 4]),
        "newName": "newVar",
        "code": "int myVar = 5;\n"
    ]);
    mapping result = mod->find_rename_positions_request(params);
    if (!mappingp(result)) error("Expected mapping\n");
}
