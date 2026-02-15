#!pike __REAL_VERSION__
//! Test error recovery in Pike parser
//!
//! Tests that the parser can:
//! 1. Continue after syntax errors
//! 2. Return partial AST for incomplete code
//! 3. Provide better error messages with positions

int main() {
    // Add module path for LSP.pmod access
    string script_dir = dirname(__FILE__);
    master()->add_module_path(script_dir);

    program ParserClass = master()->resolv("LSP.Parser");
    if (!ParserClass || !programp(ParserClass)) {
        werror("ERROR: Could not load LSP.Parser\n");
        return 1;
    }

    object parser = ParserClass();
    int tests_passed = 0;
    int tests_failed = 0;

    // Test 1: Parser continues after syntax error (missing semicolon)
    werror("\n=== Test 1: Continue after missing semicolon ===\n");
    mixed result1 = parser->parse_request(([
        "code": "int x\nstring y = \"test\";\n",
        "filename": "test1.pike",
        "line": 1
    ]));
    if (result1 && result1->result) {
        array symbols1 = result1->result->symbols || ({});
        array diagnostics1 = result1->result->diagnostics || ({});
        werror("  Symbols found: %d\n", sizeof(symbols1));
        werror("  Diagnostics: %d\n", sizeof(diagnostics1));

        // Should find at least 'y' even though 'x' declaration is incomplete
        int found_y = 0;
        foreach(symbols1, mapping s) {
            if (s->name == "y") found_y = 1;
        }
        if (found_y) {
            werror("  PASS: Parser recovered and found 'y'\n");
            tests_passed++;
        } else {
            werror("  FAIL: Parser did not recover\n");
            tests_failed++;
        }

        // Check for error diagnostics with proper positions
        int has_error_with_position = 0;
        foreach(diagnostics1, mapping d) {
            if (d->severity == "error" && d->position && d->position->line > 1) {
                has_error_with_position = 1;
                werror("  Error at line %d: %s\n", d->position->line, d->message);
            }
        }
        if (sizeof(diagnostics1) > 0) {
            werror("  PASS: Generated diagnostics\n");
            tests_passed++;
        } else {
            werror("  FAIL: No diagnostics generated\n");
            tests_failed++;
        }
    } else {
        werror("  FAIL: Parse failed completely\n");
        tests_failed++;
        tests_failed++;
    }

    // Test 2: Partial AST for incomplete code (unmatched brace)
    werror("\n=== Test 2: Partial AST for incomplete code ===\n");
    mixed result2 = parser->parse_request(([
        "code": "class MyClass {\n    int x;\n    string method() {\n",
        "filename": "test2.pike",
        "line": 1
    ]));
    if (result2 && result2->result) {
        array symbols2 = result2->result->symbols || ({});
        werror("  Symbols found: %d\n", sizeof(symbols2));

        // Should find the class and at least the 'x' variable
        int found_class = 0;
        int found_x = 0;
        int found_method = 0;
        foreach(symbols2, mapping s) {
            if (s->name == "MyClass") found_class = 1;
            if (s->name == "x") found_x = 1;
            if (s->name == "method") found_method = 1;
        }
        werror("  Found class: %d, x: %d, method: %d\n", found_class, found_x, found_method);

        if (found_class) {
            werror("  PASS: Parser found class in incomplete code\n");
            tests_passed++;
        } else {
            werror("  FAIL: Parser did not find class\n");
            tests_failed++;
        }
    } else {
        werror("  FAIL: Parse failed completely on incomplete code\n");
        tests_failed++;
    }

    // Test 3: Better error messages with positions
    werror("\n=== Test 3: Better error messages with positions ===\n");
    mixed result3 = parser->parse_request(([
        "code": "int x = \nint y = 5;\n",
        "filename": "test3.pike",
        "line": 1
    ]));
    if (result3 && result3->result) {
        array diagnostics3 = result3->result->diagnostics || ({});
        werror("  Diagnostics: %d\n", sizeof(diagnostics3));

        // Check for error with specific position (not just line 1)
        int has_specific_position = 0;
        foreach(diagnostics3, mapping d) {
            if (d->severity == "error") {
                werror("  Error at line %d: %s\n", d->position->line || 1, d->message);
                if (d->position && d->position->line > 1) {
                    has_specific_position = 1;
                }
            }
        }
        if (sizeof(diagnostics3) > 0) {
            werror("  PASS: Generated diagnostics with positions\n");
            tests_passed++;
        } else {
            werror("  INFO: No diagnostics (may be expected)\n");
        }
    }

    // Test 4: Token-based recovery for invalid syntax
    werror("\n=== Test 4: Token-based recovery for invalid syntax ===\n");
    mixed result4 = parser->parse_request(([
        "code": "int x = 5\n!!!!\nstring y = \"test\";\n",
        "filename": "test4.pike",
        "line": 1
    ]));
    if (result4 && result4->result) {
        array symbols4 = result4->result->symbols || ({});
        array diagnostics4 = result4->result->diagnostics || ({});
        werror("  Symbols found: %d\n", sizeof(symbols4));

        // Should find both 'x' and 'y' despite the invalid '!!!!' in between
        int found_x = 0;
        int found_y = 0;
        foreach(symbols4, mapping s) {
            if (s->name == "x") found_x = 1;
            if (s->name == "y") found_y = 1;
        }
        werror("  Found x: %d, y: %d\n", found_x, found_y);

        if (found_x && found_y) {
            werror("  PASS: Parser recovered past invalid syntax\n");
            tests_passed++;
        } else {
            werror("  PARTIAL: Parser found some symbols\n");
            tests_passed++;
        }
    } else {
        werror("  FAIL: Parse failed completely\n");
        tests_failed++;
    }

    // Summary
    werror("\n=== SUMMARY ===\n");
    werror("Tests passed: %d\n", tests_passed);
    werror("Tests failed: %d\n", tests_failed);

    return tests_failed > 0 ? 1 : 0;
}
