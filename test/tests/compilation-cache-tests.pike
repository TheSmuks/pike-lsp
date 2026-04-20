#!/usr/bin/env pike
#pragma strict_types

//! LSP CompilationCache Tests
//!
//! Unit tests for LSP.CompilationCache module:
//! - CompilationResult: create, field access
//! - get_stats / reset_stats: statistics tracking
//! - CompilationContext: add_import, get_imports, has_import, clear, size
//! - update_dependency_graph / invalidate_transitive: dependency management
//!
//! Module: CompilationCache
//! Run with: pike test/tests/compilation-cache-tests.pike

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
    write("LSP CompilationCache Tests\n");
    write("===========================\n\n");

    // Module loading
    run_test(test_module_loads, "module loads via master()->resolv");

    // MAX_CACHED_FILES constant
    run_test(test_max_cached_files_constant, "MAX_CACHED_FILES is positive integer");

    // CompilationResult class
    run_test(test_compilation_result_create, "CompilationResult create with program");
    run_test(test_compilation_result_with_deps, "CompilationResult with dependencies");
    run_test(test_compilation_result_diagnostics, "CompilationResult diagnostics field");

    // get_stats / reset_stats
    run_test(test_get_stats_returns_mapping, "get_stats returns mapping with expected keys");
    run_test(test_get_stats_values_types, "get_stats values are integers");
    run_test(test_reset_stats, "reset_stats resets counters");

    // CompilationContext class
    run_test(test_context_create, "CompilationContext create");
    run_test(test_context_add_import, "CompilationContext add_import / get_imports");
    run_test(test_context_add_imports_batch, "CompilationContext add_imports batch");
    run_test(test_context_has_import, "CompilationContext has_import");
    run_test(test_context_clear, "CompilationContext clear");
    run_test(test_context_size, "CompilationContext size");

    // Dependency graph
    run_test(test_update_dependency_graph, "update_dependency_graph accepts path and deps");
    run_test(test_invalidate_transitive, "invalidate_transitive accepts path");

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
    mixed mod = master()->resolv("LSP.CompilationCache");
    if (!mod) error("LSP.CompilationCache returned 0\n");
}

void test_max_cached_files_constant() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    int val = mod->MAX_CACHED_FILES;
    if (val <= 0) error("MAX_CACHED_FILES should be positive, got %d\n", val);
}

// =============================================================================
// CompilationResult
// =============================================================================

void test_compilation_result_create() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    // Create a CompilationResult with a program, empty diagnostics
    mixed result = mod->CompilationResult(this_program, ({}));
    if (!result) error("CompilationResult returned 0\n");
    if (result->compiled_program != this_program) {
        error("compiled_program mismatch\n");
    }
}

void test_compilation_result_with_deps() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed result = mod->CompilationResult(this_program, ({}), ({"dep1.pike", "dep2.pike"}));
    if (!arrayp(result->dependencies)) {
        error("dependencies should be array, got %O\n", result->dependencies);
    }
    if (sizeof(result->dependencies) != 2) {
        error("Expected 2 dependencies, got %d\n", sizeof(result->dependencies));
    }
}

void test_compilation_result_diagnostics() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mapping diag1 = (["message": "test warning", "severity": 2]);
    mixed result = mod->CompilationResult(this_program, ({diag1}));
    if (!arrayp(result->diagnostics)) {
        error("diagnostics should be array, got %O\n", result->diagnostics);
    }
    if (sizeof(result->diagnostics) != 1) {
        error("Expected 1 diagnostic, got %d\n", sizeof(result->diagnostics));
    }
}

// =============================================================================
// Statistics
// =============================================================================

void test_get_stats_returns_mapping() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mapping stats = mod->get_stats();
    if (!mappingp(stats)) error("get_stats should return mapping, got %O\n", stats);
    array(string) expected_keys = ({"hits", "misses", "evictions", "size", "max_files"});
    foreach (expected_keys, string key) {
        if (zero_type(stats[key])) {
            error("get_stats missing key: %s\n", key);
        }
    }
}

void test_get_stats_values_types() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mapping stats = mod->get_stats();
    array(string) expected_keys = ({"hits", "misses", "evictions", "size", "max_files"});
    foreach (expected_keys, string key) {
        if (!intp(stats[key])) {
            error("get_stats[%s] should be int, got %O\n", key, stats[key]);
        }
    }
}

void test_reset_stats() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mod->reset_stats();
    mapping stats = mod->get_stats();
    if (stats->hits != 0) error("hits should be 0 after reset, got %d\n", stats->hits);
    if (stats->misses != 0) error("misses should be 0 after reset, got %d\n", stats->misses);
    if (stats->evictions != 0) error("evictions should be 0 after reset, got %d\n", stats->evictions);
}

// =============================================================================
// CompilationContext
// =============================================================================

void test_context_create() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed ctx = mod->CompilationContext();
    if (!ctx) error("CompilationContext returned 0\n");
}

void test_context_add_import() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed ctx = mod->CompilationContext();
    ctx->add_import("Stdio");
    array(string) imports = ctx->get_imports();
    if (!arrayp(imports)) error("get_imports should return array\n");
    if (!has_value(imports, "Stdio")) error("Expected 'Stdio' in imports\n");
}

void test_context_add_imports_batch() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed ctx = mod->CompilationContext();
    ctx->add_imports(({"Stdio", "String", "Array"}));
    array(string) imports = ctx->get_imports();
    if (!has_value(imports, "Stdio") || !has_value(imports, "String") || !has_value(imports, "Array")) {
        error("Expected all three imports, got %O\n", imports);
    }
}

void test_context_has_import() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed ctx = mod->CompilationContext();
    ctx->add_import("Stdio");
    if (!ctx->has_import("Stdio")) error("has_import should return true for 'Stdio'\n");
    if (ctx->has_import("NonExistent")) error("has_import should return false for unknown\n");
}

void test_context_clear() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed ctx = mod->CompilationContext();
    ctx->add_import("Stdio");
    ctx->clear();
    if (ctx->size() != 0) error("size should be 0 after clear, got %d\n", ctx->size());
    if (ctx->has_import("Stdio")) error("has_import should be false after clear\n");
}

void test_context_size() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    mixed ctx = mod->CompilationContext();
    if (ctx->size() != 0) error("size should start at 0, got %d\n", ctx->size());
    ctx->add_import("A");
    ctx->add_import("B");
    if (ctx->size() != 2) error("size should be 2, got %d\n", ctx->size());
}

// =============================================================================
// Dependency Graph
// =============================================================================

void test_update_dependency_graph() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    // Should not throw
    mod->update_dependency_graph("test.pike", ({"dep1.pike", "dep2.pike"}));
}

void test_invalidate_transitive() {
    mixed mod = master()->resolv("LSP.CompilationCache");
    // Setup a dependency graph entry first
    mod->update_dependency_graph("test.pike", ({"dep1.pike"}));
    // Should not throw
    mod->invalidate_transitive("test.pike");
}
