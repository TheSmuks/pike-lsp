#!/usr/bin/env pike
#pragma strict_types

//! LSP Introspection Tests
//!
//! Unit tests for LSP.Intelligence.Introspection module:
//! - BOOTSTRAP_MODULES multiset
//! - SKIP_PARENT_INTROSPECT_MODULES multiset
//! - create: constructor accepts context
//!
//! Module: Intelligence.Introspection
//! Run with: pike test/tests/introspection-tests.pike

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
    write("LSP Introspection Tests\n");
    write("========================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // Constants
    run_test(test_bootstrap_modules, "BOOTSTRAP_MODULES is multiset with core modules");
    run_test(test_bootstrap_modules_contains_stdio, "BOOTSTRAP_MODULES contains Stdio");
    run_test(test_bootstrap_modules_contains_string, "BOOTSTRAP_MODULES contains String");
    run_test(test_skip_parent_introspect_modules, "SKIP_PARENT_INTROSPECT_MODULES is multiset");

    // Constructor
    run_test(test_create_with_zero_context, "create: accepts zero context");
    run_test(test_create_with_mapping_context, "create: accepts mapping context");

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
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    if (!mod) error("LSP.Intelligence.Introspection returned 0\n");
}

// =============================================================================
// Constants
// =============================================================================

void test_bootstrap_modules() {
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    mixed bm = mod->BOOTSTRAP_MODULES;
    if (!multisetp(bm)) error("BOOTSTRAP_MODULES should be multiset, got %O\n", bm);
    if (sizeof(bm) == 0) error("BOOTSTRAP_MODULES should not be empty\n");
}

void test_bootstrap_modules_contains_stdio() {
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    mixed bm = mod->BOOTSTRAP_MODULES;
    if (!bm["Stdio"]) error("BOOTSTRAP_MODULES should contain 'Stdio'\n");
}

void test_bootstrap_modules_contains_string() {
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    mixed bm = mod->BOOTSTRAP_MODULES;
    if (!bm["String"]) error("BOOTSTRAP_MODULES should contain 'String'\n");
}

void test_skip_parent_introspect_modules() {
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    mixed sm = mod->SKIP_PARENT_INTROSPECT_MODULES;
    if (!multisetp(sm)) error("SKIP_PARENT_INTROSPECT_MODULES should be multiset, got %O\n", sm);
}

// =============================================================================
// Constructor
// =============================================================================

void test_create_with_zero_context() {
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    mixed obj = mod(0);
    if (!obj) error("Introspection(0) returned 0\n");
}

void test_create_with_mapping_context() {
    mixed mod = master()->resolv("LSP.Intelligence.Introspection");
    mixed obj = mod(([]));
    if (!obj) error("Introspection(([])) returned 0\n");
}
