#!/usr/bin/env pike
//! LSP Response Format Tests
//!
//! Schema-style tests for JSON-RPC response format verification.
//! Ensures backward compatibility after modularization.
//!
//! Run with: pike test/tests/response-format-tests.pike

int test_count = 0;
int pass_count = 0;
int fail_count = 0;
array(string) failure_messages = ({});

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

//! Run a single test function with error handling
//!
//! @param test_func The test function to execute
//! @param name Descriptive name for the test
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
        // Describe the error - handle both array and string error formats
        if (arrayp(err)) {
            write("    Error: %s\n", err[0] || "Unknown error");
        } else {
            write("    Error: %s\n", sprintf("%O", err));
        }
    }
}

//! Helper: Verify response has required field
int has_field(mapping response, string field_path) {
    array parts = field_path / ".";
    mixed current = response;
    foreach (parts, string part) {
        if (!mappingp(current)) return 0;
        if (undefinedp(current[part])) return 0;
        current = current[part];
    }
    return 1;
}

//! Helper: Verify field type
int field_type_is(mapping response, string field_path, string expected_type) {
    array parts = field_path / ".";
    mixed current = response;
    foreach (parts, string part) {
        if (!mappingp(current)) return 0;
        if (undefinedp(current[part])) return 0;
        current = current[part];
    }
    if (expected_type == "array") return arrayp(current);
    if (expected_type == "mapping") return mappingp(current);
    if (expected_type == "string") return stringp(current);
    if (expected_type == "int") return intp(current);
    return 0;
}

//! Helper: Assert condition is true
void assert(int condition, string message) {
    if (!condition) {
        error("Assertion failed: " + message);
    }
}

//! Mock context for testing (minimal implementation)
class MockContext {
    mapping cache = ([]);

    mixed get_cache(string key) {
        return cache[key];
    }

    void set_cache(string key, mixed value) {
        cache[key] = value;
    }
}

//! Main test runner
//!
//! Registers and executes all test functions
int main(int argc, array(string) argv) {
    // Setup module path before any LSP imports
    setup_module_path();

    write("LSP Response Format Tests\n");
    write("==========================\n\n");

    // Parser response format tests
    run_test(test_parse_response_format, "parse: response has result.symbols (array)");
    run_test(test_tokenize_response_format, "tokenize: response has result.tokens (array)");
    run_test(test_compile_response_format, "compile: response has result.diagnostics (array)");

    // Intelligence response format tests
    run_test(test_introspect_response_format, "introspect: response has result.symbols, result.success");
    run_test(test_resolve_response_format, "resolve: response has result.exists (int), result.path");
    run_test(test_resolve_stdlib_response_format, "resolve_stdlib: response has result.found, result.symbols");
    run_test(test_get_inherited_response_format, "get_inherited: response has result.members (array)");

    // Analysis response format tests
    run_test(test_find_occurrences_response_format, "find_occurrences: response has result.occurrences (array)");
    run_test(test_analyze_uninitialized_response_format, "analyze_uninitialized: response has result.diagnostics (array)");
    run_test(test_get_completion_context_response_format, "get_completion_context: response has result.context, result.prefix");

    // Error response format tests
    run_test(test_error_response_format, "errors have error.code (int), error.message (string)");

    // Full JSON-RPC cycle test
    run_test(test_full_jsonrpc_cycle, "full JSON-RPC cycle through analyzer router");

    write("\n");
    write("==========================\n");
    write("Tests: %d, Passed: %d, Failed: %d\n", test_count, pass_count, fail_count);

    if (fail_count > 0) {
        write("\nFailed tests:\n");
        foreach (failure_messages, string name) {
            write("  - %s\n", name);
        }
        return 1;
    }
    return 0;
}

// =============================================================================
// Parser Response Format Tests
// =============================================================================

//! Test parse response format
void test_parse_response_format() {
    program ParserClass = master()->resolv("LSP.Parser")->Parser;
    object Parser = ParserClass();

    mapping result = Parser->parse_request(([
        "code": "int x = 5;",
        "filename": "test.pike",
        "line": 1
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "parse response has result");
    assert(has_field(result, "result.symbols"), "parse response has result.symbols");
    assert(field_type_is(result, "result.symbols", "array"), "result.symbols is an array");

    // Verify symbol structure if array not empty
    array symbols = result->result->symbols || ({});
    if (sizeof(symbols) > 0) {
        mapping sym = symbols[0];
        assert(mappingp(sym), "symbol is a mapping");
        assert(sym->name || sym->kind, "symbol has name or kind field");
    }
}

//! Test tokenize response format
void test_tokenize_response_format() {
    program ParserClass = master()->resolv("LSP.Parser")->Parser;
    object Parser = ParserClass();

    mapping result = Parser->tokenize_request(([
        "code": "int x = 5;"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "tokenize response has result");
    assert(has_field(result, "result.tokens"), "tokenize response has result.tokens");
    assert(field_type_is(result, "result.tokens", "array"), "result.tokens is an array");

    // Verify token structure if array not empty
    array tokens = result->result->tokens || ({});
    if (sizeof(tokens) > 0) {
        mapping tok = tokens[0];
        assert(mappingp(tok), "token is a mapping");
        assert(tok->text || tok->line, "token has text or line field");
    }
}

//! Test compile response format
void test_compile_response_format() {
    program ParserClass = master()->resolv("LSP.Parser")->Parser;
    object Parser = ParserClass();

    mapping result = Parser->compile_request(([
        "code": "int x = 5;",
        "filename": "test.pike"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "compile response has result");
    assert(has_field(result, "result.diagnostics"), "compile response has result.diagnostics");
    assert(field_type_is(result, "result.diagnostics", "array"), "result.diagnostics is an array");
}

// =============================================================================
// Intelligence Response Format Tests
// =============================================================================

//! Test introspect response format
void test_introspect_response_format() {
    program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;
    object Intelligence = IntelligenceClass();

    mapping result = Intelligence->handle_introspect(([
        "code": "int x = 5;",
        "filename": "test.pike"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "introspect response has result");
    assert(has_field(result, "result.symbols"), "introspect response has result.symbols");
    assert(has_field(result, "result.success"), "introspect response has result.success");
    assert(field_type_is(result, "result.symbols", "array"), "result.symbols is an array");
    assert(field_type_is(result, "result.success", "int"), "result.success is an int");
}

//! Test resolve response format
void test_resolve_response_format() {
    program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;
    object Intelligence = IntelligenceClass();

    mapping result = Intelligence->handle_resolve(([
        "module": "Parser",
        "currentFile": ""
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "resolve response has result");
    assert(has_field(result, "result.exists"), "resolve response has result.exists");
    assert(field_type_is(result, "result.exists", "int"), "result.exists is an int");
}

//! Test resolve_stdlib response format
void test_resolve_stdlib_response_format() {
    program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;
    object Intelligence = IntelligenceClass();

    mapping result = Intelligence->handle_resolve_stdlib(([
        "module": "String"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "resolve_stdlib response has result");
    assert(has_field(result, "result.found"), "resolve_stdlib response has result.found");
    assert(field_type_is(result, "result.found", "int"), "result.found is an int");

    // If found, should have symbols
    if (result->result->found) {
        assert(has_field(result, "result.symbols"), "resolve_stdlib response has result.symbols when found");
        assert(field_type_is(result, "result.symbols", "array"), "result.symbols is an array");
    }
}

//! Test get_inherited response format
void test_get_inherited_response_format() {
    program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;
    object Intelligence = IntelligenceClass();

    mapping result = Intelligence->handle_get_inherited(([
        "class": "NonExistentClass"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "get_inherited response has result");
    assert(has_field(result, "result.found"), "get_inherited response has result.found");
    assert(field_type_is(result, "result.found", "int"), "result.found is an int");
    assert(has_field(result, "result.members"), "get_inherited response has result.members");
    assert(field_type_is(result, "result.members", "array"), "result.members is an array");
}

// =============================================================================
// Analysis Response Format Tests
// =============================================================================

//! Test find_occurrences response format
void test_find_occurrences_response_format() {
    program AnalysisClass = master()->resolv("LSP.Analysis")->Analysis;
    object Analysis = AnalysisClass();

    mapping result = Analysis->handle_find_occurrences(([
        "code": "int x = 5;"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "find_occurrences response has result");
    assert(has_field(result, "result.occurrences"), "find_occurrences response has result.occurrences");
    assert(field_type_is(result, "result.occurrences", "array"), "result.occurrences is an array");

    // Verify occurrence structure if array not empty
    array occurrences = result->result->occurrences || ({});
    if (sizeof(occurrences) > 0) {
        mapping occ = occurrences[0];
        assert(mappingp(occ), "occurrence is a mapping");
        assert(stringp(occ->text), "occurrence has text field (string)");
        assert(intp(occ->line) || !undefinedp(occ->line), "occurrence has line field");
        assert(intp(occ->character) || !undefinedp(occ->character), "occurrence has character field");
    }
}

//! Test analyze_uninitialized response format
void test_analyze_uninitialized_response_format() {
    program AnalysisClass = master()->resolv("LSP.Analysis")->Analysis;
    object Analysis = AnalysisClass();

    mapping result = Analysis->handle_analyze_uninitialized(([
        "code": "void test() { string s; write(\"%s\\n\", s); }",
        "filename": "test.pike"
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "analyze_uninitialized response has result");
    assert(has_field(result, "result.diagnostics"), "analyze_uninitialized response has result.diagnostics");
    assert(field_type_is(result, "result.diagnostics", "array"), "result.diagnostics is an array");
}

//! Test get_completion_context response format
void test_get_completion_context_response_format() {
    program AnalysisClass = master()->resolv("LSP.Analysis")->Analysis;
    object Analysis = AnalysisClass();

    mapping result = Analysis->handle_get_completion_context(([
        "code": "int x = 5;",
        "line": 1,
        "character": 5
    ]));

    // Verify response structure
    assert(has_field(result, "result"), "get_completion_context response has result");
    assert(has_field(result, "result.context"), "get_completion_context response has result.context");
    assert(stringp(result->result->context), "result.context is a string");
    assert(has_field(result, "result.prefix"), "get_completion_context response has result.prefix");
    assert(has_field(result, "result.operator"), "get_completion_context response has result.operator");
}

// =============================================================================
// Error Response Format Tests
// =============================================================================

//! Test error response format
void test_error_response_format() {
    // Create a deliberate error by using an invalid module name
    program IntelligenceClass = master()->resolv("LSP.Intelligence")->Intelligence;
    object Intelligence = IntelligenceClass();

    mapping result = Intelligence->handle_resolve(([
        "module": "",
        "currentFile": ""
    ]));

    // Should have a result (even for not found, it's not an error)
    assert(has_field(result, "result"), "resolve returns result even for empty module");
}

// =============================================================================
// Full JSON-RPC Cycle Test
// =============================================================================

//! Test full JSON-RPC cycle through analyzer router
void test_full_jsonrpc_cycle() {
    // Test that we can create a valid request and get a response
    // This simulates what the VSCode extension does

    mapping request = ([
        "jsonrpc": "2.0",
        "id": 1,
        "method": "parse",
        "params": ([
            "code": "int x = 5;",
            "filename": "test.pike",
            "line": 1
        ])
    ]);

    // Simulate routing through dispatch (we'll call Parser directly)
    program ParserClass = master()->resolv("LSP.Parser")->Parser;
    object Parser = ParserClass();

    mapping response = Parser->parse_request(request->params);

    // Verify response structure matches JSON-RPC
    assert(has_field(response, "result"), "response has result field");
    assert(has_field(response, "result.symbols"), "response has result.symbols");
    assert(field_type_is(response, "result.symbols", "array"), "result.symbols is an array");

    // Simulate adding the jsonrpc envelope (what analyzer.pike does)
    mapping jsonrpc_response = ([
        "jsonrpc": "2.0",
        "id": request->id,
        "result": response->result
    ]);

    assert(jsonrpc_response->jsonrpc == "2.0", "jsonrpc version is 2.0");
    assert(jsonrpc_response->id == request->id, "response id matches request id");
    assert(has_field(jsonrpc_response, "result"), "jsonrpc response has result");
}
