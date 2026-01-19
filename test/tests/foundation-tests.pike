#!/usr/bin/env pike
//! LSP Foundation Tests
//!
//! Unit tests for LSP.pmod foundation modules:
//! - Compat.pmod: Version detection and polyfills
//! - Cache.pmod: LRU caching with statistics
//!
//! Run with: pike test/tests/foundation-tests.pike

int tests_run = 0;
int tests_passed = 0;
int tests_failed = 0;
array(string) failures = ({});

//! Run a single test function with error handling
//!
//! @param test_func The test function to execute
//! @param name Descriptive name for the test
void run_test(function test_func, string name) {
    tests_run++;
    mixed err = catch {
        test_func();
        tests_passed++;
        write("  PASS: %s\n", name);
    };
    if (err) {
        tests_failed++;
        failures += ({ name });
        write("  FAIL: %s\n", name);
        // Describe the error - handle both array and string error formats
        if (arrayp(err)) {
            write("    Error: %s\n", err[0] || "Unknown error");
        } else {
            write("    Error: %s\n", sprintf("%O", err));
        }
    }
}

//! Main test runner
//!
//! Registers and executes all test functions
int main() {
    write("LSP Foundation Tests\n");
    write("=====================\n\n");

    // Compat.pmod tests
    run_test(test_compat_pike_version, "Compat.pike_version");
    run_test(test_compat_pi_version_constant, "Compat.PIKE_VERSION_STRING");
    run_test(test_compat_trim_whites_basic, "Compat.trim_whites basic");
    run_test(test_compat_trim_whites_tabs_and_newlines, "Compat.trim_whites tabs/newlines");
    run_test(test_compat_trim_whites_empty, "Compat.trim_whites empty strings");
    run_test(test_compat_trim_whites_preserves_internal, "Compat.trim_whites internal whitespace");

    // Cache.pmod tests
    run_test(test_cache_program_put_get, "Cache program put/get");
    run_test(test_cache_stdlib_put_get, "Cache stdlib put/get");
    run_test(test_cache_clear, "Cache clear");
    run_test(test_cache_program_lru_eviction, "Cache LRU eviction");
    run_test(test_cache_statistics, "Cache statistics");
    run_test(test_cache_set_limits, "Cache set_limits");
    run_test(test_cache_clear_all, "Cache clear all");

    write("\n");
    write("Results: %d run, %d passed, %d failed\n", tests_run, tests_passed, tests_failed);

    if (tests_failed > 0) {
        write("\nFailed tests:\n");
        foreach (failures, string name) {
            write("  - %s\n", name);
        }
        return 1;
    }
    return 0;
}

// =============================================================================
// Test functions will be added in subsequent tasks
// =============================================================================

//! Placeholder for Compat.pike_version test
void test_compat_pike_version() {
    // Task 2: Implement test
}

//! Placeholder for Compat.PIKE_VERSION_STRING test
void test_compat_pi_version_constant() {
    // Task 2: Implement test
}

//! Placeholder for Compat.trim_whites basic test
void test_compat_trim_whites_basic() {
    // Task 2: Implement test
}

//! Placeholder for Compat.trim_whites tabs/newlines test
void test_compat_trim_whites_tabs_and_newlines() {
    // Task 2: Implement test
}

//! Placeholder for Compat.trim_whites empty test
void test_compat_trim_whites_empty() {
    // Task 2: Implement test
}

//! Placeholder for Compat.trim_whites internal whitespace test
void test_compat_trim_whites_preserves_internal() {
    // Task 2: Implement test
}

//! Placeholder for Cache program put/get test
void test_cache_program_put_get() {
    // Task 3: Implement test
}

//! Placeholder for Cache stdlib put/get test
void test_cache_stdlib_put_get() {
    // Task 3: Implement test
}

//! Placeholder for Cache clear test
void test_cache_clear() {
    // Task 3: Implement test
}

//! Placeholder for Cache LRU eviction test
void test_cache_program_lru_eviction() {
    // Task 3: Implement test
}

//! Placeholder for Cache statistics test
void test_cache_statistics() {
    // Task 3: Implement test
}

//! Placeholder for Cache set_limits test
void test_cache_set_limits() {
    // Task 3: Implement test
}

//! Placeholder for Cache clear all test
void test_cache_clear_all() {
    // Task 3: Implement test
}
