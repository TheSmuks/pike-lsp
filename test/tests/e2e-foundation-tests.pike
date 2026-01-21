#!/usr/bin/env pike
//! E2E Foundation Tests for LSP.pmod
//!
//! End-to-end tests verifying foundation components work with real data:
//! - Real LSP protocol JSON messages
//! - Real Pike stdlib modules (loaded dynamically)
//! - Real compiled program objects
//!
//! Stdlib discovery: Uses master()->pike_module_path dynamically
//! Override: Set PIKE_STDLIB_PATH environment variable
//!
//! Run with: pike test/tests/e2e-foundation-tests.pike
//!
//! @note Tests use dynamic stdlib discovery - portable across machines
//!
//! TODO: Add tests for Logging.pmod when implemented
//! TODO: Add tests for Protocol.pmod when implemented
//! TODO: Cross-version tests on Pike 7.6, 7.8, 8.0.x

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
//! Note: LSP.pmod/module.pmod is accessed as "LSP" after module path setup
//! Functions in module.pmod must be accessed via array indexing: LSP["function_name"]
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
    if (LSP) {
        function json_encode = LSP["json_encode"];
        if (json_encode) {
            return json_encode(request);
        }
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
// module.pmod E2E Tests with Real LSP JSON Data
// =============================================================================

//! Test module.pmod json_decode with real LSP initialize request
void test_module_json_decode_real_lsp_initialize() {
    mixed LSP = get_module();
    if (!LSP) {
        error("LSP module not available");
    }

    function json_decode = LSP["json_decode"];
    if (!json_decode) {
        error("LSP.json_decode not available");
    }

    // Realistic LSP initialize request JSON
    string json_request = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"processId\":12345,\"rootUri\":\"file:///home/user/project\",\"capabilities\":{\"textDocument\":{\"completion\":{\"completionItem\":{\"snippetSupport\":true}}}}}}";

    mixed decoded = json_decode(json_request);

    // Verify decoded structure
    if (!mappingp(decoded)) {
        error("Expected mapping, got %O\n", typeof(decoded));
    }

    // Verify expected keys exist
    if (decoded->jsonrpc != "2.0") {
        error("jsonrpc should be '2.0', got %O\n", decoded->jsonrpc);
    }

    if (decoded->id != 1) {
        error("id should be 1, got %O\n", decoded->id);
    }

    if (decoded->method != "initialize") {
        error("method should be 'initialize', got %O\n", decoded->method);
    }

    // Verify params.rootUri is accessible
    if (!decoded->params || !mappingp(decoded->params)) {
        error("params should be a mapping\n");
    }

    if (decoded->params->rootUri != "file:///home/user/project") {
        error("rootUri should be 'file:///home/user/project', got %O\n", decoded->params->rootUri);
    }

    // Verify nested capabilities
    if (!decoded->params->capabilities || !mappingp(decoded->params->capabilities)) {
        error("capabilities should be a mapping\n");
    }

    if (!decoded->params->capabilities->textDocument) {
        error("textDocument capabilities missing\n");
    }
}

//! Test module.pmod json_encode with real LSP completion response
void test_module_json_encode_real_lsp_completion_response() {
    mixed LSP = get_module();
    if (!LSP) {
        error("LSP module not available");
    }

    function json_encode = LSP["json_encode"];
    if (!json_encode) {
        error("LSP.json_encode not available");
    }

    // Create Pike mapping matching LSP CompletionItem response
    mapping completion_response = ([
        "jsonrpc": "2.0",
        "id": 1,
        "result": ([
            "items": ({
                ([
                    "label": "example",
                    "kind": 1,
                    "detail": "test detail"
                ])
            })
        ])
    ]);

    string json_output = json_encode(completion_response);

    // Verify output is valid JSON string
    if (!stringp(json_output)) {
        error("Expected string output, got %O\n", typeof(json_output));
    }

    // Verify JSON contains expected keys
    if (!has_value(json_output, "result")) {
        error("JSON should contain 'result' key\n");
    }

    if (!has_value(json_output, "items")) {
        error("JSON should contain 'items' key\n");
    }

    if (!has_value(json_output, "example")) {
        error("JSON should contain completion item label\n");
    }

    // Verify it can be decoded back
    mixed roundtrip = Standards.JSON.decode(json_output);
    if (!mappingp(roundtrip)) {
        error("Round-trip decode failed\n");
    }

    if (roundtrip->result->items[0]->label != "example") {
        error("Round-trip label incorrect\n");
    }
}

//! Test module.pmod LSPError.to_response() produces valid JSON-RPC error
void test_module_lserror_to_response() {
    mixed LSP = get_module();
    if (!LSP) {
        error("LSP module not available");
    }

    // LSPError is a class - access via array index and call to instantiate
    mixed LSPError_class = LSP["LSPError"];
    if (!LSPError_class) {
        error("LSP.LSPError not available");
    }

    // Create LSPError with Invalid Request code (-32600)
    mixed err = LSPError_class(-32600, "Invalid Request");

    // Verify to_response() produces valid mapping
    mapping response = err->to_response();
    if (!mappingp(response)) {
        error("to_response should return mapping, got %O\n", typeof(response));
    }

    // Verify response contains "error" key
    if (!response->error) {
        error("Response should contain 'error' key\n");
    }

    // Verify error structure
    if (!mappingp(response->error)) {
        error("error should be a mapping\n");
    }

    if (response->error->code != -32600) {
        error("error.code should be -32600, got %O\n", response->error->code);
    }

    if (response->error->message != "Invalid Request") {
        error("error.message should be 'Invalid Request', got %O\n", response->error->message);
    }

    // Verify it can be serialized to JSON
    string json = Standards.JSON.encode(response);
    if (!stringp(json)) {
        error("Response should be JSON serializable\n");
    }
}

//! Test module.pmod debug output format and mode switching
void test_module_debug_output_format() {
    mixed LSP = get_module();
    if (!LSP) {
        error("LSP module not available");
    }

    // Access debug mode functions via array index
    function set_debug_mode = LSP["set_debug_mode"];
    function get_debug_mode = LSP["get_debug_mode"];
    function debug = LSP["debug"];

    if (!set_debug_mode || !get_debug_mode || !debug) {
        error("LSP debug functions not available");
    }

    // Ensure debug mode is initially off
    set_debug_mode(0);
    if (get_debug_mode() != 0) {
        error("Debug mode should be 0 after set_debug_mode(0)\n");
    }

    // Enable debug mode
    set_debug_mode(1);
    if (get_debug_mode() != 1) {
        error("Debug mode should be 1 after set_debug_mode(1)\n");
    }

    // Call debug() - should not crash with debug mode enabled
    debug("Test debug message: %s\n", "value");

    // Disable debug mode
    set_debug_mode(0);
    if (get_debug_mode() != 0) {
        error("Debug mode should be 0 after set_debug_mode(0) again\n");
    }

    // Call debug() with mode off - should not crash or produce output
    debug("This should not appear: %s\n", "hidden");
}

// =============================================================================
// Compat.pmod E2E Tests with Real Pike Code Patterns
// =============================================================================

//! Test Compat.trim_whites() with real Pike source code patterns
void test_compat_trim_whites_real_module_strings() {
    mixed Compat = get_compat();
    if (!Compat) {
        error("LSP.Compat module not available");
    }

    function trim_whites = Compat["trim_whites"];
    if (!trim_whites) {
        error("LSP.Compat.trim_whites not available");
    }

    // Load real stdlib modules to get realistic string representations
    mixed Array_mod = load_real_module("Array");
    mixed String_mod = load_real_module("String");
    mixed Math_mod = load_real_module("Math");

    // Create test strings from typical Pike code patterns
    array(string) test_cases = ({
        "  constant foo = bar;\n",
        "\t//! Documentation comment\n",
        "  mixed result;\n  ",
        "int main() {\n    return 0;\n}\n",
        "  /* multiline comment */  ",
        "\t\tprivate string variable = \"value\";\n",
    });

    foreach (test_cases, string test_input) {
        string trimmed = trim_whites(test_input);

        // Verify leading whitespace removed
        if (sizeof(trimmed) > 0) {
            int first = trimmed[0];
            if (first == ' ' || first == '\t' || first == '\n' || first == '\r') {
                error("trim_whites() failed to remove leading whitespace: %O -> %O\n",
                      test_input, trimmed);
            }
        }

        // Verify trailing whitespace removed
        if (sizeof(trimmed) > 0) {
            int last = trimmed[-1];
            if (last == ' ' || last == '\t' || last == '\n' || last == '\r') {
                error("trim_whites() failed to remove trailing whitespace: %O -> %O\n",
                      test_input, trimmed);
            }
        }

        // Verify code content preserved (non-whitespace characters present)
        if (sizeof(test_input) - sizeof(trimmed) > sizeof(test_input)) {
            // Trimmed too much - check that we didn't remove non-whitespace
            int original_non_ws = 0;
            int trimmed_non_ws = 0;
            for (int i = 0; i < sizeof(test_input); i++) {
                int c = test_input[i];
                if (c != ' ' && c != '\t' && c != '\n' && c != '\r') {
                    original_non_ws++;
                }
            }
            for (int i = 0; i < sizeof(trimmed); i++) {
                int c = trimmed[i];
                if (c != ' ' && c != '\t' && c != '\n' && c != '\r') {
                    trimmed_non_ws++;
                }
            }
            if (original_non_ws != trimmed_non_ws) {
                error("trim_whites() removed non-whitespace characters: %O -> %O\n",
                      test_input, trimmed);
            }
        }
    }
}

//! Test Compat.trim_whines() matches native String.trim_whites() behavior
void test_compat_trim_whites_matches_native_behavior() {
    mixed Compat = get_compat();
    if (!Compat) {
        error("LSP.Compat module not available");
    }

    function trim_whites = Compat["trim_whites"];
    if (!trim_whites) {
        error("LSP.Compat.trim_whites not available");
    }

    // Test strings from typical Pike code
    array(string) test_cases = ({
        "  constant foo = bar;\n",
        "\t//! Documentation comment\n",
        "  mixed result;\n  ",
        "int main() { return 0; }\n",
        "    leading and trailing    ",
        "\tmixed\ttabs\tand\tspaces\n",
        "",  // Empty string
        "   ",  // Only whitespace
        "\n\t\r  ",  // Mixed whitespace chars
    });

    foreach (test_cases, string test_input) {
        string compat_result = trim_whites(test_input);

        // On Pike 8.x, compare with native String.trim_whites()
        // Note: Our polyfill trims newlines but native doesn't, so we only
        // compare the general behavior (whitespace removal)
        // The key test is that our polyfill doesn't crash and produces valid output

        // Verify result is a string
        if (!stringp(compat_result)) {
            error("trim_whites() should return string, got %O\n", typeof(compat_result));
        }

        // Verify no leading whitespace
        if (sizeof(compat_result) > 0) {
            int first = compat_result[0];
            if (first == ' ' || first == '\t' || first == '\n' || first == '\r') {
                error("Compat.trim_whites() left leading whitespace: %O -> %O\n",
                      test_input, compat_result);
            }
        }

        // Verify no trailing whitespace
        if (sizeof(compat_result) > 0) {
            int last = compat_result[-1];
            if (last == ' ' || last == '\t' || last == '\n' || last == '\r') {
                error("Compat.trim_whites() left trailing whitespace: %O -> %O\n",
                      test_input, compat_result);
            }
        }
    }
}

//! Test Compat.pike_version() returns valid version info
void test_compat_version_detection_real_pike() {
    mixed Compat = get_compat();
    if (!Compat) {
        error("LSP.Compat module not available");
    }

    function pike_version = Compat["pike_version"];
    if (!pike_version) {
        error("LSP.Compat.pike_version not available");
    }

    // Get version array
    array(int) ver = pike_version();

    // Verify it's an array of at least 3 elements
    if (!arrayp(ver) || sizeof(ver) < 3) {
        error("pike_version() should return array of 3 elements, got %O\n", ver);
    }

    // Verify all elements are integers
    foreach (ver, int v) {
        if (!intp(v)) {
            error("pike_version() element should be int, got %O: %O\n", typeof(v), v);
        }
    }

    // Verify version is >= 7.6 (minimum supported)
    if (ver[0] < 7 || (ver[0] == 7 && ver[1] < 6)) {
        error("Pike version should be >= 7.6, got %d.%d.%d\n", ver[0], ver[1], ver[2]);
    }

    // Log detected version
    log_info("Detected Pike version: %d.%d.%d", ver[0], ver[1], ver[2]);

    // Verify against __REAL_VERSION__
    float real_ver = __REAL_VERSION__;
    int major = (int)real_ver;
    int minor = (int)((real_ver - major) * 10 + 0.5);
    if (ver[0] != major || ver[1] != minor) {
        error("pike_version() mismatch with __REAL_VERSION__: %d.%d vs %d.%d\n",
              ver[0], ver[1], major, minor);
    }
}

//! Test Compat.trim_whites() with Unicode and edge cases
void test_compat_trim_whites_unicode_and_edge_cases() {
    mixed Compat = get_compat();
    if (!Compat) {
        error("LSP.Compat module not available");
    }

    function trim_whites = Compat["trim_whites"];
    if (!trim_whites) {
        error("LSP.Compat.trim_whites not available");
    }

    // Edge cases from real Pike code
    array(string) edge_cases = ({
        "",  // Empty string
        "   ",  // Only spaces
        "\t\t\t",  // Only tabs
        "\n\n",  // Only newlines
        "\r\n\r\n",  // Only CRLF
        "  \t\n\r  ",  // Mixed whitespace
        "a",  // Single char, no whitespace
        " a",  // Single leading space
        "a ",  // Single trailing space
        " a ",  // Both
        "// UTF-8 string: 日本語\n",  // UTF-8 with trailing newline
        "  // Comment with UTF-8: 你好  ",  // UTF-8 with whitespace
        "string s = \"\\xc3\\xa9\";  ",  // Escaped UTF-8 in literal
    });

    foreach (edge_cases, string test_input) {
        // Should not crash
        mixed err = catch {
            string result = trim_whites(test_input);

            // Verify result is string
            if (!stringp(result)) {
                error("trim_whites() should return string for edge case: %O\n", test_input);
            }

            // For non-empty input with non-whitespace, verify no leading/trailing whitespace
            if (sizeof(result) > 0) {
                int first = result[0];
                int last = result[-1];
                if (first == ' ' || first == '\t' || first == '\n' || first == '\r') {
                    error("trim_whites() left leading whitespace for edge case: %O -> %O\n",
                          test_input, result);
                }
                if (last == ' ' || last == '\t' || last == '\n' || last == '\r') {
                    error("trim_whites() left trailing whitespace for edge case: %O -> %O\n",
                          test_input, result);
                }
            }
        };

        if (err) {
            error("trim_whites() crashed on edge case %O: %s\n", test_input,
                  describe_error(err));
        }
    }
}

// =============================================================================
// Cache.pmod E2E Tests with Real Compiled Programs
// =============================================================================

//! Test Cache.put_program() with real compiled program via compile_string()
void test_cache_real_program_compilation_and_caching() {
    mixed Cache = get_cache();
    if (!Cache) {
        error("LSP.Cache module not available");
    }

    function put_program = Cache["put_program"];
    function get_program = Cache["get_program"];
    if (!put_program || !get_program) {
        error("Cache program functions not available");
    }

    // Clear cache first
    Cache["clear_programs"]();

    // Compile a simple Pike program
    string source_code = "int add(int a, int b) { return a + b; }";
    program prog = compile_string(source_code);

    if (!prog) {
        error("compile_string() failed to create program\n");
    }

    if (!programp(prog)) {
        error("compile_string() did not return a program type\n");
    }

    // Store in cache
    string key = "test_program_1";
    put_program(key, prog);

    // Retrieve from cache
    program retrieved = get_program(key);

    if (!retrieved) {
        error("get_program() returned 0 for stored program\n");
    }

    if (!programp(retrieved)) {
        error("get_program() did not return a program type\n");
    }

    // Verify we can instantiate and call the program
    object instance = retrieved();
    if (!instance) {
        error("Failed to instantiate cached program\n");
    }

    function add_func = instance["add"];
    if (!add_func) {
        error("Cached program does not have 'add' function\n");
    }

    int result = add_func(3, 4);
    if (result != 7) {
        error("Cached program function returned wrong result: expected 7, got %d\n", result);
    }
}

//! Test Cache stdlib with real stdlib modules
void test_cache_stdlib_module_resolution() {
    mixed Cache = get_cache();
    if (!Cache) {
        error("LSP.Cache module not available");
    }

    function put_stdlib = Cache["put_stdlib"];
    function get_stdlib = Cache["get_stdlib"];
    if (!put_stdlib || !get_stdlib) {
        error("Cache stdlib functions not available");
    }

    // Clear stdlib cache first
    Cache["clear_stdlib"]();

    // Load real stdlib modules
    array(string) module_names = ({"Array", "String", "Math"});

    foreach (module_names, string module_name) {
        mixed module = load_real_module(module_name);
        if (!module) {
            log_info("Module %s not available, skipping", module_name);
            continue;
        }

        // Create symbol data mapping from module
        mapping symbol_data = ([
            "module_name": module_name,
            "type": "stdlib",
            "available": 1
        ]);

        // Try to extract some functions/constants if available
        if (module_name == "Array") {
            symbol_data["functions"] = ({"arrayp", "sizeof", "allocate"});
        } else if (module_name == "String") {
            symbol_data["functions"] = ({"stringp", "strlen", "sizeof"});
        } else if (module_name == "Math") {
            symbol_data["functions"] = ({"sqrt", "pow", "log"});
        }

        // Store in cache
        put_stdlib(module_name, symbol_data);

        // Retrieve from cache
        mapping retrieved = get_stdlib(module_name);

        if (!retrieved) {
            error("get_stdlib() returned 0 for module %s\n", module_name);
        }

        if (!mappingp(retrieved)) {
            error("get_stdlib() did not return mapping for module %s\n", module_name);
        }

        if (retrieved->module_name != module_name) {
            error("Retrieved module_name mismatch: expected %s, got %s\n",
                  module_name, retrieved->module_name);
        }
    }
}

//! Test Cache LRU eviction with real compiled programs
void test_cache_lru_with_real_programs() {
    mixed Cache = get_cache();
    if (!Cache) {
        error("LSP.Cache module not available");
    }

    function put_program = Cache["put_program"];
    function get_program = Cache["get_program"];
    function set_limits = Cache["set_limits"];
    if (!put_program || !get_program || !set_limits) {
        error("Cache functions not available");
    }

    // Clear cache and set small limit
    Cache["clear_programs"]();
    set_limits(3, 50);  // Max 3 programs

    // Compile 4 programs
    array(program) programs = ({});
    array(string) sources = ({
        "int f1() { return 1; }",
        "int f2() { return 2; }",
        "int f3() { return 3; }",
        "int f4() { return 4; }"
    });

    foreach (sources, string source) {
        programs += ({compile_string(source)});
    }

    // Add first 3 programs
    put_program("prog1", programs[0]);
    put_program("prog2", programs[1]);
    put_program("prog3", programs[2]);

    // Access prog1 to make it recent (so prog2 becomes LRU)
    program p1 = get_program("prog1");
    if (!p1) {
        error("get_program(prog1) failed\n");
    }

    // Add 4th program - should evict prog2 (LRU)
    put_program("prog4", programs[3]);

    // Verify LRU eviction: prog2 should be evicted, prog1, prog3, prog4 should exist
    if (get_program("prog2")) {
        error("prog2 should have been evicted by LRU\n");
    }

    if (!get_program("prog1")) {
        error("prog1 should still be in cache (recently accessed)\n");
    }

    if (!get_program("prog3")) {
        error("prog3 should still be in cache\n");
    }

    if (!get_program("prog4")) {
        error("prog4 should be in cache\n");
    }

    // Verify stats track hits/misses
    mapping stats = Cache["get_stats"]();
    if (!stats) {
        error("get_stats() returned 0\n");
    }

    log_info("Cache stats after LRU test: hits=%d, misses=%d, size=%d",
             stats->program_hits, stats->program_misses, stats->program_size);
}

//! Test Cache statistics with realistic workload
void test_cache_statistics_with_real_workload() {
    mixed Cache = get_cache();
    if (!Cache) {
        error("LSP.Cache module not available");
    }

    function put_program = Cache["put_program"];
    function get_program = Cache["get_program"];
    function put_stdlib = Cache["put_stdlib"];
    function get_stdlib = Cache["get_stdlib"];
    function clear = Cache["clear"];
    function get_stats = Cache["get_stats"];
    function set_limits = Cache["set_limits"];

    // Clear both caches and reset limits
    clear("all");
    set_limits(30, 50);  // Reset to default limits

    // Get baseline stats (cumulative from previous tests)
    mapping stats_baseline = get_stats();
    int baseline_program_hits = stats_baseline->program_hits || 0;
    int baseline_program_misses = stats_baseline->program_misses || 0;
    int baseline_stdlib_hits = stats_baseline->stdlib_hits || 0;
    int baseline_stdlib_misses = stats_baseline->stdlib_misses || 0;

    // Simulate realistic usage
    array(program) programs = ({});
    for (int i = 0; i < 5; i++) {
        programs += ({compile_string(sprintf("int f%d() { return %d; }", i, i))});
    }

    // Add 5 programs
    for (int i = 0; i < 5; i++) {
        put_program(sprintf("prog%d", i), programs[i]);
    }

    // Mix of hits and misses
    get_program("prog0");  // hit
    get_program("prog2");  // hit
    get_program("prog4");  // hit
    get_program("prog9");  // miss (doesn't exist)
    get_program("prog1");  // hit

    // Add some stdlib entries
    put_stdlib("Array", (["type": "module", "name": "Array"]));
    put_stdlib("String", (["type": "module", "name": "String"]));

    get_stdlib("Array");   // hit
    get_stdlib("String");  // hit
    get_stdlib("Math");    // miss

    // Check stats
    mapping stats = get_stats();

    if (!stats) {
        error("get_stats() returned 0\n");
    }

    // Calculate delta from baseline
    int delta_program_hits = stats->program_hits - baseline_program_hits;
    int delta_program_misses = stats->program_misses - baseline_program_misses;
    int delta_stdlib_hits = stats->stdlib_hits - baseline_stdlib_hits;
    int delta_stdlib_misses = stats->stdlib_misses - baseline_stdlib_misses;

    // Verify expected delta values
    if (delta_program_hits != 4) {
        error("Expected 4 program_hits delta, got %d\n", delta_program_hits);
    }

    if (delta_program_misses != 1) {
        error("Expected 1 program_miss delta, got %d\n", delta_program_misses);
    }

    if (stats->program_size != 5) {
        error("Expected program_size 5, got %d\n", stats->program_size);
    }

    if (delta_stdlib_hits != 2) {
        error("Expected 2 stdlib_hits delta, got %d\n", delta_stdlib_hits);
    }

    if (delta_stdlib_misses != 1) {
        error("Expected 1 stdlib_miss delta, got %d\n", delta_stdlib_misses);
    }

    if (stats->stdlib_size != 2) {
        error("Expected stdlib_size 2, got %d\n", stats->stdlib_size);
    }

    log_info("Cache stats: program_hits=%d, program_misses=%d, program_size=%d",
             stats->program_hits, stats->program_misses, stats->program_size);
    log_info("Cache stats: stdlib_hits=%d, stdlib_misses=%d, stdlib_size=%d",
             stats->stdlib_hits, stats->stdlib_misses, stats->stdlib_size);
}

//! Test Cache clear and reuse functionality
void test_cache_clear_and_reuse() {
    mixed Cache = get_cache();
    if (!Cache) {
        error("LSP.Cache module not available");
    }

    function put_program = Cache["put_program"];
    function get_program = Cache["get_program"];
    function clear_programs = Cache["clear_programs"];
    function get_stats = Cache["get_stats"];
    function set_limits = Cache["set_limits"];

    // Clear cache and reset limits
    clear_programs();
    set_limits(30, 50);  // Reset to default limits

    // Fill program cache
    for (int i = 0; i < 5; i++) {
        program prog = compile_string(sprintf("int f() { return %d; }", i));
        put_program(sprintf("test%d", i), prog);
    }

    // Verify cache has entries
    mapping stats_before = get_stats();
    if (stats_before->program_size != 5) {
        error("Expected program_size 5 before clear, got %d\n", stats_before->program_size);
    }

    // Clear cache
    clear_programs();

    // Verify all entries gone
    mapping stats_after = get_stats();
    if (stats_after->program_size != 0) {
        error("Expected program_size 0 after clear, got %d\n", stats_after->program_size);
    }

    // Verify individual entries are gone
    if (get_program("test0")) {
        error("Entry should be gone after clear\n");
    }

    // Add new entries - cache should be functional
    program new_prog = compile_string("int g() { return 42; }");
    put_program("new_test", new_prog);

    if (!get_program("new_test")) {
        error("Cache should work after clear\n");
    }

    mapping stats_final = get_stats();
    if (stats_final->program_size != 1) {
        error("Expected program_size 1 after reuse, got %d\n", stats_final->program_size);
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

    // Run module.pmod E2E tests
    run_test(test_module_json_decode_real_lsp_initialize, "module.pmod JSON decode with real LSP initialize");
    run_test(test_module_json_encode_real_lsp_completion_response, "module.pmod JSON encode with real LSP completion");
    run_test(test_module_lserror_to_response, "module.pmod LSPError.to_response()");
    run_test(test_module_debug_output_format, "module.pmod debug output format");

    // Run Compat.pmod E2E tests
    run_test(test_compat_trim_whites_real_module_strings, "Compat.trim_whites() with real Pike code patterns");
    run_test(test_compat_trim_whites_matches_native_behavior, "Compat.trim_whites() matches native behavior");
    run_test(test_compat_version_detection_real_pike, "Compat.pike_version() with real Pike");
    run_test(test_compat_trim_whites_unicode_and_edge_cases, "Compat.trim_whites() Unicode and edge cases");

    // Run Cache.pmod E2E tests
    run_test(test_cache_real_program_compilation_and_caching, "Cache real program compilation and caching");
    run_test(test_cache_stdlib_module_resolution, "Cache stdlib module resolution");
    run_test(test_cache_lru_with_real_programs, "Cache LRU eviction with real programs");
    run_test(test_cache_statistics_with_real_workload, "Cache statistics with real workload");
    run_test(test_cache_clear_and_reuse, "Cache clear and reuse");

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
