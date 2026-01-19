#!/usr/bin/env pike
//! E2E Foundation Tests
//!
//! End-to-end tests for LSP.pmod foundation modules using real LSP protocol JSON data.
//! Tests module.pmod JSON handling with actual LSP request/response structures.
//!
//! Run with: pike test/tests/e2e-foundation-tests.pike

// =============================================================================
// Test Counters
// =============================================================================
int tests_run = 0;
int tests_passed = 0;
int tests_failed = 0;
array(string) failures = ({});

// =============================================================================
// VSCode Console Output Format
// =============================================================================
//! Format: [timestamp] [LEVEL] message
//! Levels: TEST, PASS, FAIL, INFO, ERROR

//! Log with VSCode console format
//! @param level Log level (TEST, PASS, FAIL, INFO, ERROR)
//! @param format Printf-style format string
//! @param args Variable arguments for format string
void log_message(string level, string format, mixed... args) {
    // Use Calendar for ISO 8601 timestamp
    object now = Calendar.now();
    string timestamp = sprintf("%04d-%02d-%02dT%02d:%02d:%02d",
        now->year_no(), now->month_no(), now->month_day(),
        now->hour_no(), now->minute_no(), now->second_no());
    write("[%s] [%s] %s\n", timestamp, level, sprintf(format, @args));
}

//! Log test start
void log_test(string name) {
    log_message("TEST", name);
}

//! Log test pass
void log_pass(string name) {
    log_message("PASS", name);
}

//! Log test fail
void log_fail(string name, mixed err) {
    log_message("FAIL", "%s - %s", name, describe_error(err));
}

//! Log info message
void log_info(string format, mixed... args) {
    log_message("INFO", format, @args);
}

//! Log error message
void log_error(string format, mixed... args) {
    log_message("ERROR", format, @args);
}

//! Describe error for logging
//! @param err Error object from catch
//! @returns String description of error
string describe_error(mixed err) {
    if (arrayp(err)) {
        return sprintf("%O", err[0] || "Unknown error");
    } else if (stringp(err)) {
        return err;
    } else {
        return sprintf("%O", err);
    }
}

// =============================================================================
// Stdlib Path Discovery (Portable)
// =============================================================================
string stdlib_path = "";

//! Discover stdlib path dynamically - no hardcoded paths
//! Uses master()->pike_module_path first, falls back to environment variable
//! @returns Discovered stdlib path or empty string
string discover_stdlib_path() {
    // Try master()->pike_module_path first (built-in module search paths)
    array(string) module_paths = master()->pike_module_path;
    if (module_paths && sizeof(module_paths) > 0) {
        // Return the first valid path that looks like a stdlib location
        foreach (module_paths, string path) {
            if (path && sizeof(path) > 0) {
                // Check if path exists
                if (Stdio.exist(path)) {
                    log_info("Discovered stdlib path from pike_module_path: %s", path);
                    return path;
                }
            }
        }
    }

    // Fall back to environment variable if set
    string env_path = getenv("PIKE_STDLIB_PATH");
    if (env_path && sizeof(env_path) > 0) {
        log_info("Discovered stdlib path from PIKE_STDLIB_PATH: %s", env_path);
        return env_path;
    }

    // Fall back to __FILE__ relative path for development
    string script_path = dirname(__FILE__);
    string base_path = script_path;
    for (int i = 0; i < 10; i++) {
        if (basename(base_path) == "pike-lsp") {
            break;
        }
        string parent = dirname(base_path);
        if (parent == base_path) break;  // Reached root
        base_path = parent;
    }
    // Don't hardcode any path - just report relative discovery
    log_info("Stdlib path: Using relative discovery from: %s", base_path);

    return base_path;
}

// =============================================================================
// Module Path Setup
// =============================================================================
//! Setup module path for LSP.pmod imports
void setup_module_path() {
    string script_path = __FILE__;
    string base_path = dirname(script_path);
    // Navigate up to find pike-lsp directory
    for (int i = 0; i < 10; i++) {
        if (basename(base_path) == "pike-lsp") {
            break;
        }
        string parent = dirname(base_path);
        if (parent == base_path) break;  // Reached root
        base_path = parent;
    }
    string pike_scripts_path = combine_path(base_path, "pike-scripts");
    master()->add_module_path(pike_scripts_path);
    log_info("Added module path: %s", pike_scripts_path);
}

// =============================================================================
// Module Helpers (Runtime Resolution)
// =============================================================================
//! Get LSP.Compat module (runtime resolution)
mixed get_compat() {
    return master()->resolv("LSP.Compat");
}

//! Get LSP.Cache module (runtime resolution)
mixed get_cache() {
    return master()->resolv("LSP.Cache");
}

//! Get LSP main module (runtime resolution)
mixed get_module() {
    return master()->resolv("LSP");
}

// =============================================================================
// E2E Test Helpers
// =============================================================================
//! Load real stdlib module using master()->resolv()
//! @param module_name Name of the stdlib module to load
//! @returns Module object or 0 if not found
mixed load_real_module(string module_name) {
    mixed module = master()->resolv(module_name);
    if (module) {
        log_info("Loaded real module: %s", module_name);
    } else {
        log_info("Module not found (may not be available): %s", module_name);
    }
    return module;
}

//! Create a mock LSP request for testing
//! @param method LSP method name (e.g., "initialize")
//! @param id Request ID
//! @param params Optional parameters mapping
//! @returns JSON string of LSP request
string create_mock_lsp_request(string method, int|string id, void|mapping params) {
    mapping request = ([
        "jsonrpc": "2.0",
        "id": id,
        "method": method
    ]);
    if (params) {
        request->params = params;
    }
    mixed LSP = get_module();
    if (LSP && LSP->json_encode) {
        return LSP->json_encode(request);
    }
    // Fallback if module not available yet
    return Standards.JSON.encode(request);
}

//! Get current Pike version for logging
//! @returns String representation of Pike version
string get_pike_version() {
    // __REAL_VERSION__ is a float like 8.0, convert to version string
    float ver = __REAL_VERSION__;
    int major = (int)ver;
    int minor = (int)((ver - major) * 10 + 0.5);
    return sprintf("%d.%d", major, minor);
}

// =============================================================================
// Test Runner
// =============================================================================
//! Run a single test function with error handling
//! @param test_func The test function to execute
//! @param name Descriptive name for the test
void run_test(function test_func, string name) {
    tests_run++;
    log_test(name);

    mixed err = catch {
        test_func();
        tests_passed++;
        log_pass(name);
    };

    if (err) {
        tests_failed++;
        failures += ({ name });
        log_fail(name, err);
    }
}

// =============================================================================
// Main Entry Point
// =============================================================================
int main() {
    // Setup module path before any LSP imports
    setup_module_path();

    // Discover stdlib path
    stdlib_path = discover_stdlib_path();

    write("\n");
    log_info("Starting E2E Foundation Tests");
    log_info("Pike version: %s", get_pike_version());
    log_info("Test runner initialized");
    write("\n");

    // Run tests (none yet - infrastructure only)
    // Test cases will be added in the next task

    write("\n");
    log_info("Tests run: %d, passed: %d, failed: %d", tests_run, tests_passed, tests_failed);

    if (tests_failed > 0) {
        write("\n");
        log_error("Failed tests:");
        foreach (failures, string name) {
            write("  - %s\n", name);
        }
        return 1;
    }
    return 0;
}
