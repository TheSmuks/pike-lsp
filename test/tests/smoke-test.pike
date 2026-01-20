#!/usr/bin/env pike
//! LSP Smoke Test
//!
//! End-to-end verification that the refactored LSP codebase works correctly.
//! This test validates:
//! 1. Standalone file compilation for each .pike/.pmod file
//! 2. Module loading via master()->resolv()
//! 3. LSP server startup verification
//! 4. JSON-RPC handler responses (all 11 handlers)
//!
//! Purpose: Catch regressions that unit tests miss - particularly around
//! module loading, JSON-RPC handler execution, and actual LSP feature behavior.
//!
//! Run with: pike test/tests/smoke-test.pike

int test_count = 0;
int pass_count = 0;
int fail_count = 0;
array(string) failure_messages = ({});
string pike_scripts_path = "";

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
    pike_scripts_path = combine_path(base_path, "pike-scripts");
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

//! Main test runner
//!
//! Registers and executes all test functions
int main(int argc, array(string) argv) {
    // Setup module path before any LSP imports
    setup_module_path();

    write("============================================\n");
    write("      LSP End-to-End Smoke Test            \n");
    write("============================================\n\n");

    // Log current Pike version
    log_pike_version();

    write("\n");

    // Part 1: Standalone file compilation tests (SC-01)
    write("--- Part 1: Standalone File Compilation ---\n");
    run_test(test_analyzer_compilation, "analyzer.pike compiles standalone");
    run_test(test_module_compilation, "LSP.pmod/module.pmod compiles standalone");
    run_test(test_compat_compilation, "LSP.pmod/Compat.pmod compiles standalone");
    run_test(test_cache_compilation, "LSP.pmod/Cache.pmod compiles standalone");
    run_test(test_parser_compilation, "LSP.pmod/Parser.pike compiles standalone");
    run_test(test_intelligence_compilation, "LSP.pmod/Intelligence.pike compiles standalone");
    run_test(test_analysis_compilation, "LSP.pmod/Analysis.pike compiles standalone");

    write("\n");

    // Part 2: Module loading via resolver (SC-02)
    write("--- Part 2: Module Loading via Resolver ---\n");
    run_test(test_lsp_module_loads, "LSP.module loads via resolver");
    run_test(test_compat_module_loads, "LSP.Compat loads via resolver");
    run_test(test_cache_module_loads, "LSP.Cache loads via resolver");
    run_test(test_parser_module_loads, "LSP.Parser loads via resolver");
    run_test(test_intelligence_module_loads, "LSP.Intelligence loads via resolver");
    run_test(test_analysis_module_loads, "LSP.Analysis loads via resolver");

    write("\n");

    // Part 3: LSP server startup verification (SC-03)
    run_test(test_lsp_server_startup, "LSP server Context class instantiates");

    write("\n");

    // Part 4: JSON-RPC handler smoke tests (SC-09)
    write("--- Part 4: JSON-RPC Handler Tests ---\n");
    run_test(test_parse_request_handler, "parse_request handler returns valid JSON-RPC");
    run_test(test_tokenize_request_handler, "tokenize_request handler returns valid JSON-RPC");
    run_test(test_compile_request_handler, "compile_request handler returns valid JSON-RPC");
    run_test(test_batch_parse_request_handler, "batch_parse_request handler returns valid JSON-RPC");
    run_test(test_handle_introspect_handler, "handle_introspect handler returns valid JSON-RPC");
    run_test(test_handle_resolve_handler, "handle_resolve handler returns valid JSON-RPC");
    run_test(test_handle_resolve_stdlib_handler, "handle_resolve_stdlib handler returns valid JSON-RPC");
    run_test(test_handle_get_inherited_handler, "handle_get_inherited handler returns valid JSON-RPC");
    run_test(test_handle_find_occurrences_handler, "handle_find_occurrences handler returns valid JSON-RPC");
    run_test(test_handle_analyze_uninitialized_handler, "handle_analyze_uninitialized handler returns valid JSON-RPC");
    run_test(test_handle_get_completion_context_handler, "handle_get_completion_context handler returns valid JSON-RPC");

    write("\n");
    write("============================================\n");
    write("Tests: %d, Passed: %d, Failed: %d\n", test_count, pass_count, fail_count);
    write("============================================\n");

    if (fail_count > 0) {
        write("\nFailed tests:\n");
        foreach (failure_messages, string name) {
            write("  - %s\n", name);
        }
        return 1;
    }

    write("\n\033[32mAll smoke tests passed!\033[0m\n");
    return 0;
}

// =============================================================================
// Setup
// =============================================================================

//! Log Pike version for CI debugging
void log_pike_version() {
    mixed compat = master()->resolv("LSP.Compat");
    if (compat) {
        array version = compat->pike_version();
        string version_str = compat->PIKE_VERSION_STRING;
        write("Pike version: %s (%d.%d.%d)\n",
              version_str, version[0], version[1], version[2]);
    } else {
        write("Pike version: unknown (LSP.Compat not loaded)\n");
    }
}

// =============================================================================
// Part 1: Standalone File Compilation Tests (SC-01)
// =============================================================================

//! Test: analyzer.pike compiles standalone
void test_analyzer_compilation() {
    string file_path = combine_path(pike_scripts_path, "analyzer.pike");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("analyzer.pike should compile to a program");
}

//! Test: LSP.pmod/module.pmod compiles standalone
void test_module_compilation() {
    string file_path = combine_path(pike_scripts_path, "LSP.pmod", "module.pmod");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("module.pmod should compile to a program");
}

//! Test: LSP.pmod/Compat.pmod compiles standalone
void test_compat_compilation() {
    string file_path = combine_path(pike_scripts_path, "LSP.pmod", "Compat.pmod");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("Compat.pmod should compile to a program");
}

//! Test: LSP.pmod/Cache.pmod compiles standalone
void test_cache_compilation() {
    string file_path = combine_path(pike_scripts_path, "LSP.pmod", "Cache.pmod");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("Cache.pmod should compile to a program");
}

//! Test: LSP.pmod/Parser.pike compiles standalone
void test_parser_compilation() {
    string file_path = combine_path(pike_scripts_path, "LSP.pmod", "Parser.pike");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("Parser.pike should compile to a program");
}

//! Test: LSP.pmod/Intelligence.pike compiles standalone
void test_intelligence_compilation() {
    string file_path = combine_path(pike_scripts_path, "LSP.pmod", "Intelligence.pike");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("Intelligence.pike should compile to a program");
}

//! Test: LSP.pmod/Analysis.pike compiles standalone
void test_analysis_compilation() {
    string file_path = combine_path(pike_scripts_path, "LSP.pmod", "Analysis.pike");
    program prog = compile_file(file_path);
    if (!programp(prog))
        error("Analysis.pike should compile to a program");
}

// =============================================================================
// Part 2: Module Loading via Resolver (SC-02)
// =============================================================================

//! Test: LSP.module loads via resolver
void test_lsp_module_loads() {
    mixed module = master()->resolv("LSP.module");
    if (!module)
        error("LSP.module should load via resolver");
}

//! Test: LSP.Compat loads via resolver
void test_compat_module_loads() {
    mixed module = master()->resolv("LSP.Compat");
    if (!module)
        error("LSP.Compat should load via resolver");
}

//! Test: LSP.Cache loads via resolver
void test_cache_module_loads() {
    mixed module = master()->resolv("LSP.Cache");
    if (!module)
        error("LSP.Cache should load via resolver");
}

//! Test: LSP.Parser loads via resolver
void test_parser_module_loads() {
    mixed module = master()->resolv("LSP.Parser");
    if (!module)
        error("LSP.Parser should load via resolver");
}

//! Test: LSP.Intelligence loads via resolver
void test_intelligence_module_loads() {
    mixed module = master()->resolv("LSP.Intelligence");
    if (!module)
        error("LSP.Intelligence should load via resolver");
}

//! Test: LSP.Analysis loads via resolver
void test_analysis_module_loads() {
    mixed module = master()->resolv("LSP.Analysis");
    if (!module)
        error("LSP.Analysis should load via resolver");
}

// =============================================================================
// Part 3: LSP Server Startup Verification (SC-03)
// =============================================================================

//! Test: LSP server Context class instantiates successfully
//! This validates that all modules can be loaded and instantiated together
void test_lsp_server_startup() {
    // Load handler programs (Parser.pike, Intelligence.pike, Analysis.pike are programs)
    program ParserProgram = master()->resolv("LSP.Parser");
    if (!ParserProgram)
        error("LSP.Parser program should load");

    program IntelligenceProgram = master()->resolv("LSP.Intelligence");
    if (!IntelligenceProgram)
        error("LSP.Intelligence program should load");

    program AnalysisProgram = master()->resolv("LSP.Analysis");
    if (!AnalysisProgram)
        error("LSP.Analysis program should load");

    // Instantiate each handler class (simulating Context initialization)
    object parser = ParserProgram();
    if (!objectp(parser))
        error("Parser should instantiate");

    object intelligence = IntelligenceProgram();
    if (!objectp(intelligence))
        error("Intelligence should instantiate");

    object analysis = AnalysisProgram();
    if (!objectp(analysis))
        error("Analysis should instantiate");

    // Verify each handler has its expected methods
    if (!functionp(parser->parse_request))
        error("Parser should have parse_request method");
    if (!functionp(parser->tokenize_request))
        error("Parser should have tokenize_request method");
    if (!functionp(parser->compile_request))
        error("Parser should have compile_request method");
    if (!functionp(parser->batch_parse_request))
        error("Parser should have batch_parse_request method");

    if (!functionp(intelligence->handle_introspect))
        error("Intelligence should have handle_introspect method");
    if (!functionp(intelligence->handle_resolve))
        error("Intelligence should have handle_resolve method");
    if (!functionp(intelligence->handle_resolve_stdlib))
        error("Intelligence should have handle_resolve_stdlib method");
    if (!functionp(intelligence->handle_get_inherited))
        error("Intelligence should have handle_get_inherited method");

    if (!functionp(analysis->handle_find_occurrences))
        error("Analysis should have handle_find_occurrences method");
    if (!functionp(analysis->handle_analyze_uninitialized))
        error("Analysis should have handle_analyze_uninitialized method");
    if (!functionp(analysis->handle_get_completion_context))
        error("Analysis should have handle_get_completion_context method");
}

// =============================================================================
// Part 4: JSON-RPC Handler Tests (SC-09)
// =============================================================================

//! Test parse_request handler returns valid JSON-RPC response
void test_parse_request_handler() {
    program ParserProgram = master()->resolv("LSP.Parser");
    object Parser = ParserProgram();

    mapping result = Parser->parse_request(([
        "code": "int x = 5;",
        "filename": "test.pike",
        "line": 1
    ]));

    if (!has_field(result, "result"))
        error("parse response has result");
    if (!has_field(result, "result.symbols"))
        error("parse response has result.symbols");
}

//! Test tokenize_request handler returns valid JSON-RPC response
void test_tokenize_request_handler() {
    program ParserProgram = master()->resolv("LSP.Parser");
    object Parser = ParserProgram();

    mapping result = Parser->tokenize_request(([
        "code": "int x = 5;"
    ]));

    if (!has_field(result, "result"))
        error("tokenize response has result");
    if (!has_field(result, "result.tokens"))
        error("tokenize response has result.tokens");
}

//! Test compile_request handler returns valid JSON-RPC response
void test_compile_request_handler() {
    program ParserProgram = master()->resolv("LSP.Parser");
    object Parser = ParserProgram();

    mapping result = Parser->compile_request(([
        "code": "int x = 5;",
        "filename": "test.pike"
    ]));

    if (!has_field(result, "result"))
        error("compile response has result");
    if (!has_field(result, "result.diagnostics"))
        error("compile response has result.diagnostics");
}

//! Test batch_parse_request handler returns valid JSON-RPC response
void test_batch_parse_request_handler() {
    program ParserProgram = master()->resolv("LSP.Parser");
    object Parser = ParserProgram();

    mapping result = Parser->batch_parse_request(([
        "files": ({
            (["code": "int x = 5;", "filename": "file1.pike"]),
            (["code": "string s = \"hello\";", "filename": "file2.pike"])
        })
    ]));

    if (!has_field(result, "result"))
        error("batch_parse response has result");
    if (!has_field(result, "result.results"))
        error("batch_parse response has result.results");
}

//! Test handle_introspect handler returns valid JSON-RPC response
void test_handle_introspect_handler() {
    program IntelligenceProgram = master()->resolv("LSP.Intelligence");
    object Intelligence = IntelligenceProgram();

    mapping result = Intelligence->handle_introspect(([
        "code": "int x = 5;",
        "filename": "test.pike"
    ]));

    if (!has_field(result, "result"))
        error("introspect response has result");
    if (!has_field(result, "result.symbols"))
        error("introspect response has result.symbols");
}

//! Test handle_resolve handler returns valid JSON-RPC response
void test_handle_resolve_handler() {
    program IntelligenceProgram = master()->resolv("LSP.Intelligence");
    object Intelligence = IntelligenceProgram();

    mapping result = Intelligence->handle_resolve(([
        "module": "Parser",
        "currentFile": ""
    ]));

    if (!has_field(result, "result"))
        error("resolve response has result");
}

//! Test handle_resolve_stdlib handler returns valid JSON-RPC response
void test_handle_resolve_stdlib_handler() {
    program IntelligenceProgram = master()->resolv("LSP.Intelligence");
    object Intelligence = IntelligenceProgram();

    mapping result = Intelligence->handle_resolve_stdlib(([
        "module": "String"
    ]));

    if (!has_field(result, "result"))
        error("resolve_stdlib response has result");
}

//! Test handle_get_inherited handler returns valid JSON-RPC response
void test_handle_get_inherited_handler() {
    program IntelligenceProgram = master()->resolv("LSP.Intelligence");
    object Intelligence = IntelligenceProgram();

    mapping result = Intelligence->handle_get_inherited(([
        "class": "NonExistentClass"
    ]));

    if (!has_field(result, "result"))
        error("get_inherited response has result");
    if (!has_field(result, "result.members"))
        error("get_inherited response has result.members");
}

//! Test handle_find_occurrences handler returns valid JSON-RPC response
void test_handle_find_occurrences_handler() {
    program AnalysisProgram = master()->resolv("LSP.Analysis");
    object Analysis = AnalysisProgram();

    mapping result = Analysis->handle_find_occurrences(([
        "code": "int x = 5;"
    ]));

    if (!has_field(result, "result"))
        error("find_occurrences response has result");
    if (!has_field(result, "result.occurrences"))
        error("find_occurrences response has result.occurrences");
}

//! Test handle_analyze_uninitialized handler returns valid JSON-RPC response
void test_handle_analyze_uninitialized_handler() {
    program AnalysisProgram = master()->resolv("LSP.Analysis");
    object Analysis = AnalysisProgram();

    mapping result = Analysis->handle_analyze_uninitialized(([
        "code": "void test() { string s; write(\"%s\\n\", s); }",
        "filename": "test.pike"
    ]));

    if (!has_field(result, "result"))
        error("analyze_uninitialized response has result");
    if (!has_field(result, "result.diagnostics"))
        error("analyze_uninitialized response has result.diagnostics");
}

//! Test handle_get_completion_context handler returns valid JSON-RPC response
void test_handle_get_completion_context_handler() {
    program AnalysisProgram = master()->resolv("LSP.Analysis");
    object Analysis = AnalysisProgram();

    mapping result = Analysis->handle_get_completion_context(([
        "code": "int x = 5;",
        "line": 1,
        "character": 5
    ]));

    if (!has_field(result, "result"))
        error("get_completion_context response has result");
    if (!has_field(result, "result.context"))
        error("get_completion_context response has result.context");
}
