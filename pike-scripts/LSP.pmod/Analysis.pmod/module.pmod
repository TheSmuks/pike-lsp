//! module.pmod - Shared helper functions for Analysis.pmod
//!
//! This module contains shared helper functions used across all classes
//! in the Analysis.pmod directory. Functions are organized by category:
//!
//! - Constants: Variable initialization states and type checking
//! - Type checking: is_type_keyword, is_identifier, is_assignment_operator
//! - Token navigation: find_next_token, find_matching_brace, etc.
//! - Position helpers: get_char_pos_in_line
//! - Variable management: remove_out_of_scope_vars, save/restore states
//! - Declaration parsing: try_parse_declaration
//! - Definition detection: is_function_definition, is_lambda_definition
//! - Parameter extraction: extract_function_params

// =========================================================================
// Constants for variable initialization tracking
// =========================================================================

//! Variable has never been assigned
constant STATE_UNINITIALIZED = 0;

//! Variable was assigned in some branches only
constant STATE_MAYBE_INIT = 1;

//! Variable is definitely initialized
constant STATE_INITIALIZED = 2;

//! Variable state cannot be determined (e.g., passed by reference)
constant STATE_UNKNOWN = 3;

//! Types that need explicit initialization (UNDEFINED would cause runtime errors)
constant NEEDS_INIT_TYPES = (<
    "string", "array", "mapping", "multiset",
    "object", "function", "program", "mixed"
>);

// =========================================================================
// Type checking helpers
// =========================================================================

//! Check if token text is a Pike type keyword
//!
//! @param text Token text to check
//! @returns 1 if text is a type keyword, 0 otherwise
int is_type_keyword(string text) {
    multiset(string) types = (<
        "int", "float", "string", "array", "mapping", "multiset",
        "object", "function", "program", "mixed", "void", "auto"
    >);
    return types[text] ? 1 : 0;
}

//! Check if token text is an identifier
//!
//! Identifiers start with letter or underscore, may contain alphanumerics.
//!
//! @param text Token text to check
//! @returns 1 if text is an identifier, 0 otherwise
int is_identifier(string text) {
    if (sizeof(text) == 0) return 0;
    int c = text[0];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_')) return 0;
    return 1;
}

//! Check if token is an assignment operator
//!
//! @param text Token text to check
//! @returns 1 if text is an assignment operator, 0 otherwise
int is_assignment_operator(string text) {
    multiset(string) ops = (<
        "=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
        "<<=", ">>=", "||=", "&&="
    >);
    return ops[text] ? 1 : 0;
}

// =========================================================================
// Token navigation helpers
// =========================================================================

//! Find the next token with given text
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @param target Token text to find
//! @returns Index of found token or -1 if not found
int find_next_token(array tokens, int start_idx, int end_idx, string target) {
    for (int i = start_idx; i < end_idx && i < sizeof(tokens); i++) {
        if (tokens[i]->text == target) return i;
    }
    return -1;
}

//! Find next non-whitespace, non-comment token
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @returns Index of next meaningful token or -1 if not found
int find_next_meaningful_token(array tokens, int start_idx, int end_idx) {
    for (int i = start_idx; i < end_idx && i < sizeof(tokens); i++) {
        string text = tokens[i]->text;
        if (sizeof(LSP.Compat.trim_whites(text)) > 0 && !has_prefix(text, "//") && !has_prefix(text, "/*")) {
            return i;
        }
    }
    return -1;
}

//! Find previous non-whitespace, non-comment token
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index (searching backwards)
//! @param min_idx Minimum token index
//! @returns Index of previous meaningful token or -1 if not found
int find_prev_meaningful_token(array tokens, int start_idx, int min_idx) {
    for (int i = start_idx; i >= min_idx && i >= 0; i--) {
        string text = tokens[i]->text;
        if (sizeof(LSP.Compat.trim_whites(text)) > 0 && !has_prefix(text, "//") && !has_prefix(text, "/*")) {
            return i;
        }
    }
    return -1;
}

//! Find matching closing brace
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index (should be a "{")
//! @param end_idx Ending token index (exclusive)
//! @returns Index of matching "}" or -1 if not found
int find_matching_brace(array tokens, int start_idx, int end_idx) {
    if (start_idx >= sizeof(tokens) || tokens[start_idx]->text != "{") return -1;

    int depth = 1;
    for (int i = start_idx + 1; i < end_idx && i < sizeof(tokens); i++) {
        string text = tokens[i]->text;
        if (text == "{") depth++;
        else if (text == "}") {
            depth--;
            if (depth == 0) return i;
        }
    }
    return -1;
}

//! Find matching closing paren
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index (should be a "(")
//! @param end_idx Ending token index (exclusive)
//! @returns Index of matching ")" or -1 if not found
int find_matching_paren(array tokens, int start_idx, int end_idx) {
    if (start_idx >= sizeof(tokens) || tokens[start_idx]->text != "(") return -1;

    int depth = 1;
    for (int i = start_idx + 1; i < end_idx && i < sizeof(tokens); i++) {
        string text = tokens[i]->text;
        if (text == "(") depth++;
        else if (text == ")") {
            depth--;
            if (depth == 0) return i;
        }
    }
    return -1;
}

// =========================================================================
// Position helpers
// =========================================================================

//! Get character position of a token in a line
//!
//! @param lines Array of source code lines
//! @param line_no Line number (1-indexed)
//! @param token_text Token text to search for
//! @returns Character position (0-indexed) or 0 if not found
int get_char_pos_in_line(array(string) lines, int line_no, string token_text) {
    if (line_no > 0 && line_no <= sizeof(lines)) {
        string line = lines[line_no - 1];
        int pos = search(line, token_text);
        if (pos >= 0) return pos;
    }
    return 0;
}

// =========================================================================
// Variable management helpers
// =========================================================================

//! Remove variables that are going out of scope
//!
//! @param variables Mapping of variable name -> variable info
//! @param scope_depth Current scope depth (remove vars at this depth or higher)
void remove_out_of_scope_vars(mapping(string:mapping) variables, int scope_depth) {
    array(string) to_remove = ({});
    foreach (variables; string name; mapping info) {
        if (info->scope_depth >= scope_depth) {
            to_remove += ({ name });
        }
    }
    foreach (to_remove, string name) {
        m_delete(variables, name);
    }
}

//! Save current variable initialization states
//!
//! Creates a snapshot of variable states for branch tracking.
//!
//! @param variables Mapping of variable name -> variable info
//! @returns Mapping of variable name -> state
mapping save_variable_states(mapping(string:mapping) variables) {
    mapping saved = ([]);
    foreach (variables; string name; mapping info) {
        saved[name] = info->state;
    }
    return saved;
}

//! Restore variable states from saved snapshot
//!
//! @param variables Mapping of variable name -> variable info
//! @param saved Mapping of variable name -> state to restore
void restore_variable_states(mapping(string:mapping) variables, mapping saved) {
    foreach (saved; string name; int state) {
        if (variables[name]) {
            variables[name]->state = state;
        }
    }
}

// =========================================================================
// Declaration parsing
// =========================================================================

//! Try to parse a variable declaration starting at token index
//!
//! Looks for pattern: type var_name; or type var_name = value;
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @returns Mapping with: is_declaration, name, type, has_initializer, end_idx
mapping try_parse_declaration(array tokens, int start_idx, int end_idx) {
    if (start_idx >= end_idx || start_idx >= sizeof(tokens)) {
        return ([ "is_declaration": 0 ]);
    }

    int i = start_idx;
    string type_name = "";

    // Collect type (may be complex like "array(int)" or "mapping(string:int)")
    if (is_type_keyword(tokens[i]->text)) {
        type_name = tokens[i]->text;
        i++;

        // Check for complex type: type(...)
        if (i < end_idx && i < sizeof(tokens) && tokens[i]->text == "(") {
            int paren_depth = 1;
            type_name += "(";
            i++;
            while (i < end_idx && i < sizeof(tokens) && paren_depth > 0) {
                string t = tokens[i]->text;
                if (t == "(") paren_depth++;
                else if (t == ")") paren_depth--;
                type_name += t;
                i++;
            }
        }

        // Skip whitespace
        while (i < end_idx && i < sizeof(tokens) &&
               sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) {
            i++;
        }

        // Next should be identifier (variable name)
        if (i < end_idx && i < sizeof(tokens) && is_identifier(tokens[i]->text)) {
            string var_name = tokens[i]->text;

            // Skip keywords that look like identifiers
            if (is_type_keyword(var_name)) {
                return ([ "is_declaration": 0 ]);
            }

            i++;

            // Check for initializer
            int has_init = 0;
            int next_meaningful = find_next_meaningful_token(tokens, i, end_idx);
            if (next_meaningful >= 0 && next_meaningful < sizeof(tokens)) {
                string next_text = tokens[next_meaningful]->text;
                if (next_text == "=") {
                    has_init = 1;
                    // Skip to end of statement
                    i = find_next_token(tokens, next_meaningful, end_idx, ";");
                    if (i < 0) i = end_idx;
                } else if (next_text == ";") {
                    i = next_meaningful + 1;
                } else if (next_text == ",") {
                    // Multiple declarations - just handle first one for now
                    i = next_meaningful;
                }
            }

            return ([
                "is_declaration": 1,
                "name": var_name,
                "type": type_name,
                "has_initializer": has_init,
                "end_idx": i
            ]);
        }
    }

    return ([ "is_declaration": 0 ]);
}

// =========================================================================
// Definition detection
// =========================================================================

//! Check if tokens at index represent a function definition
//!
//! Looks for pattern: [modifiers] type name ( ... ) {
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @returns 1 if function definition found, 0 otherwise
int is_function_definition(array tokens, int start_idx, int end_idx) {
    // Look for pattern: [modifiers] type name ( ... ) {
    int i = start_idx;

    // Skip modifiers
    while (i < end_idx && i < sizeof(tokens)) {
        string text = tokens[i]->text;
        if ((<"public", "private", "protected", "static", "final", "inline", "local", "optional", "variant">)[text]) {
            i++;
        } else {
            break;
        }
    }

    // Need a type
    if (i >= end_idx || i >= sizeof(tokens)) return 0;
    if (!is_type_keyword(tokens[i]->text)) return 0;
    i++;

    // Skip complex type params
    if (i < end_idx && i < sizeof(tokens) && tokens[i]->text == "(") {
        int depth = 1;
        i++;
        while (i < end_idx && i < sizeof(tokens) && depth > 0) {
            if (tokens[i]->text == "(") depth++;
            else if (tokens[i]->text == ")") depth--;
            i++;
        }
    }

    // Need an identifier (function name)
    while (i < end_idx && i < sizeof(tokens) && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
    if (i >= end_idx || i >= sizeof(tokens)) return 0;
    if (!is_identifier(tokens[i]->text)) return 0;
    if (is_type_keyword(tokens[i]->text)) return 0;  // Not a valid function name
    i++;

    // Need opening paren for parameter list
    while (i < end_idx && i < sizeof(tokens) && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
    if (i >= end_idx || i >= sizeof(tokens)) return 0;
    if (tokens[i]->text != "(") return 0;

    // Find matching close paren
    int paren_depth = 1;
    i++;
    while (i < end_idx && i < sizeof(tokens) && paren_depth > 0) {
        if (tokens[i]->text == "(") paren_depth++;
        else if (tokens[i]->text == ")") paren_depth--;
        i++;
    }

    // Next should be { for function body (or ; for declaration-only)
    while (i < end_idx && i < sizeof(tokens) && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
    if (i >= end_idx || i >= sizeof(tokens)) return 0;

    return tokens[i]->text == "{";
}

//! Check if tokens at index represent a lambda definition
//!
//! Looks for pattern: lambda ( ... ) {
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @returns 1 if lambda definition found, 0 otherwise
int is_lambda_definition(array tokens, int start_idx, int end_idx) {
    int i = start_idx;

    // Skip whitespace
    while (i < end_idx && i < sizeof(tokens) && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
    if (i >= end_idx || i >= sizeof(tokens)) return 0;

    if (tokens[i]->text != "lambda") return 0;
    i++;

    // Need opening paren for parameter list
    while (i < end_idx && i < sizeof(tokens) && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
    if (i >= end_idx || i >= sizeof(tokens)) return 0;
    if (tokens[i]->text != "(") return 0;

    // Find matching close paren
    int paren_depth = 1;
    i++;
    while (i < end_idx && i < sizeof(tokens) && paren_depth > 0) {
        if (tokens[i]->text == "(") paren_depth++;
        else if (tokens[i]->text == ")") paren_depth--;
        i++;
    }

    // Next should be { for lambda body
    while (i < end_idx && i < sizeof(tokens) && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
    if (i >= end_idx || i >= sizeof(tokens)) return 0;

    return tokens[i]->text == "{";
}

// =========================================================================
// Parameter extraction
// =========================================================================

//! Extract function parameters as pre-initialized variables
//!
//! Parses function signature between parens and returns parameter mappings.
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param body_start Index of function body opening brace
//! @returns Mapping of parameter name -> variable info mapping
mapping(string:mapping) extract_function_params(array tokens, int start_idx, int body_start) {
    mapping(string:mapping) params = ([]);

    // Find opening paren
    int paren_start = find_next_token(tokens, start_idx, body_start, "(");
    if (paren_start < 0) return params;

    // Find closing paren
    int paren_end = find_matching_paren(tokens, paren_start, body_start);
    if (paren_end < 0) return params;

    // Parse parameters between parens
    int i = paren_start + 1;
    while (i < paren_end) {
        // Skip whitespace
        while (i < paren_end && sizeof(LSP.Compat.trim_whites(tokens[i]->text)) == 0) i++;
        if (i >= paren_end) break;

        // Look for: type name or type name = default
        mapping decl = try_parse_declaration(tokens, i, paren_end);
        if (decl->is_declaration) {
            params[decl->name] = ([
                "type": decl->type,
                "state": STATE_INITIALIZED,  // Parameters are always initialized
                "decl_line": tokens[i]->line,
                "decl_char": 0,
                "scope_depth": 1,
                "needs_init": 0  // Don't warn for parameters
            ]);
            i = decl->end_idx;
        } else {
            i++;
        }

        // Skip comma
        if (i < paren_end && tokens[i]->text == ",") i++;
    }

    return params;
}

//! ============================================================================
//! ANALYSIS DELEGATING CLASS
//! ============================================================================
//! Backward-compatible delegating class for analyzer.pike compatibility.
//!
//! The original monolithic Analysis class (1191 lines) has been split into:
//! - Diagnostics.pike: Uninitialized variable analysis (538 lines)
//! - Completions.pike: Completion context analysis (183 lines)
//! - Variables.pike: Find identifier occurrences (116 lines)
//!
//! This class forwards all handler calls to the appropriate specialized class.

//! Analysis class - Backward-compatible delegating class
//!
//! Usage in analyzer.pike (with updated pattern):
//!   program AnalysisClass = master()->resolv("LSP.Analysis.Analysis");
//!   analysis = AnalysisClass();
//!
//! The class is exported via module.pmod, so it's accessible as:
//!   master()->resolv("LSP.Analysis.Analysis")
class Analysis {
    //! Private handler instances (created on first use)
    private object diagnostics_handler;
    private object completions_handler;
    private object variables_handler;

    //! Create a new Analysis instance
    void create() {
        // Handlers are created lazily when first needed
    }

    //! Get or create the diagnostics handler
    protected object get_diagnostics_handler() {
        if (!diagnostics_handler) {
            mixed diag_class = master()->resolv("LSP.Analysis.Diagnostics");
            if (diag_class && programp(diag_class)) {
                diagnostics_handler = diag_class(0);
            }
        }
        return diagnostics_handler;
    }

    //! Get or create the completions handler
    protected object get_completions_handler() {
        if (!completions_handler) {
            mixed comp_class = master()->resolv("LSP.Analysis.Completions");
            if (comp_class && programp(comp_class)) {
                completions_handler = comp_class(0);
            }
        }
        return completions_handler;
    }

    //! Get or create the variables handler
    protected object get_variables_handler() {
        if (!variables_handler) {
            mixed var_class = master()->resolv("LSP.Analysis.Variables");
            if (var_class && programp(var_class)) {
                variables_handler = var_class(0);
            }
        }
        return variables_handler;
    }

    //! Analyze code for potentially uninitialized variable usage
    //! Delegates to Diagnostics class in Analysis.pmod/
    //!
    //! @param params Mapping with "code" and "filename" keys
    //! @returns Mapping with "result" containing "diagnostics" array
    mapping handle_analyze_uninitialized(mapping params) {
        object handler = get_diagnostics_handler();
        if (handler) {
            return handler->handle_analyze_uninitialized(params);
        }
        // Graceful degradation - return empty diagnostics on error
        return (["result": (["diagnostics": ({})])]);
    }

    //! Get completion context at a specific position using tokenization
    //! Delegates to Completions class in Analysis.pmod/
    //!
    //! @param params Mapping with "code" (string), "line" (int, 1-based), "character" (int, 0-based)
    //! @returns Mapping with "result" containing context, objectName, prefix, operator
    mapping handle_get_completion_context(mapping params) {
        object handler = get_completions_handler();
        if (handler) {
            return handler->handle_get_completion_context(params);
        }
        // Graceful degradation - return default "none" context on error
        return (["result": (["context": "none", "objectName": "", "prefix": "", "operator": ""])]);
    }

    //! Find all identifier occurrences using tokenization
    //! Delegates to Variables class in Analysis.pmod/
    //!
    //! @param params Mapping with "code" key containing Pike source code
    //! @returns Mapping with "result" containing "occurrences" array
    mapping handle_find_occurrences(mapping params) {
        object handler = get_variables_handler();
        if (handler) {
            return handler->handle_find_occurrences(params);
        }
        return LSP.module.LSPError(-32000, "Variables handler not available")->to_response();
    }

    //! Unified analyze handler that consolidates compilation, tokenization, and analysis
    //!
    //! This is the main entry point for Phase 12 Request Consolidation.
    //! Performs shared operations (compilation, tokenization) once, then delegates
    //! to appropriate handlers based on the requested include types.
    //!
    //! @param params Mapping with "code", "filename", and "include" keys
    //!               - code: Pike source code to analyze
    //!               - filename: Source filename (for diagnostics)
    //!               - include: Array of result types to return ("parse", "introspect", "diagnostics", "tokenize")
    //! @returns Mapping with "result" containing requested results and "failures" for any that failed
    //!          Each requested type appears in EITHER result OR failures, never both
    mapping handle_analyze(mapping params) {
        string code = params->code || "";
        string filename = params->filename || "input.pike";
        array(string) include = params->include || ({});

        // Valid include types
        multiset(string) VALID_INCLUDE_TYPES = (<
            "parse", "introspect", "diagnostics", "tokenize"
        >);

        // Validate include types
        array(string) valid_include = ({});
        foreach (include, string type) {
            if (VALID_INCLUDE_TYPES[type]) {
                valid_include += ({ type });
            }
        }

        // If no valid include types, return empty result
        if (sizeof(valid_include) == 0) {
            return ([
                "result": ([]),
                "failures": ([])
            ]);
        }

        // Shared data structures
        array tokens = ({});
        program compiled_prog = 0;
        array(string) split_tokens = ({});
        mapping(string:mixed) result = ([]);
        mapping(string:mixed) failures = ([]);

        // Performance tracking
        float compilation_ms = 0.0;
        float tokenization_ms = 0.0;

        // Step 1: Tokenization (shared by parse, diagnostics, tokenize)
        int needs_tokenization = has_value(valid_include, "parse") ||
                                 has_value(valid_include, "diagnostics") ||
                                 has_value(valid_include, "tokenize");

        if (needs_tokenization) {
            object tokenize_timer = System.Timer();
            mixed tok_err = catch {
                split_tokens = Parser.Pike.split(code);
                tokens = Parser.Pike.tokenize(split_tokens);
            };
            tokenization_ms = tokenize_timer->peek() * 1000.0;

            if (tok_err) {
                string error_msg = describe_error(tok_err);
                // Tokenization failed - all dependent types fail
                if (has_value(valid_include, "tokenize")) {
                    failures->tokenize = ([
                        "message": error_msg,
                        "kind": "ParseError"
                    ]);
                }
                if (has_value(valid_include, "parse")) {
                    failures->parse = ([
                        "message": error_msg,
                        "kind": "ParseError"
                    ]);
                }
                if (has_value(valid_include, "diagnostics")) {
                    failures->diagnostics = ([
                        "message": error_msg,
                        "kind": "ParseError"
                    ]);
                }
            } else {
                // Tokenization succeeded - store tokenize result if requested
                if (has_value(valid_include, "tokenize")) {
                    array tokenize_result = ({});
                    foreach (tokens, mixed t) {
                        tokenize_result += ({
                            ([
                                "text": t->text,
                                "line": t->line,
                                "file": t->file || filename
                            ])
                        });
                    }
                    result->tokenize = ([ "tokens": tokenize_result ]);
                }
            }
        }

        // Step 2: Compilation (only for introspect)
        if (has_value(valid_include, "introspect")) {
            object compile_timer = System.Timer();
            mixed compile_err = catch {
                // Use compile_string for compilation
                compiled_prog = compile_string(code, filename);
            };
            compilation_ms = compile_timer->peek() * 1000.0;

            if (compile_err || !compiled_prog) {
                failures->introspect = ([
                    "message": describe_error(compile_err || "Compilation failed"),
                    "kind": "CompilationError"
                ]);
            }
        }

        // Step 3: Process each requested result type using shared data

        // Parse - uses shared tokens (re-tokenizes internally via Parser)
        if (has_value(valid_include, "parse") && !failures->parse) {
            mixed parse_err = catch {
                // Delegate to Parser.pike parse_request logic
                program ParserClass = master()->resolv("LSP.Parser");
                object parser = ParserClass();
                mapping parse_params = ([
                    "code": code,
                    "filename": filename,
                    "line": 1
                ]);
                mapping parse_response = parser->parse_request(parse_params);

                if (parse_response && parse_response->result) {
                    result->parse = parse_response->result;
                } else {
                    failures->parse = ([
                        "message": "Parse returned no result",
                        "kind": "InternalError"
                    ]);
                }
            };

            if (parse_err) {
                failures->parse = ([
                    "message": describe_error(parse_err),
                    "kind": "ParseError"
                ]);
            }
        }

        // Introspect - uses shared compiled program
        if (has_value(valid_include, "introspect") && !failures->introspect) {
            mixed introspect_err = catch {
                // Delegate to Intelligence.pike introspect_program
                // Use the double-name pattern to get the Intelligence class from the module
                program IntelligenceClass = master()->resolv("LSP.Intelligence.Intelligence");
                object intelligence = IntelligenceClass();

                // Use introspect_program directly since we already have the compiled program
                mapping introspect_result = intelligence->introspect_program(compiled_prog);
                introspect_result->success = 1;
                introspect_result->diagnostics = ({});

                result->introspect = introspect_result;
            };

            if (introspect_err) {
                failures->introspect = ([
                    "message": describe_error(introspect_err),
                    "kind": "ResolutionError"
                ]);
            }
        }

        // Diagnostics - uses shared tokens (via Diagnostics handler)
        if (has_value(valid_include, "diagnostics") && !failures->diagnostics) {
            mixed diag_err = catch {
                // Use the Diagnostics handler
                object diag_handler = get_diagnostics_handler();
                if (diag_handler) {
                    mapping diag_response = diag_handler->handle_analyze_uninitialized(([
                        "code": code,
                        "filename": filename
                    ]));
                    if (diag_response && diag_response->result) {
                        result->diagnostics = diag_response->result;
                    } else {
                        failures->diagnostics = ([
                            "message": "Diagnostics returned no result",
                            "kind": "InternalError"
                        ]);
                    }
                } else {
                    failures->diagnostics = ([
                        "message": "Diagnostics handler not available",
                        "kind": "InternalError"
                    ]);
                }
            };

            if (diag_err) {
                failures->diagnostics = ([
                    "message": describe_error(diag_err),
                    "kind": "InternalError"
                ]);
            }
        }

        // Add performance metadata if we have any timing data
        if (compilation_ms > 0.0 || tokenization_ms > 0.0) {
            mapping perf = ([]);
            if (compilation_ms > 0.0) {
                perf->compilation_ms = compilation_ms;
            }
            if (tokenization_ms > 0.0) {
                perf->tokenization_ms = tokenization_ms;
            }
            result->_perf = perf;
        }

        return ([
            "result": result,
            "failures": failures
        ]);
    }
}
