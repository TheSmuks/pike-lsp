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
}

//! Get LSP.Compat module (runtime resolution)
mixed get_compat() {
    return master()->resolv("LSP.Compat");
}

//! Get LSP.Cache module (runtime resolution)
mixed get_cache() {
    return master()->resolv("LSP.Cache");
}

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
    // Setup module path before any LSP imports
    setup_module_path();

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
// Compat.pmod Unit Tests (FND-12)
// =============================================================================

//! Test Compat.pike_version returns valid version array
void test_compat_pike_version() {
    mixed compat = get_compat();
    array version = compat->pike_version();
    if (sizeof(version) < 3) {
        error("Version array too small: %O\n", version);
    }
    if (version[0] < 7) {
        error("Pike version too old: %O\n", version);
    }
    // Verify version is 7.6, 7.8, or 8.x
    if (!(version[0] == 7 && (version[1] == 6 || version[1] == 8)) &&
        version[0] != 8) {
        error("Unsupported Pike version: %O\n", version);
    }
}

//! Test Compat.PIKE_VERSION_STRING constant
void test_compat_pi_version_constant() {
    mixed compat = get_compat();
    string version_str = compat->PIKE_VERSION_STRING;
    if (!stringp(version_str) || sizeof(version_str) == 0) {
        error("PIKE_VERSION_STRING invalid: %O\n", version_str);
    }
    // Verify it matches format "X.Y" (patch version optional)
    // Use Regexp.SimpleRegexp() for Pike 8.x
    object re = Regexp.SimpleRegexp("^[0-9]+\\.[0-9]+$");
    if (!re->match(version_str)) {
        error("PIKE_VERSION_STRING format invalid: %s\n", version_str);
    }
}

//! Test Compat.trim_whites basic functionality
void test_compat_trim_whites_basic() {
    mixed compat = get_compat();
    // Test leading whitespace
    string result1 = compat->trim_whites("  test");
    if (result1 != "test") {
        error("Leading whitespace not trimmed: %O\n", result1);
    }

    // Test trailing whitespace
    string result2 = compat->trim_whites("test  ");
    if (result2 != "test") {
        error("Trailing whitespace not trimmed: %O\n", result2);
    }

    // Test both
    string result3 = compat->trim_whites("  test  ");
    if (result3 != "test") {
        error("Both sides not trimmed: %O\n", result3);
    }
}

//! Test Compat.trim_whites with tabs and newlines
void test_compat_trim_whites_tabs_and_newlines() {
    mixed compat = get_compat();
    // Test tabs
    string result1 = compat->trim_whites("\ttest\t");
    if (result1 != "test") {
        error("Tabs not trimmed: %O\n", result1);
    }

    // Test newlines
    string result2 = compat->trim_whites("\ntest\n");
    if (result2 != "test") {
        error("Newlines not trimmed: %O\n", result2);
    }

    // Test mixed whitespace
    string result3 = compat->trim_whites(" \n\t test \t\n ");
    if (result3 != "test") {
        error("Mixed whitespace not trimmed: %O\n", result3);
    }
}

//! Test Compat.trim_whites with empty strings
void test_compat_trim_whites_empty() {
    mixed compat = get_compat();
    // Test empty string
    string result1 = compat->trim_whites("");
    if (result1 != "") {
        error("Empty string modified: %O\n", result1);
    }

    // Test whitespace only
    string result2 = compat->trim_whites("   ");
    if (result2 != "") {
        error("Whitespace-only not trimmed to empty: %O\n", result2);
    }
}

//! Test Compat.trim_whites preserves internal whitespace
void test_compat_trim_whites_preserves_internal() {
    mixed compat = get_compat();
    // Test that internal whitespace is preserved
    string result = compat->trim_whites("  hello  world  ");
    if (result != "hello  world") {
        error("Internal whitespace modified: %O\n", result);
    }
}

// =============================================================================
// Cache.pmod Unit Tests (FND-13)
// =============================================================================

//! Test Cache program put/get operations
void test_cache_program_put_get() {
    mixed cache = get_cache();

    // Clear cache first for clean state
    cache->clear("program_cache");

    // Put and get
    cache->put("program_cache", "key1", "program1");
    mixed result = cache->get("program_cache", "key1");
    if (result != "program1") {
        error("Put/get failed: expected 'program1', got %O\n", result);
    }

    // Get non-existent key should return 0
    mixed missing = cache->get("program_cache", "nonexistent");
    if (missing != 0) {
        error("Missing key should return 0, got %O\n", missing);
    }
}

//! Test Cache stdlib put/get operations
void test_cache_stdlib_put_get() {
    mixed cache = get_cache();

    cache->clear("stdlib_cache");

    // Put and get with mapping data
    mapping data = (["symbols": (["foo": "bar"])]);
    cache->put("stdlib_cache", "module1", data);
    mixed result = cache->get("stdlib_cache", "module1");
    if (!mappingp(result)) {
        error("Stdlib get should return mapping, got %O\n", result);
    }
    if (result->symbols->foo != "bar") {
        error("Stdlib put/get failed: %O\n", result);
    }
}

//! Test Cache clear operation
void test_cache_clear() {
    mixed cache = get_cache();

    cache->clear("program_cache");

    cache->put("program_cache", "key1", "value1");
    cache->put("program_cache", "key2", "value2");

    cache->clear("program_cache");

    mixed result1 = cache->get("program_cache", "key1");
    mixed result2 = cache->get("program_cache", "key2");

    if (result1 != 0 || result2 != 0) {
        error("Clear failed: keys still exist (key1=%O, key2=%O)\n", result1, result2);
    }
}

//! Test Cache LRU eviction behavior
void test_cache_program_lru_eviction() {
    mixed cache = get_cache();

    cache->clear("program_cache");
    cache->set_limits(3, 50);  // Set small limit for testing

    // Fill cache to limit
    cache->put("program_cache", "key1", "value1");
    cache->put("program_cache", "key2", "value2");
    cache->put("program_cache", "key3", "value3");

    // Access key1 to make it recently used (key2 becomes LRU)
    cache->get("program_cache", "key1");

    // Add one more - should evict key2 (least recently used)
    cache->put("program_cache", "key4", "value4");

    // key2 should be evicted
    if (cache->get("program_cache", "key2") != 0) {
        error("LRU eviction failed: key2 should have been evicted\n");
    }
    // key1 should remain (was accessed)
    if (cache->get("program_cache", "key1") != "value1") {
        error("LRU eviction error: key1 should remain\n");
    }
    // key3 should remain
    if (cache->get("program_cache", "key3") != "value3") {
        error("LRU eviction error: key3 should remain\n");
    }
    // key4 should exist
    if (cache->get("program_cache", "key4") != "value4") {
        error("LRU eviction error: key4 should exist\n");
    }
}

//! Test Cache statistics tracking
void test_cache_statistics() {
    mixed cache = get_cache();

    cache->clear("program_cache");
    cache->clear("stdlib_cache");

    // Initial stats
    mapping stats = cache->get_stats();
    if (stats->program_size != 0) {
        error("Initial program_size should be 0, got %d\n", stats->program_size);
    }

    // Add items
    cache->put("program_cache", "key1", "value1");
    cache->put("program_cache", "key2", "value2");

    // Hit and miss
    cache->get("program_cache", "key1");  // hit
    cache->get("program_cache", "missing");  // miss

    stats = cache->get_stats();
    if (stats->program_size != 2) {
        error("Size should be 2, got %d\n", stats->program_size);
    }
    if (stats->program_hits < 1) {
        error("Hits should be at least 1, got %d\n", stats->program_hits);
    }
    if (stats->program_misses < 1) {
        error("Misses should be at least 1, got %d\n", stats->program_misses);
    }
}

//! Test Cache set_limits operation
void test_cache_set_limits() {
    mixed cache = get_cache();

    cache->set_limits(5, 10);

    mapping stats = cache->get_stats();
    if (stats->program_max != 5) {
        error("program_max should be 5, got %d\n", stats->program_max);
    }
    if (stats->stdlib_max != 10) {
        error("stdlib_max should be 10, got %d\n", stats->stdlib_max);
    }
}

//! Test Cache clear all operation
void test_cache_clear_all() {
    mixed cache = get_cache();

    cache->put("program_cache", "key1", "value1");
    cache->put("stdlib_cache", "module1", (["data": "test"]));

    cache->clear("all");

    mapping stats = cache->get_stats();
    if (stats->program_size != 0 || stats->stdlib_size != 0) {
        error("Clear all failed: sizes not zero (program=%d, stdlib=%d)\n",
              stats->program_size, stats->stdlib_size);
    }
}
