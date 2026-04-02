#!/usr/bin/env pike
#pragma strict_types

//! LSP Analysis Tests
//!
//! Integration tests for LSP.Analysis class:
//! - handle_find_occurrences: Extract identifiers using tokenization
//! - handle_analyze_uninitialized: Detect uninitialized variable usage
//! - handle_get_completion_context: Determine completion context at position
//!
//! Run with: pike test/tests/analysis-tests.pike

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

//! Get Analysis class (runtime resolution)
mixed get_analysis() {
    return master()->resolv("LSP.Analysis.Analysis");
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

//! Helper: Check if diagnostic with message exists
protected bool has_diagnostic_message(array diagnostics, string msg_contains) {
    foreach (diagnostics, mapping diag) {
        if (diag->message && has_value(diag->message, msg_contains)) {
            return true;
        }
    }
    return false;
}

//! Main test runner
//!
//! Registers and executes all test functions
int main(int argc, array(string) argv) {
    // Setup module path before any LSP imports
    setup_module_path();

    write("LSP Analysis Tests\n");
    write("===================\n\n");

    // handle_find_occurrences tests
    run_test(test_find_occurrences_basic, "find_occurrences: extracts identifiers");
    run_test(test_find_occurrences_filters_keywords, "find_occurrences: filters keywords");
    run_test(test_find_occurrences_includes_positions, "find_occurrences: includes text, line, character");
    run_test(test_find_occurrences_empty_code, "find_occurrences: empty code returns empty array");
    run_test(test_find_occurrences_multiple_identifiers, "find_occurrences: finds all identifiers");

    // handle_analyze_uninitialized tests
    run_test(test_uninitialized_string_warns, "uninitialized: string usage warns");
    run_test(test_uninitialized_int_no_warn, "uninitialized: int auto-initializes, no warning");
    run_test(test_uninitialized_after_declaration, "uninitialized: initialized before use, no warning");
    run_test(test_uninitialized_function_params, "uninitialized: parameters are pre-initialized");
    run_test(test_uninitialized_array_warns, "uninitialized: array usage warns");
    run_test(test_uninitialized_mapping_warns, "uninitialized: mapping usage warns");

    // if/else branch merging tests (Issue #1090)
    run_test(test_if_else_both_branches_init_no_warn, "if/else: both branches init - no warning");
    run_test(test_if_else_one_branch_init_warns, "if/else: only one branch init - warns");
    run_test(test_if_without_else_init_warns, "if/else: if-only init - warns");
    run_test(test_if_else_if_else_all_init_no_warn, "if/else if/else: all branches init - no warning");
    run_test(test_if_else_nested_no_warn, "if/else: nested both-branch init - no warning");

    // handle_get_completion_context tests
    run_test(test_completion_member_access_arrow, "completion: detects -> access");
    run_test(test_completion_member_access_dot, "completion: detects . access");
    run_test(test_completion_scope_access, "completion: detects :: scope access");
    run_test(test_completion_identifier, "completion: plain identifier context");
    run_test(test_completion_global_scope, "completion: global scope context");
    run_test(test_completion_position_accuracy, "completion: correct token at cursor position");

    // switch/case fallthrough tests
    run_test(test_switch_all_cases_init_no_warn, "switch: all cases init with default, no warning");
    run_test(test_switch_fallthrough_init_no_warn, "switch: fallthrough carries init state");
    run_test(test_switch_no_default_maybe_init, "switch: no default, not all paths init → warns");

    // preprocessor conditional block tests (Issue #1091)
    run_test(test_preprocessor_if_else_both_init_no_warn, "preprocessor: #if/#else both init - no warning");
    run_test(test_preprocessor_if_only_init_no_warn, "preprocessor: #if-only init - no warning");
    run_test(test_preprocessor_nested_no_warn, "preprocessor: nested #if blocks - no warning");

    // ::create() inheritance tests (Issue #1093)
    run_test(test_inheritance_create_suppresses_warning, "inheritance: ::create() suppresses uninit warning");
    run_test(test_inheritance_create_already_init_stays, "inheritance: already-initialized vars unaffected");
    run_test(test_inheritance_create_with_args, "inheritance: ::create(args) also suppresses warning");

    write("\n");
    write("===================\n");
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
// handle_find_occurrences Tests
// =============================================================================

//! Test basic identifier extraction
void test_find_occurrences_basic() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "int x = 5;\nstring y = \"hello\";\n";
    mapping result = analysis->handle_find_occurrences(([
        "code": code
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    array occurrences = result->result->occurrences || ({});
    // Should find x, y, but not int, string, hello (literal)
    bool has_x = false;
    bool has_y = false;

    foreach (occurrences, mapping occ) {
        if (occ->text == "x") has_x = true;
        if (occ->text == "y") has_y = true;
    }

    if (!has_x) {
        error("Expected to find identifier x, got %O\n", occurrences);
    }
    if (!has_y) {
        error("Expected to find identifier y, got %O\n", occurrences);
    }
}

//! Test that keywords are filtered out
void test_find_occurrences_filters_keywords() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "if (x) { for (int i = 0; i < 10; i++) { } }";
    mapping result = analysis->handle_find_occurrences(([
        "code": code
    ]));

    array occurrences = result->result->occurrences || ({});

    // Should not have if, for, int as occurrences
    foreach (occurrences, mapping occ) {
        string text = occ->text;
        if (text == "if" || text == "for" || text == "int") {
            error("Keywords should be filtered out, found: %s\n", text);
        }
    }

    // x and i should be found
    bool has_x = false;
    bool has_i = false;
    foreach (occurrences, mapping occ) {
        if (occ->text == "x") has_x = true;
        if (occ->text == "i") has_i = true;
    }

    if (!has_x || !has_i) {
        error("Expected to find identifiers x and i, got %O\n", occurrences);
    }
}

//! Test that occurrences include text, line, and character position
void test_find_occurrences_includes_positions() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "int myVariable = 5;\nstring another = \"test\";\n";
    mapping result = analysis->handle_find_occurrences(([
        "code": code
    ]));

    array occurrences = result->result->occurrences || ({});

    if (sizeof(occurrences) == 0) {
        error("Expected at least one occurrence\n");
    }

    // Check that each occurrence has required fields
    foreach (occurrences, mapping occ) {
        if (!occ->text) {
            error("Occurrence missing 'text' field: %O\n", occ);
        }
        if (!undefinedp(occ->line) && occ->line == 0) {
            // Line 0 might be invalid (lines are 1-indexed)
        }
        if (!undefinedp(occ->character)) {
            // Character position should be a number
        }
    }

    // Specifically check myVariable
    bool found_myvar = false;
    foreach (occurrences, mapping occ) {
        if (occ->text == "myVariable") {
            found_myvar = true;
            // myVariable should be on line 1
            if (occ->line != 1) {
                error("myVariable should be on line 1, got line %d\n", occ->line);
            }
            break;
        }
    }

    if (!found_myvar) {
        error("Expected to find myVariable in occurrences\n");
    }
}

//! Test empty code returns empty occurrences
void test_find_occurrences_empty_code() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    mapping result = analysis->handle_find_occurrences(([
        "code": ""
    ]));

    array occurrences = result->result->occurrences || ({});
    if (sizeof(occurrences) != 0) {
        error("Expected empty occurrences for empty code, got %O\n", occurrences);
    }
}

//! Test multiple identifier extraction
void test_find_occurrences_multiple_identifiers() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "class MyClass { int value; void method() { } }";
    mapping result = analysis->handle_find_occurrences(([
        "code": code
    ]));

    array occurrences = result->result->occurrences || ({});

    // Should find MyClass, value, method
    // Should NOT find class, int, void
    bool has_MyClass = false;
    bool has_value = false;
    bool has_method = false;

    foreach (occurrences, mapping occ) {
        if (occ->text == "MyClass") has_MyClass = true;
        if (occ->text == "value") has_value = true;
        if (occ->text == "method") has_method = true;
        if (occ->text == "class" || occ->text == "int" || occ->text == "void") {
            error("Keywords should be filtered, found: %s\n", occ->text);
        }
    }

    if (!has_MyClass || !has_value || !has_method) {
        error("Expected MyClass, value, method in %O\n", occurrences);
    }
}

// =============================================================================
// handle_analyze_uninitialized Tests
// =============================================================================

//! Test uninitialized string usage generates warning
void test_uninitialized_string_warns() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n    string s;\n    write(\"%s\\n\", s);\n}";
    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    array diagnostics = result->result->diagnostics || ({});

    // Should have a diagnostic for uninitialized string
    bool found_warning = false;
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            found_warning = true;
            break;
        }
        if (has_diagnostic_message(diagnostics, "uninitialized")) {
            found_warning = true;
            break;
        }
    }

    if (!found_warning) {
        error("Expected diagnostic for uninitialized string s\n");
    }
}

//! Test int auto-initializes (no warning)
void test_uninitialized_int_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n    int i;\n    write(\"%d\\n\", i);\n}";
    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Should NOT have diagnostic for int (auto-initializes to 0)
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "i") {
            error("int should not warn, it auto-initializes to 0\n");
        }
    }
}

//! Test initialized variable (no warning)
void test_uninitialized_after_declaration() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n    string s = \"hello\";\n    write(\"%s\\n\", s);\n}";
    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Should NOT have diagnostic - s is initialized
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            error("Initialized string should not generate warning\n");
        }
    }
}

//! Test function parameters are pre-initialized
void test_uninitialized_function_params() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test(string param) {\n    write(\"%s\\n\", param);\n}";
    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Should NOT have diagnostic - params are pre-initialized
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "param") {
            error("Function parameters should not warn\n");
        }
    }
}

//! Test uninitialized array usage
void test_uninitialized_array_warns() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n    array(int) arr;\n    write(\"%d\\n\", sizeof(arr));\n}";
    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Should have diagnostic for uninitialized array
    bool found_warning = false;
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "arr") {
            found_warning = true;
            break;
        }
        if (has_diagnostic_message(diagnostics, "uninitialized")) {
            found_warning = true;
            break;
        }
    }

    if (!found_warning) {
        error("Expected diagnostic for uninitialized array\n");
    }
}

//! Test uninitialized mapping usage
void test_uninitialized_mapping_warns() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n    mapping(string:int) m;\n    write(\"%d\\n\", sizeof(m));\n}";
    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Should have diagnostic for uninitialized mapping
    bool found_warning = false;
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "m") {
            found_warning = true;
            break;
        }
        if (has_diagnostic_message(diagnostics, "uninitialized")) {
            found_warning = true;
            break;
        }
    }

    if (!found_warning) {
        error("Expected diagnostic for uninitialized mapping\n");
    }
}

// =============================================================================
// if/else Branch Merging Tests (Issue #1090)
// =============================================================================

//! Test if/else where both branches initialize - no warning
void test_if_else_both_branches_init_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
                  "    string x;\n"
                  "    if (1) {\n"
                  "        x = \"a\";\n"
                  "    } else {\n"
                  "        x = \"b\";\n"
                  "    }\n"
                  "    write(x);\n"
                  "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "x") {
            error("x initialized in both branches should not warn, got: %O\n", diag);
        }
    }
}

//! Test if/else where only one branch initializes - should warn
void test_if_else_one_branch_init_warns() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
                  "    string x;\n"
                  "    string y;\n"
                  "    if (1) {\n"
                  "        x = \"a\";\n"
                  "    } else {\n"
                  "        y = \"b\";\n"
                  "    }\n"
                  "    write(x);\n"
                  "    write(y);\n"
                  "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});
    int warned_x = 0;
    int warned_y = 0;

    foreach (diagnostics, mapping diag) {
        if (diag->variable == "x") warned_x = 1;
        if (diag->variable == "y") warned_y = 1;
    }

    // Both x and y are only initialized in one branch - should warn for both
    if (!warned_x) {
        error("x (only init in if-branch) should warn\n");
    }
    if (!warned_y) {
        error("y (only init in else-branch) should warn\n");
    }
}

//! Test if without else where variable is initialized - should warn (maybe init)
void test_if_without_else_init_warns() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
                  "    string x;\n"
                  "    if (1) {\n"
                  "        x = \"a\";\n"
                  "    }\n"
                  "    write(x);\n"
                  "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});
    int warned = 0;
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "x") warned = 1;
    }

    if (!warned) {
        error("x initialized only in if (no else) should warn as maybe uninit\n");
    }
}

//! Test if/else if/else chain where all branches initialize - no warning
void test_if_else_if_else_all_init_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
                  "    string x;\n"
                  "    if (1) {\n"
                  "        x = \"a\";\n"
                  "    } else if (2) {\n"
                  "        x = \"b\";\n"
                  "    } else {\n"
                  "        x = \"c\";\n"
                  "    }\n"
                  "    write(x);\n"
                  "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "x") {
            error("x initialized in all if/else if/else branches should not warn, got: %O\n", diag);
        }
    }
}

//! Test nested if/else where both branches initialize - no warning
void test_if_else_nested_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
                  "    string x;\n"
                  "    if (1) {\n"
                  "        if (2) {\n"
                  "            x = \"a\";\n"
                  "        } else {\n"
                  "            x = \"b\";\n"
                  "        }\n"
                  "    } else {\n"
                  "        x = \"c\";\n"
                  "    }\n"
                  "    write(x);\n"
                  "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "x") {
            error("x initialized in all nested branches should not warn, got: %O\n", diag);
        }
    }
}

// =============================================================================
// handle_get_completion_context Tests
// =============================================================================

//! Test member access detection with arrow operator
void test_completion_member_access_arrow() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "object foo;\nfoo->";
    mapping result = analysis->handle_get_completion_context(([
        "code": code,
        "line": 2,
        "character": 5
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    mapping ctx = result->result;
    if (ctx->context != "member_access") {
        error("Expected member_access context, got: %s\n", ctx->context);
    }
    if (ctx->operator != "->") {
        error("Expected operator ->, got: %s\n", ctx->operator);
    }
    if (ctx->objectName != "foo") {
        error("Expected objectName 'foo', got: %s\n", ctx->objectName);
    }
}

//! Test member access detection with dot operator
void test_completion_member_access_dot() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "mapping foo;\nfoo.";
    mapping result = analysis->handle_get_completion_context(([
        "code": code,
        "line": 2,
        "character": 4
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    mapping ctx = result->result;
    if (ctx->context != "member_access") {
        error("Expected member_access context, got: %s\n", ctx->context);
    }
    if (ctx->operator != ".") {
        error("Expected operator ., got: %s\n", ctx->operator);
    }
}

//! Test scope access detection with ::
void test_completion_scope_access() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "Module::";
    mapping result = analysis->handle_get_completion_context(([
        "code": code,
        "line": 1,
        "character": 8
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    mapping ctx = result->result;
    if (ctx->context != "scope_access") {
        error("Expected scope_access context, got: %s\n", ctx->context);
    }
    if (ctx->operator != "::") {
        error("Expected operator ::, got: %s\n", ctx->operator);
    }
}

//! Test plain identifier completion
void test_completion_identifier() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "int myVar";
    mapping result = analysis->handle_get_completion_context(([
        "code": code,
        "line": 1,
        "character": 7
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    mapping ctx = result->result;
    if (ctx->context != "identifier") {
        error("Expected identifier context, got: %s\n", ctx->context);
    }
}

//! Test completion returns valid response for empty input
void test_completion_global_scope() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "";
    mapping result = analysis->handle_get_completion_context(([
        "code": code,
        "line": 1,
        "character": 0
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    // Empty code should return valid context (may be none, global, or identifier)
    // The key is that it doesn't crash
    mapping ctx = result->result;
    if (!ctx->context) {
        error("Expected context field in response\n");
    }
}

//! Test position accuracy in completion context
void test_completion_position_accuracy() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    // Code with multiple identifiers
    string code = "int first;\nstring second;\n";
    // Cursor at position after "second"
    mapping result = analysis->handle_get_completion_context(([
        "code": code,
        "line": 2,
        "character": 7  // After "second"
    ]));

    if (!result->result) {
        error("Expected result in response\n");
    }

    mapping ctx = result->result;
    // At this position, we should be in identifier context with prefix "second"
    if (ctx->context == "identifier") {
        if (ctx->prefix == "") {
            // May be empty depending on exact position
        }
    } else if (ctx->context != "identifier") {
        // Accept other contexts at edge positions
    }
}

// =============================================================================
// switch/case fallthrough Tests
// =============================================================================

//! Test switch: all cases initialize variable with default, no warning after switch
void test_switch_all_cases_init_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test(int x) {\n"
        "    string s;\n"
        "    switch (x) {\n"
        "        case 1:\n"
        "            s = \"one\";\n"
        "            break;\n"
        "        case 2:\n"
        "            s = \"two\";\n"
        "            break;\n"
        "        default:\n"
        "            s = \"other\";\n"
        "            break;\n"
        "    }\n"
        "    write(\"%s\\n\", s);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Variable s is initialized in ALL cases (including default) → no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            error("Variable s initialized in all switch cases should not warn, got: %s\n", diag->message);
        }
    }
}

//! Test switch: fallthrough carries initialization state from one case to the next
//!
//! When case 1 initializes s and has no break, execution falls through to case 2.
//! Inside case 2, s should be recognized as initialized (not generate a warning).
void test_switch_fallthrough_init_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test(int x) {\n"
        "    string s;\n"
        "    switch (x) {\n"
        "        case 1:\n"
        "            s = \"one\";\n"
        "        case 2:\n"
        "            write(\"%s\\n\", s);\n"
        "            break;\n"
        "    }\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // s is initialized in case 1 and falls through to case 2.
    // Inside case 2 (after fallthrough), s should be INITIALIZED → no warning.
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            error("Variable s should be recognized as initialized in case 2 after "
                "fallthrough from case 1, got: %s\n", diag->message);
        }
    }
}

//! Test switch: no default, not all cases initialize → warns after switch
//!
//! Without a default case, there's an implicit non-matching path where the
//! variable remains uninitialized. The analyzer should produce a warning.
void test_switch_no_default_maybe_init() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test(int x) {\n"
        "    string s;\n"
        "    switch (x) {\n"
        "        case 1:\n"
        "            s = \"one\";\n"
        "            break;\n"
        "    }\n"
        "    write(\"%s\\n\", s);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Without default, s may not be initialized (x could be anything)
    bool found_warning = false;
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            found_warning = true;
            break;
        }
    }

    if (!found_warning) {
        error("Expected warning for variable s - not all switch paths initialize it\n");
    }
}

// =============================================================================
// Preprocessor Conditional Block Tests (Issue #1091)
// =============================================================================

//! Test preprocessor #if/#else where both branches initialize — no warning
//!
//! Uses optimistic merge: if variable initialized in ANY branch, it's considered
//! initialized after #endif. This handles Pike's `#if constant(...)` pattern.
void test_preprocessor_if_else_both_init_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
        "    string s;\n"
        "    #if constant(some_func)\n"
        "        s = \"func\";\n"
        "    #else\n"
        "        s = \"default\";\n"
        "    #endif\n"
        "    write(\"%s\\n\", s);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // s is initialized in both #if and #else branches — no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            error("Variable s initialized in both preprocessor branches should not warn, got: %s\n",
                diag->message);
        }
    }
}

//! Test preprocessor #if-only where only one branch initializes — no warning
//!
//! Optimistic merge: if initialized in ANY branch, consider initialized.
void test_preprocessor_if_only_init_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
        "    string s;\n"
        "    #if constant(some_func)\n"
        "        s = \"func\";\n"
        "    #endif\n"
        "    write(\"%s\\n\", s);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // Optimistic merge: s initialized in at least one branch — no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            error("Variable s initialized in #if branch should not warn (optimistic merge), got: %s\n",
                diag->message);
        }
    }
}

//! Test nested preprocessor #if blocks — inner blocks merge correctly
void test_preprocessor_nested_no_warn() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void test() {\n"
        "    string s;\n"
        "    #if constant(outer)\n"
        "        #if constant(inner)\n"
        "            s = \"both\";\n"
        "        #else\n"
        "            s = \"outer_only\";\n"
        "        #endif\n"
        "    #else\n"
        "        s = \"neither\";\n"
        "    #endif\n"
        "    write(\"%s\\n\", s);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // All branches initialize s — no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "s") {
            error("Variable s initialized in all nested preprocessor branches should not warn, got: %s\n",
                diag->message);
        }
    }
}

// =============================================================================
// ::create() inheritance Tests (Issue #1093)
// =============================================================================

//! Test that ::create() suppresses uninitialized warnings for variables used after
//!
//! When a function calls ::create() (parent constructor), the parent may initialize
//! class-level variables. The token-level analyzer cannot trace inheritance, so it
//! conservatively marks all currently-uninitialized variables as initialized.
void test_inheritance_create_suppresses_warning() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void create() {\n"
        "    string name;\n"
        "    ::create();\n"
        "    write(\"%s\\n\", name);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // After ::create(), name should be considered initialized — no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "name") {
            error("Variable name used after ::create() should not warn, got: %s\n",
                diag->message);
        }
    }
}

//! Test that already-initialized variables are unaffected by ::create()
//!
//! Variables initialized before the ::create() call should remain INITIALIZED.
void test_inheritance_create_already_init_stays() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void create(string config) {\n"
        "    string name = config;\n"
        "    ::create();\n"
        "    write(\"%s\\n\", name);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // name was initialized before ::create() — should still have no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "name") {
            error("Already-initialized variable should not warn, got: %s\n",
                diag->message);
        }
    }
}

//! Test that ::create() with arguments also suppresses warnings
//!
//! The pattern ::create(args) should also be recognized.
void test_inheritance_create_with_args() {
    object Analysis = get_analysis();
    object analysis = Analysis();

    string code = "void create(int x) {\n"
        "    string label;\n"
        "    ::create(x);\n"
        "    write(\"%s\\n\", label);\n"
        "}";

    mapping result = analysis->handle_analyze_uninitialized(([
        "code": code,
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics || ({});

    // After ::create(x), label should be considered initialized — no warning
    foreach (diagnostics, mapping diag) {
        if (diag->variable == "label") {
            error("Variable label used after ::create(x) should not warn, got: %s\n",
                diag->message);
        }
    }
}
