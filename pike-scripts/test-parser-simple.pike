#!/usr/bin/env pike
#pike __REAL_VERSION__

//! Simple test for parser error recovery

int main() {
    // Add module path for LSP.pmod access
    string script_dir = dirname(__FILE__);
    master()->add_module_path(script_dir);

    program ParserClass = master()->resolv("LSP.Parser");
    if (!ParserClass) {
        werror("ERROR: Could not load LSP.Parser\n");
        werror("Available modules:\n");
        foreach(master()->pike_module_path, string p) {
            werror("  - %s\n", p);
        }
        return 1;
    }

    werror("Parser loaded successfully\n");

    object parser = ParserClass();
    if (!parser) {
        werror("ERROR: Could not instantiate parser\n");
        return 1;
    }

    werror("Parser instantiated\n");

    // Test 1: Parser continues after syntax error (missing semicolon)
    werror("\n=== Test 1: Continue after missing semicolon ===\n");
    mixed result1 = parser->parse_request(([
        "code": "int x\nstring y = 5;\n",
        "filename": "test1.pike",
        "line": 1
    ]));

    if (result1 && result1->result) {
        array symbols1 = result1->result->symbols || ({});
        array diagnostics1 = result1->result->diagnostics || ({});
        werror("  Symbols found: %d\n", sizeof(symbols1));
        werror("  Diagnostics: %d\n", sizeof(diagnostics1));

        foreach(symbols1, mapping s) {
            werror("    - %s (%s)\n", s->name, s->kind);
        }

        foreach(diagnostics1, mapping d) {
            werror("    Diagnostic: %s at line %d: %s\n",
                   d->severity, d->position->line || 1, d->message);
        }
    } else {
        werror("  Parse result: %O\n", result1);
    }

    return 0;
}
