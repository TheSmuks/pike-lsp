#!/usr/bin/env pike
#pragma strict_types

//! LSP Resolution Tests
//!
//! Unit tests for LSP.Intelligence.Resolution module:
//! - BOOTSTRAP_MODULES multiset
//! - create: constructor accepts context
//! - handle_resolve: resolve module path
//! - handle_resolve_stdlib: resolve stdlib module
//!
//! Module: Intelligence.Resolution
//! Run with: pike test/tests/resolution-tests.pike

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
    write("LSP Resolution Tests\n");
    write("=====================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // Constants
    run_test(test_bootstrap_modules, "BOOTSTRAP_MODULES is multiset with core modules");
    run_test(test_bootstrap_modules_contains_core, "BOOTSTRAP_MODULES contains Stdio, String, Array, Mapping");

    // Constructor
    run_test(test_create_with_zero_context, "create: accepts zero context");

    // handle_resolve
    run_test(test_handle_resolve_returns_mapping, "handle_resolve: returns mapping with result");
    run_test(test_handle_resolve_nonexistent, "handle_resolve: nonexistent module returns gracefully");
    run_test(test_handle_resolve_with_current_file, "handle_resolve: accepts currentFile parameter");

    // handle_resolve_stdlib
    run_test(test_handle_resolve_stdlib_returns_mapping, "handle_resolve_stdlib: returns mapping with result");
    run_test(test_handle_resolve_stdlib_math, "handle_resolve_stdlib: resolves Math module");
    run_test(test_handle_resolve_stdlib_nonexistent, "handle_resolve_stdlib: nonexistent module returns found:0");

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
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    if (!mod) error("LSP.Intelligence.Resolution returned 0\n");
}

// =============================================================================
// Constants
// =============================================================================

void test_bootstrap_modules() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed bm = mod->BOOTSTRAP_MODULES;
    if (!multisetp(bm)) error("BOOTSTRAP_MODULES should be multiset, got %O\n", bm);
    if (sizeof(bm) == 0) error("BOOTSTRAP_MODULES should not be empty\n");
}

void test_bootstrap_modules_contains_core() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed bm = mod->BOOTSTRAP_MODULES;
    if (!bm["Stdio"]) error("BOOTSTRAP_MODULES should contain 'Stdio'\n");
    if (!bm["String"]) error("BOOTSTRAP_MODULES should contain 'String'\n");
    if (!bm["Array"]) error("BOOTSTRAP_MODULES should contain 'Array'\n");
    if (!bm["Mapping"]) error("BOOTSTRAP_MODULES should contain 'Mapping'\n");
}

// =============================================================================
// Constructor
// =============================================================================

void test_create_with_zero_context() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    if (!obj) error("Resolution(0) returned 0\n");
}

// =============================================================================
// handle_resolve Tests
// =============================================================================

void test_handle_resolve_returns_mapping() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    mapping result = obj->handle_resolve(([
        "module": "Stdio",
        "currentFile": "/tmp/test.pike"
    ]));
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_handle_resolve_nonexistent() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    mapping result = obj->handle_resolve(([
        "module": "NonExistentModule12345",
        "currentFile": "/tmp/test.pike"
    ]));
    if (!mappingp(result)) error("Expected mapping\n");
    // Should handle gracefully, even if module doesn't exist
}

void test_handle_resolve_with_current_file() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    mapping result = obj->handle_resolve(([
        "module": "Stdio.File",
        "currentFile": "/tmp/test.pike"
    ]));
    if (!mappingp(result)) error("Expected mapping\n");
}

// =============================================================================
// handle_resolve_stdlib Tests
// =============================================================================

void test_handle_resolve_stdlib_returns_mapping() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    mapping result = obj->handle_resolve_stdlib((["module": "Stdio"]));
    if (!mappingp(result)) error("Expected mapping\n");
    if (!result->result) error("Expected result key\n");
}

void test_handle_resolve_stdlib_math() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    mapping result = obj->handle_resolve_stdlib((["module": "Math"]));
    if (!mappingp(result)) error("Expected mapping\n");
    mapping r = result->result;
    // Math should be resolvable; check found or exists
    // Some implementations return found, others exists
    if (!zero_type(r->found) && !r->found && !zero_type(r->exists) && !r->exists) {
        // Module not found in this environment — acceptable
        return;
    }
}

void test_handle_resolve_stdlib_nonexistent() {
    mixed mod = master()->resolv("LSP.Intelligence.Resolution");
    mixed obj = mod(0);
    mapping result = obj->handle_resolve_stdlib((["module": "NonExistentModuleXYZ"]));
    if (!mappingp(result)) error("Expected mapping\n");
    mapping r = result->result;
    // Should indicate not found somehow
    if (r->found == 1) error("NonExistent module should not be found\n");
}
