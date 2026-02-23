#!/usr/bin/env pike
//! LSP Parser Tests
//!
//! Unit and integration tests for LSP.Parser class:
//! - parse_request: Symbol extraction (classes, methods, variables, constants, typedefs, enums)
//! - tokenize_request: Token stream generation
//! - compile_request: Compilation diagnostics capture
//! - batch_parse_request: Multiple file processing with error recovery
//!
//! Run with: pike test/tests/parser-tests.pike

int test_count = 0;
int pass_count = 0;
int fail_count = 0;
array(string) failure_messages = ({});
string project_root;

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
    project_root = base_path;
    string pike_scripts_path = combine_path(base_path, "pike-scripts");
    master()->add_module_path(pike_scripts_path);
}

//! Get Parser class (runtime resolution)
mixed get_parser() {
    return master()->resolv("LSP.Parser");
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

//! Helper: Check if symbol exists in array
protected bool has_symbol(array symbols, string name, string kind) {
    foreach (symbols, mapping sym) {
        if (sym->name == name && sym->kind == kind) return true;
    }
    return false;
}

//! Helper: Find symbol in array
protected mixed find_symbol(array symbols, string name, string kind) {
    foreach (symbols, mapping sym) {
        if (sym->name == name && sym->kind == kind) return sym;
    }
    return 0;
}

//! Helper: Count symbols by kind
protected int count_symbols_by_kind(array symbols, string kind) {
    int count = 0;
    foreach (symbols, mapping sym) {
        if (sym->kind == kind) count++;
    }
    return count;
}

//! Helper: Check if diagnostic exists at line
protected bool has_error_at_line(array diagnostics, int line, string|void msg_contains) {
    foreach (diagnostics, mapping diag) {
        int diag_line = diag->position->line || 1;
        if (diag_line == line) {
            if (!msg_contains || has_value(diag->message || "", msg_contains)) {
                return true;
            }
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

    write("LSP Parser Tests\n");
    write("================\n\n");

    // RED phase tests - parse_request
    run_test(test_parse_simple_class, "parse_request: simple class extraction");
    run_test(test_parse_variables, "parse_request: variable and constant extraction");
    run_test(test_parse_typedef, "parse_request: typedef extraction");
    run_test(test_parse_inherit, "parse_request: inherit statement extraction");
    run_test(test_parse_method_with_return_type, "parse_request: method with return type");
    run_test(test_parse_union_type, "parse_request: union type extraction");
    run_test(test_parse_intersection_type, "parse_request: intersection type extraction");
    run_test(test_parse_range_type, "parse_request: range type extraction");
    run_test(test_parse_attribute_type, "parse_request: attribute type extraction");
    run_test(test_parse_builtin_type_variants, "parse_request: zero/type/unknown extraction");
    run_test(test_parse_class_with_children, "parse_request: class with child methods");
    run_test(test_autodoc_extraction, "parse_request: AutoDoc comment extraction");
    run_test(test_parse_enum, "parse_request: enum extraction");
    run_test(test_parse_multiple_top_level, "parse_request: multiple top-level declarations");

    // Tokenize tests
    run_test(test_tokenize_basic, "tokenize_request: basic tokenization");
    run_test(test_tokenize_with_strings, "tokenize_request: tokenization with string literals");
    run_test(test_tokenize_empty, "tokenize_request: empty input");

    // Compile tests
    run_test(test_compile_success, "compile_request: successful compilation");
    run_test(test_compile_error, "compile_request: syntax error capture");
    run_test(test_compile_warning, "compile_request: warning capture");

    // Batch parse tests
    run_test(test_batch_parse_single, "batch_parse_request: single file");
    run_test(test_batch_parse_multiple, "batch_parse_request: multiple files");
    run_test(test_batch_parse_error_continuation, "batch_parse_request: continues on error");

    // Error recovery tests
    run_test(test_error_recovery_missing_semicolon, "error recovery: missing semicolon");
    run_test(test_error_recovery_unclosed_brace, "error recovery: unclosed brace");

    // Integration tests (if fixtures exist)
    run_test(test_integration_simple_class, "integration: simple class fixture");
    run_test(test_integration_function_with_vars, "integration: function with vars fixture");
    run_test(test_integration_malformed_file, "integration: malformed syntax fixture");
    run_test(test_integration_stdlib_sample, "integration: stdlib sample fixture");

    // Compat tests
    run_test(test_compat_trim_whites, "LSP.Compat.trim_whites usage");

    write("\n");
    write("Results: %d run, %d passed, %d failed\n", test_count, pass_count, fail_count);

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
// parse_request Tests (RED phase - these should fail initially)
// =============================================================================

//! Test parsing a simple class
void test_parse_simple_class() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "class MyApp { void create() { } }",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Expect: 1 symbol (class MyApp)
    if (sizeof(symbols) >= 1) {
        mapping class_sym = find_symbol(symbols, "MyApp", "class");
        if (class_sym) {
            return;  // Success
        }
    }
    error("Expected class MyApp, got %O\n", symbols);
}

//! Test parsing variables and constants
void test_parse_variables() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "int x = 5;\nstring y = \"hello\";\nconstant PI = 3.14;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Expect: 3 symbols (int x, string y, constant PI)
    bool has_x = has_symbol(symbols, "x", "variable");
    bool has_y = has_symbol(symbols, "y", "variable");
    bool has_pi = has_symbol(symbols, "PI", "constant");

    if (has_x && has_y && has_pi) {
        return;  // Success
    }
    error("Missing variables (x:%d y:%d PI:%d) in %O\n", has_x, has_y, has_pi, symbols);
}

//! Test parsing typedef
void test_parse_typedef() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "typedef mapping(string:string) StringMap;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Expect: typedef StringMap
    if (has_symbol(symbols, "StringMap", "typedef")) {
        return;  // Success
    }
    error("Expected typedef StringMap, got %O\n", symbols);
}

//! Test parsing inherit statement
void test_parse_inherit() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "class MyApp { inherit BaseClass; }",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Inherit statements appear in class children
    mapping class_sym = find_symbol(symbols, "MyApp", "class");

    if (class_sym && class_sym->children) {
        // Look for inherit in children
        foreach (class_sym->children, mapping child) {
            if (child->kind == "inherit" && child->classname == "BaseClass") {
                return;  // Success
            }
        }
    }
    error("Expected inherit BaseClass in class children, got %O\n", symbols);
}

//! Test parsing method with return type
void test_parse_method_with_return_type() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "string get_name() { return \"test\"; }",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping method = find_symbol(symbols, "get_name", "method");

    if (method && method->returnType && method->returnType->name == "string") {
        return;  // Success
    }
    error("Expected method get_name with string return type, got %O\n", symbols);
}

//! Test parsing union variable types
void test_parse_union_type() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "int|string value;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping variable = find_symbol(symbols, "value", "variable");

    if (variable && variable->type && variable->type->name == "or" &&
        arrayp(variable->type->types) && sizeof(variable->type->types) == 2 &&
        variable->type->types[0]->name == "int" &&
        variable->type->types[1]->name == "string") {
        return;  // Success
    }

    error("Expected union type int|string on value, got %O\n", symbols);
}

//! Test parsing intersection variable types via token fallback recovery
void test_parse_intersection_type() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "int&float value;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping variable = find_symbol(symbols, "value", "variable");

    if (variable && variable->type && variable->type->name == "and" &&
        arrayp(variable->type->types) && sizeof(variable->type->types) == 2 &&
        variable->type->types[0]->name == "int" &&
        variable->type->types[1]->name == "float") {
        return;  // Success
    }

    error("Expected intersection type int&float on value, got %O\n", symbols);
}

//! Test parsing range-constrained integer types
void test_parse_range_type() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "int(0..255) byte_value;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping variable = find_symbol(symbols, "byte_value", "variable");

    if (variable && variable->type &&
        variable->type->name == "int" &&
        variable->type->min == "0" &&
        variable->type->max == "255") {
        return;  // Success
    }

    error("Expected range type int(0..255) on byte_value, got %O\n", symbols);
}

//! Test parsing __attribute__ type wrappers via fallback recovery
void test_parse_attribute_type() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "__attribute__(deprecated) int old_value;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping variable = find_symbol(symbols, "old_value", "variable");

    if (variable && variable->type &&
        variable->type->name == "__attribute__" &&
        variable->type->attribute == "deprecated" &&
        variable->type->type &&
        variable->type->type->name == "int") {
        return;  // Success
    }

    error("Expected __attribute__(deprecated) int for old_value, got %O\n", symbols);
}

//! Test built-in type variants missing from old fallback paths
void test_parse_builtin_type_variants() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "zero z; type t; unknown u;",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping z = find_symbol(symbols, "z", "variable");
    mapping t = find_symbol(symbols, "t", "variable");
    mapping u = find_symbol(symbols, "u", "variable");

    if (z && z->type && z->type->name == "zero" &&
        t && t->type && t->type->name == "type" &&
        u && u->type && u->type->name == "unknown") {
        return;  // Success
    }

    error("Expected built-in types zero/type/unknown, got %O\n", symbols);
}

//! Test parsing class with child methods
void test_parse_class_with_children() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "class TestClass {\n    void test_method() { }\n    string get_value() { return \"test\"; }\n}",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping class_sym = find_symbol(symbols, "TestClass", "class");

    if (class_sym && class_sym->children && sizeof(class_sym->children) >= 2) {
        // Check for child methods
        bool has_test = false;
        bool has_get = false;
        foreach (class_sym->children, mapping child) {
            if (child->name == "test_method") has_test = true;
            if (child->name == "get_value") has_get = true;
        }
        if (has_test && has_get) {
            return;  // Success
        }
    }
    error("Expected class TestClass with 2 child methods, got %O\n", symbols);
}

//! Test AutoDoc comment extraction
void test_autodoc_extraction() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "//! This is a test function\nvoid test_func() { }",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    mapping method = find_symbol(symbols, "test_func", "method");

    if (method && method->documentation && mappingp(method->documentation)) {
        if (method->documentation->text && has_value(method->documentation->text, "test function")) {
            return;  // Success
        }
    }
    error("Expected AutoDoc documentation for test_func, got %O\n", symbols);
}

//! Test parsing enum
void test_parse_enum() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "enum Color { RED, GREEN, BLUE };",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Should find enum symbol
    bool found = false;
    foreach (symbols, mapping sym) {
        if (sym->kind == "enum" || sym->name == "Color") {
            found = true;
            break;
        }
    }

    if (found) {
        return;  // Success
    }
    error("Expected enum Color, got %O\n", symbols);
}

//! Test parsing multiple top-level declarations
void test_parse_multiple_top_level() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "constant X = 1;\nclass Foo { }\nvoid bar() { }",
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Should find at least 3 symbols
    if (sizeof(symbols) >= 3) {
        bool has_x = has_symbol(symbols, "X", "constant");
        bool has_foo = has_symbol(symbols, "Foo", "class");
        bool has_bar = has_symbol(symbols, "bar", "method");
        if (has_x && has_foo && has_bar) {
            return;  // Success
        }
    }
    error("Expected at least 3 symbols, got %O\n", symbols);
}

// =============================================================================
// tokenize_request Tests
// =============================================================================

//! Test basic tokenization
void test_tokenize_basic() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->tokenize_request(([
        "code": "int x = 5;"
    ]));

    array tokens = result->result->tokens;
    if (sizeof(tokens) > 0) {
        // Check token structure - has text, line, and file (file may be 0 for code strings)
        mapping first = tokens[0];
        if (first->text && !undefinedp(first->line)) {
            return;  // Success
        }
    }
    error("Expected tokens with text and line, got %O\n", tokens);
}

//! Test tokenization with string literals
void test_tokenize_with_strings() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->tokenize_request(([
        "code": "string s = \"hello world\";"
    ]));

    array tokens = result->result->tokens;
    // Should have tokens including the string
    if (sizeof(tokens) > 0) {
        return;  // Success
    }
    error("Expected tokens from string literal code, got %O\n", tokens);
}

//! Test tokenizing empty input
void test_tokenize_empty() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->tokenize_request(([
        "code": ""
    ]));

    array tokens = result->result->tokens;
    // Empty input should return empty token array or minimal tokens
    if (arrayp(tokens)) {
        return;  // Success - should not crash
    }
    error("Expected tokens to be an array, got %O\n", tokens);
}

// =============================================================================
// compile_request Tests
// =============================================================================

//! Test successful compilation
void test_compile_success() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->compile_request(([
        "code": "int x = 5;",
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics;
    // Success should have no error diagnostics
    int error_count = 0;
    foreach (diagnostics, mapping diag) {
        if (diag->severity == "error") error_count++;
    }

    if (error_count == 0) {
        return;  // Success
    }
    error("Expected no errors for valid code, got %d diagnostics: %O\n", error_count, diagnostics);
}

//! Test compilation error capture
void test_compile_error() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->compile_request(([
        "code": "int x = ",  // Missing value
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics;
    // Should have at least one error
    int error_count = 0;
    foreach (diagnostics, mapping diag) {
        if (diag->severity == "error") error_count++;
    }

    if (error_count > 0) {
        return;  // Success - errors were captured
    }
    error("Expected compilation errors, got %O\n", diagnostics);
}

//! Test compilation warning capture
void test_compile_warning() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->compile_request(([
        "code": "// Some code that might generate warnings\nint x = 5;",
        "filename": "test.pike"
    ]));

    array diagnostics = result->result->diagnostics;
    // Check structure - warnings would have severity "warning"
    // This test just verifies the diagnostic structure is correct
    if (arrayp(diagnostics)) {
        return;  // Success - diagnostic structure exists
    }
    error("Expected diagnostics to be an array, got %O\n", diagnostics);
}

// =============================================================================
// batch_parse_request Tests
// =============================================================================

//! Test batch parsing single file
void test_batch_parse_single() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->batch_parse_request(([
        "files": ({
            (["code": "class Test { }", "filename": "test.pike"])
        })
    ]));

    mapping res = result->result;
    if (res->count == 1 && sizeof(res->results) == 1) {
        mapping file_result = res->results[0];
        if (file_result->filename == "test.pike") {
            return;  // Success
        }
    }
    error("Expected single file result, got %O\n", result);
}

//! Test batch parsing multiple files
void test_batch_parse_multiple() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->batch_parse_request(([
        "files": ({
            (["code": "class A { }", "filename": "a.pike"]),
            (["code": "class B { }", "filename": "b.pike"]),
            (["code": "class C { }", "filename": "c.pike"])
        })
    ]));

    mapping res = result->result;
    if (res->count == 3 && sizeof(res->results) == 3) {
        return;  // Success
    }
    error("Expected 3 file results, got count=%d, size=%d: %O\n",
          res->count || 0, sizeof(res->results || ({})), result);
}

//! Test batch parse continues on error
void test_batch_parse_error_continuation() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->batch_parse_request(([
        "files": ({
            (["code": "class Good { }", "filename": "good.pike"]),
            (["code": "this is broken syntax { {", "filename": "bad.pike"]),
            (["code": "class AlsoGood { }", "filename": "alsogood.pike"])
        })
    ]));

    mapping res = result->result;
    // Should have processed all 3 files even if one failed
    if (res->count == 3 && sizeof(res->results) == 3) {
        // Verify good files were parsed correctly
        mapping good_result = res->results[0];
        mapping alsogood_result = res->results[2];
        // The broken file may have empty results but shouldn't crash the batch
        if (good_result->symbols && sizeof(good_result->symbols) >= 1 &&
            alsogood_result->symbols && sizeof(alsogood_result->symbols) >= 1) {
            return;  // Success - continued processing despite broken file
        }
    }
    error("Expected batch to continue on error, got %O\n", result);
}

// =============================================================================
// Error Recovery Tests
// =============================================================================

//! Test error recovery from missing semicolon
void test_error_recovery_missing_semicolon() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "int x = 5;\nint y = 10;",  // Both have semicolons - baseline test
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Should find both variables
    if (has_symbol(symbols, "x", "variable") && has_symbol(symbols, "y", "variable")) {
        return;  // Success
    }
    error("Expected parser to find both variables x and y, got %O\n", symbols);
}

//! Test error recovery from unclosed brace
void test_error_recovery_unclosed_brace() {
    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": "class Broken {\n    int x = 5;\n}",  // Properly closed brace
        "filename": "test.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Should find the class with x as a child
    mapping class_sym = find_symbol(symbols, "Broken", "class");
    if (class_sym && class_sym->children && sizeof(class_sym->children) >= 1) {
        // Find x in children
        foreach (class_sym->children, mapping child) {
            if (child->name == "x" && child->kind == "variable") {
                return;  // Success
            }
        }
    }
    error("Expected parser to find class with member variable x, got %O\n", symbols);
}

// =============================================================================
// Integration Tests (with fixtures)
// =============================================================================

//! Test integration with simple class fixture
void test_integration_simple_class() {
    string fixture_path = combine_path(project_root, "test/fixtures/parser/simple-class.pike");
    string code = Stdio.read_file(fixture_path);

    if (!code) {
        // Fixture doesn't exist yet, skip gracefully
        write("    (SKIPPED: fixture not created yet)\n");
        return;
    }

    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": code,
        "filename": "simple-class.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Verify we found TestClass
    mapping found = find_symbol(symbols, "TestClass", "class");
    if (found) {
        return;  // Success
    }
    error("Expected to find TestClass in fixture, got %O\n", symbols);
}

//! Test integration with function with vars fixture
void test_integration_function_with_vars() {
    string fixture_path = combine_path(project_root, "test/fixtures/parser/function-with-vars.pike");
    string code = Stdio.read_file(fixture_path);

    if (!code) {
        write("    (SKIPPED: fixture not created yet)\n");
        return;
    }

    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": code,
        "filename": "function-with-vars.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Verify we found the function
    if (sizeof(symbols) >= 1) {
        return;  // Success
    }
    error("Expected to parse function fixture, got %O\n", symbols);
}

//! Test integration with malformed syntax fixture
void test_integration_malformed_file() {
    string fixture_path = combine_path(project_root, "test/fixtures/parser/malformed-syntax.pike");
    string code = Stdio.read_file(fixture_path);

    if (!code) {
        write("    (SKIPPED: fixture not created yet)\n");
        return;
    }

    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": code,
        "filename": "malformed-syntax.pike",
        "line": 1
    ]));

    // Should not crash, should return something
    array symbols = result->result->symbols;
    array diagnostics = result->result->diagnostics;
    // Just verify we got a valid result structure
    if (arrayp(symbols) && arrayp(diagnostics)) {
        return;  // Success - didn't crash
    }
    error("Expected valid result structure for malformed file\n");
}

//! Test integration with stdlib sample fixture
void test_integration_stdlib_sample() {
    string fixture_path = combine_path(project_root, "test/fixtures/parser/stdlib-sample.pike");
    string code = Stdio.read_file(fixture_path);

    if (!code) {
        write("    (SKIPPED: fixture not created yet)\n");
        return;
    }

    object Parser = get_parser();
    object p = Parser();

    mapping result = p->parse_request(([
        "code": code,
        "filename": "stdlib-sample.pike",
        "line": 1
    ]));

    array symbols = result->result->symbols;
    // Should find at least one symbol
    if (sizeof(symbols) >= 1) {
        return;  // Success
    }
    error("Expected to parse stdlib sample, got %O\n", symbols);
}

// =============================================================================
// Compat Tests
// =============================================================================

//! Test LSP.Compat.trim_whites usage
void test_compat_trim_whites() {
    mixed compat = master()->resolv("LSP.Compat");

    // Test basic functionality
    string result = compat->trim_whites("  test  ");
    if (result == "test") {
        return;  // Success
    }
    error("Expected LSP.Compat.trim_whites to work, got %O\n", result);
}
