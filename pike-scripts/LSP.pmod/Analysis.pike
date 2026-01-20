//! Analysis.pike - Stateless analysis class for Pike LSP
//!
//! Design per CONTEXT.md:
//! - Analysis is stateless: all handlers are pure functions
//! - Analysis uses LSP.Compat.trim_whites() for string operations
//! - Analysis uses Parser.Pike for tokenization
//! - Handlers wrap errors in LSP.module.LSPError responses
//!
//! Use: import LSP.Analysis; object a = Analysis(); a->handle_find_occurrences(...);


//! Analysis class - Stateless analysis handlers for Pike LSP
//! Use: import LSP.Analysis; object a = Analysis(); a->handle_find_occurrences(...);
//! Create a new Analysis instance
void create() {
    // No state to initialize (stateless pattern)
}

// Variable initialization states
constant STATE_UNINITIALIZED = 0;  // Never assigned
constant STATE_MAYBE_INIT = 1;     // Assigned in some branches only
constant STATE_INITIALIZED = 2;    // Definitely assigned
constant STATE_UNKNOWN = 3;        // Can't determine (e.g., passed by reference)

// Types that need explicit initialization (UNDEFINED would cause runtime errors)
constant NEEDS_INIT_TYPES = (<
    "string", "array", "mapping", "multiset",
    "object", "function", "program", "mixed"
>);

//! Find all identifier occurrences using tokenization
//!
//! This is much more accurate and faster than regex-based searching.
//! Uses Parser.Pike tokenization to find all identifiers in Pike source code,
//! filtering out keywords and operators.
//!
//! @param params Mapping with "code" key containing Pike source code
//! @returns Mapping with "result" containing "occurrences" array
//!          Each occurrence has: text, line, character
mapping handle_find_occurrences(mapping params) {
    string code = params->code || "";

    array occurrences = ({});
    array(string) keywords = ({
        "if","else","elif","for","while","do","switch","case","break",
        "continue","return","goto","catch","inherit","import",
        "typeof","sscanf","gauge","spawn","foreach","lambda",
        "class","enum","typedef","constant","final","inline",
        "local","extern","static","nomask","private","protected",
        "public","variant","optional","void","zero","mixed",
        "int","float","string","array","mapping","multiset",
        "object","function","program"
    });

    mixed err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        array pike_tokens = Parser.Pike.tokenize(split_tokens);

        // Filter for identifier tokens and build position map
        foreach (pike_tokens, mixed t) {
            // Skip non-identifier tokens
            // t is a Parser.Pike.Token object with: text, line, file
            string text = t->text;
            int line = t->line;

            // Only include identifiers (not keywords, operators, literals)
            // Identifiers start with letter or underscore, contain alphanumerics
            if (sizeof(text) > 0 &&
                (text[0] >= 'a' && text[0] <= 'z' ||
                 text[0] >= 'A' && text[0] <= 'Z' ||
                 text[0] == '_')) {
                // Skip common Pike keywords
                int is_keyword = 0;
                if (has_value(keywords, text)) {
                    is_keyword = 1;
                }
                if (!is_keyword) {
                    /* Calculate character position by looking at the line */
                    occurrences += ({
                        ([
                            "text": text,
                            "line": line,
                            "character": get_char_position(code, line, text)
                        ])
                    });
                }
            }
        }
    };

    if (err) {
        return LSP.module.LSPError(-32000, describe_error(err))->to_response();
    }

    return ([
        "result": ([
            "occurrences": occurrences
        ])
    ]);
}

//! Analyze code for potentially uninitialized variable usage
//!
//! This is the most complex analysis handler, implementing variable
//! initialization tracking across scopes, branches, and function bodies.
//!
//! @param params Mapping with "code" and "filename" keys
//! @returns Mapping with "result" containing "diagnostics" array
//!          Returns empty diagnostics on error (not crash)
mapping handle_analyze_uninitialized(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array(mapping) diagnostics = ({});

    mixed err = catch {
        diagnostics = analyze_uninitialized_impl(code, filename);
    };

    if (err) {
        // Return empty diagnostics on error rather than failing
        // Partial analysis is better than no analysis
        werror("analyze_uninitialized error: %s\n", describe_error(err));
        diagnostics = ({});
    }

    return ([
        "result": ([
            "diagnostics": diagnostics
        ])
    ]);
}

//! Implementation of uninitialized variable analysis
//!
//! Tokenizes the code and calls analyze_scope to find uninitialized variables.
//!
//! @param code Pike source code to analyze
//! @param filename Source filename for diagnostics
//! @returns Array of diagnostic mappings (empty on tokenization error)
protected array(mapping) analyze_uninitialized_impl(string code, string filename) {
    array(mapping) diagnostics = ({});

    // Tokenize the code
    array tokens = ({});
    mixed tok_err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        tokens = Parser.Pike.tokenize(split_tokens);
    };

    if (tok_err || sizeof(tokens) == 0) {
        return diagnostics;
    }

    // Build line -> character offset mapping for accurate positions
    array(string) lines = code / "\n";

    // Analyze at function/method level
    // We'll track variables within each scope
    diagnostics = analyze_scope(tokens, lines, filename, 0, sizeof(tokens));

    return diagnostics;
}

//! Analyze a scope (global, function, or block) for uninitialized variables
//!
//! Tracks variable declarations and usage across scopes, handling:
//! - Block boundaries ({ })
//! - Lambda/function definitions (recurses via analyze_function_body)
//! - Class definitions (recurses via analyze_scope)
//!
//! @param tokens Array of Parser.Pike tokens
//! @param lines Source code lines for position lookup
//! @param filename Source filename
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @returns Array of diagnostic mappings
protected array(mapping) analyze_scope(array tokens, array(string) lines,
                                        string filename, int start_idx, int end_idx) {
    array(mapping) diagnostics = ({});

    // Variable tracking: name -> variable info
    // Each variable has: type, state, decl_line, decl_char, needs_init, scope_depth
    mapping(string:mapping) variables = ([]);

    // Current scope depth (for nested blocks)
    int scope_depth = 0;

    // Track if we're inside a function body
    int in_function_body = 0;

    // Token index
    int i = start_idx;

    while (i < end_idx && i < sizeof(tokens)) {
        object tok = tokens[i];
        string text = tok->text;
        int line = tok->line;

        // Skip whitespace and comments
        if (sizeof(LSP.Compat.trim_whites(text)) == 0 || has_prefix(text, "//") || has_prefix(text, "/*")) {
            i++;
            continue;
        }

        // Track scope depth
        if (text == "{") {
            scope_depth++;
            i++;
            continue;
        }

        if (text == "}") {
            // Remove variables that go out of scope
            remove_out_of_scope_vars(variables, scope_depth);
            scope_depth--;
            i++;
            continue;
        }

        // Detect lambda definitions
        if (is_lambda_definition(tokens, i, end_idx)) {
            // Skip to lambda body and analyze it
            int body_start = find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    // Add lambda parameters as initialized variables
                    mapping(string:mapping) param_vars = extract_function_params(tokens, i, body_start);

                    // Analyze lambda body with parameters pre-initialized
                    array(mapping) func_diags = analyze_function_body(
                        tokens, lines, filename, body_start + 1, body_end, param_vars
                    );
                    diagnostics += func_diags;

                    i = body_end + 1;
                    continue;
                }
            }
        }

        // Detect function/method definitions
        if (is_function_definition(tokens, i, end_idx)) {
            // Skip to function body and analyze it
            int body_start = find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    // Add function parameters as initialized variables
                    mapping(string:mapping) param_vars = extract_function_params(tokens, i, body_start);

                    // Analyze function body with parameters pre-initialized
                    array(mapping) func_diags = analyze_function_body(
                        tokens, lines, filename, body_start + 1, body_end, param_vars
                    );
                    diagnostics += func_diags;

                    i = body_end + 1;
                    continue;
                }
            }
        }

        // Detect class definitions - recurse into them
        if (text == "class") {
            int body_start = find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    // Analyze class body (will find methods inside)
                    array(mapping) class_diags = analyze_scope(
                        tokens, lines, filename, body_start + 1, body_end
                    );
                    diagnostics += class_diags;

                    i = body_end + 1;
                    continue;
                }
            }
        }

        i++;
    }

    return diagnostics;
}

//! Helper to get character position of a token on a line
//!
//! Converts token line number to character position by finding the token
//! text within the source line.
//!
//! @param code Full source code
//! @param line_no Line number (1-indexed)
//! @param token_text The token text to search for
//! @returns Character position (0-indexed) or 0 if not found
protected int get_char_position(string code, int line_no, string token_text) {
    array lines = code / "\n";
    if (line_no > 0 && line_no <= sizeof(lines)) {
        string line = lines[line_no - 1];
        int pos = search(line, token_text);
        if (pos >= 0) return pos;
    }
    return 0;
}

//! Get completion context at a specific position using tokenization
//!
//! Analyzes code around cursor position to determine completion context.
//! This enables accurate code completion in LSP clients.
//!
//! Context types:
//! - "none": Error or undeterminable context
//! - "global": Cursor at module scope (before any tokens)
//! - "identifier": Regular identifier completion (no access operator)
//! - "member_access": Member access via -> or .
//! - "scope_access": Scope access via ::
//!
//! @param params Mapping with "code" (string), "line" (int, 1-based), "character" (int, 0-based)
//! @returns Mapping with "result" containing context, objectName, prefix, operator
mapping handle_get_completion_context(mapping params) {
    string code = params->code || "";
    int target_line = params->line || 1;
    int target_char = params->character || 0;

    mapping result = ([
        "context": "none",
        "objectName": "",
        "prefix": "",
        "operator": ""
    ]);

    mixed err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        array pike_tokens = Parser.Pike.tokenize(split_tokens);

        // Find tokens around the cursor position
        // We need to find the token at or just before the cursor
        int token_idx = -1;
        for (int i = 0; i < sizeof(pike_tokens); i++) {
            object tok = pike_tokens[i];
            int tok_line = tok->line;
            int tok_char = get_char_position(code, tok_line, tok->text);

            // Check if this token is at or before our cursor
            if (tok_line < target_line ||
                (tok_line == target_line && tok_char <= target_char)) {
                token_idx = i;
            } else {
                break;
            }
        }

        if (token_idx == -1) {
            // Cursor is before all tokens
            result->context = "global";
            return (["result": result]);
        }

        // Look at surrounding tokens to determine context
        // Scan backwards from cursor to find access operators (->, ., ::)

        // Get the current token at/before cursor
        object current_tok = pike_tokens[token_idx];
        string current_text = current_tok->text;
        int current_line = current_tok->line;
        int current_char = get_char_position(code, current_line, current_text);

        // Scan backwards to find the most recent access operator
        string found_operator = "";
        int operator_idx = -1;

        for (int i = token_idx; i >= 0; i--) {
            object tok = pike_tokens[i];
            string text = LSP.Compat.trim_whites(tok->text);

            // Check if this is an access operator
            if (text == "->" || text == "." || text == "::") {
                found_operator = text;
                operator_idx = i;
                break;
            }

            // Stop at statement boundaries
            if (text == ";" || text == "{" || text == "}") {
                break;
            }
        }

        if (found_operator != "") {
            // Found an access operator - this is member/scope access
            result->operator = found_operator;

            // Find the object/module name by looking backwards from the operator
            string object_parts = "";
            for (int i = operator_idx - 1; i >= 0; i--) {
                object obj_tok = pike_tokens[i];
                string obj_text = LSP.Compat.trim_whites(obj_tok->text);

                // Stop at statement boundaries or other operators
                if (sizeof(obj_text) == 0 ||
                    obj_text == ";" || obj_text == "{" || obj_text == "}" ||
                    obj_text == "(" || obj_text == ")" || obj_text == "," ||
                    obj_text == "=" || obj_text == "==" || obj_text == "+" ||
                    obj_text == "-" || obj_text == "*" || obj_text == "/" ||
                    obj_text == "->" || obj_text == "::") {
                    break;
                }

                // Build the object name (handling dots in qualified names)
                if (sizeof(object_parts) > 0) {
                    object_parts = obj_text + object_parts;
                } else {
                    object_parts = obj_text;
                }
            }

            result->objectName = object_parts;
            result->prefix = current_text;

            if (found_operator == "::") {
                result->context = "scope_access";
            } else {
                result->context = "member_access";
            }
        } else {
            // No access operator found - regular identifier completion
            result->prefix = current_text;
            result->context = "identifier";
        }
    };

    if (err) {
        // Gracefully degrade - return default "none" context on error
        // Log for debugging but don't crash
        werror("get_completion_context error: %s\n", describe_error(err));
    }

    return ([
        "result": result
    ]);
}

// =========================================================================
// State/Type checking helpers
// =========================================================================

//! Check if token text is a Pike type keyword
//!
//! @param text Token text to check
//! @returns 1 if text is a type keyword, 0 otherwise
protected int is_type_keyword(string text) {
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
protected int is_identifier(string text) {
    if (sizeof(text) == 0) return 0;
    int c = text[0];
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_')) return 0;
    return 1;
}

//! Check if token is an assignment operator
//!
//! @param text Token text to check
//! @returns 1 if text is an assignment operator, 0 otherwise
protected int is_assignment_operator(string text) {
    multiset(string) ops = (<
        "=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=",
        "<<=", ">>=", "||=", "&&="
    >);
    return ops[text] ? 1 : 0;
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
protected mapping try_parse_declaration(array tokens, int start_idx, int end_idx) {
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
protected int is_function_definition(array tokens, int start_idx, int end_idx) {
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
protected int is_lambda_definition(array tokens, int start_idx, int end_idx) {
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
protected mapping(string:mapping) extract_function_params(array tokens, int start_idx, int body_start) {
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

// =========================================================================
// Token navigation
// =========================================================================

//! Find the next token with given text
//!
//! @param tokens Array of Parser.Pike tokens
//! @param start_idx Starting token index
//! @param end_idx Ending token index (exclusive)
//! @param target Token text to find
//! @returns Index of found token or -1 if not found
protected int find_next_token(array tokens, int start_idx, int end_idx, string target) {
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
protected int find_next_meaningful_token(array tokens, int start_idx, int end_idx) {
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
protected int find_prev_meaningful_token(array tokens, int start_idx, int min_idx) {
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
protected int find_matching_brace(array tokens, int start_idx, int end_idx) {
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
protected int find_matching_paren(array tokens, int start_idx, int end_idx) {
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
// Position lookup
// =========================================================================

//! Get character position of a token in a line
//!
//! @param lines Array of source code lines
//! @param line_no Line number (1-indexed)
//! @param token_text Token text to search for
//! @returns Character position (0-indexed) or 0 if not found
protected int get_char_pos_in_line(array(string) lines, int line_no, string token_text) {
    if (line_no > 0 && line_no <= sizeof(lines)) {
        string line = lines[line_no - 1];
        int pos = search(line, token_text);
        if (pos >= 0) return pos;
    }
    return 0;
}

// =========================================================================
// Variable management
// =========================================================================

//! Remove variables that are going out of scope
//!
//! @param variables Mapping of variable name -> variable info
//! @param scope_depth Current scope depth (remove vars at this depth or higher)
protected void remove_out_of_scope_vars(mapping(string:mapping) variables, int scope_depth) {
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
protected mapping save_variable_states(mapping(string:mapping) variables) {
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
protected void restore_variable_states(mapping(string:mapping) variables, mapping saved) {
    foreach (saved; string name; int state) {
        if (variables[name]) {
            variables[name]->state = state;
        }
    }
}

// =========================================================================
// Function body analysis
// =========================================================================

//! Analyze a function body for uninitialized variable usage
//!
//! This is the core analysis that tracks variable declarations,
//! assignments, and usage across all control flow paths.
//!
//! @param tokens Array of Parser.Pike tokens
//! @param lines Source code lines for position lookup
//! @param filename Source filename
//! @param start_idx Starting token index (after opening {)
//! @param end_idx Ending token index (closing })
//! @param initial_vars Initial variables (function parameters)
//! @returns Array of diagnostic mappings
protected array(mapping) analyze_function_body(array tokens, array(string) lines,
                                                string filename, int start_idx, int end_idx,
                                                mapping(string:mapping) initial_vars) {
    array(mapping) diagnostics = ({});

    // Copy initial variables (function parameters)
    mapping(string:mapping) variables = copy_value(initial_vars);

    // Scope depth within this function
    int scope_depth = 1;  // We're already inside the function body

    // Stack for tracking branch states (for if/else, loops)
    array(mapping) branch_stack = ({});

    int i = start_idx;

    while (i < end_idx && i < sizeof(tokens)) {
        object tok = tokens[i];
        string text = tok->text;
        int line = tok->line;

        // Skip whitespace and comments
        if (sizeof(LSP.Compat.trim_whites(text)) == 0 || has_prefix(text, "//") || has_prefix(text, "/*")) {
            i++;
            continue;
        }

        // Track scope depth
        if (text == "{") {
            scope_depth++;
            i++;
            continue;
        }

        if (text == "}") {
            remove_out_of_scope_vars(variables, scope_depth);
            scope_depth--;
            if (scope_depth <= 0) break;  // End of function body
            i++;
            continue;
        }

        // Detect lambda definitions inside function bodies
        if (is_lambda_definition(tokens, i, end_idx)) {
            int body_start = find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    mapping(string:mapping) param_vars = extract_function_params(tokens, i, body_start);
                    array(mapping) func_diags = analyze_function_body(
                        tokens, lines, filename, body_start + 1, body_end, param_vars
                    );
                    diagnostics += func_diags;

                    i = body_end + 1;
                    continue;
                }
            }
        }

        // Detect local function definitions inside function bodies
        // Pattern: type name ( ... ) { ... }
        if (is_type_keyword(text)) {
            int temp_idx = i + 1;
            // Skip whitespace
            while (temp_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[temp_idx]->text)) == 0) temp_idx++;
            // Check if next non-whitespace is an identifier (function name)
            if (temp_idx < end_idx && is_identifier(tokens[temp_idx]->text)) {
                temp_idx++;
                // Skip whitespace
                while (temp_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[temp_idx]->text)) == 0) temp_idx++;
                // Check if next is opening paren
                if (temp_idx < end_idx && tokens[temp_idx]->text == "(") {
                    // This looks like a function definition - find body
                    int body_start = find_next_token(tokens, temp_idx, end_idx, "{");
                    if (body_start >= 0) {
                        int body_end = find_matching_brace(tokens, body_start, end_idx);
                        if (body_end > body_start) {
                            // Extract function parameters as initialized variables
                            mapping(string:mapping) param_vars = extract_function_params(tokens, i, body_start);

                            // Analyze local function body with parameters pre-initialized
                            array(mapping) func_diags = analyze_function_body(
                                tokens, lines, filename, body_start + 1, body_end, param_vars
                            );
                            diagnostics += func_diags;

                            i = body_end + 1;
                            continue;
                        }
                    }
                }
            }
        }

        // Detect variable declarations
        if (is_type_keyword(text)) {
            // Try to parse variable declaration
            mapping decl_info = try_parse_declaration(tokens, i, end_idx);
            if (decl_info && decl_info->is_declaration) {
                string var_name = decl_info->name;
                string var_type = decl_info->type;
                int has_initializer = decl_info->has_initializer;

                // Determine if this type needs initialization
                int needs_init = NEEDS_INIT_TYPES[var_type] ? 1 : 0;

                // Also check for complex types like array(int), mapping(string:int)
                if (!needs_init) {
                    foreach (indices(NEEDS_INIT_TYPES), string need_type) {
                        if (has_prefix(var_type, need_type + "(") ||
                            has_prefix(var_type, need_type + " ")) {
                            needs_init = 1;
                            break;
                        }
                    }
                }

                // Track the variable
                variables[var_name] = ([
                    "type": var_type,
                    "state": has_initializer ? STATE_INITIALIZED : STATE_UNINITIALIZED,
                    "decl_line": line,
                    "decl_char": get_char_pos_in_line(lines, line, var_name),
                    "scope_depth": scope_depth,
                    "needs_init": needs_init
                ]);

                i = decl_info->end_idx;
                continue;
            }
        }

        // Detect assignments to existing variables
        if (is_identifier(text) && variables[text]) {
            // Check if this is an assignment (next non-whitespace token is =, +=, etc.)
            int next_idx = find_next_meaningful_token(tokens, i + 1, end_idx);
            if (next_idx >= 0 && next_idx < sizeof(tokens)) {
                string next_text = tokens[next_idx]->text;
                if (is_assignment_operator(next_text)) {
                    // This is an assignment - mark variable as initialized
                    variables[text]->state = STATE_INITIALIZED;
                    i = next_idx + 1;
                    continue;
                }
            }
        }

        // Detect variable usage (reading)
        if (is_identifier(text) && variables[text]) {
            mapping var_info = variables[text];

            // Check if this is a read (not an assignment target)
            int next_idx = find_next_meaningful_token(tokens, i + 1, end_idx);
            int is_read = 1;
            if (next_idx >= 0 && next_idx < sizeof(tokens)) {
                string next_text = tokens[next_idx]->text;
                if (is_assignment_operator(next_text)) {
                    is_read = 0;  // This is an assignment target, not a read
                }
            }

            // Check previous token to see if we're a target of assignment
            int prev_idx = find_prev_meaningful_token(tokens, i - 1, start_idx);
            if (prev_idx >= 0) {
                // If previous token is a type, this might be a declaration
                string prev_text = tokens[prev_idx]->text;
                if (is_type_keyword(prev_text)) {
                    is_read = 0;  // This is a declaration
                }
            }

            if (is_read && var_info->needs_init && var_info->state != STATE_INITIALIZED) {
                // Generate diagnostic
                string severity = var_info->state == STATE_MAYBE_INIT ? "warning" : "warning";
                string message = var_info->state == STATE_MAYBE_INIT
                    ? sprintf("Variable '%s' may be uninitialized", text)
                    : sprintf("Variable '%s' is used before being initialized", text);

                diagnostics += ({
                    ([
                        "message": message,
                        "severity": severity,
                        "position": ([
                            "file": filename,
                            "line": line,
                            "character": get_char_pos_in_line(lines, line, text)
                        ]),
                        "variable": text,
                        "source": "uninitialized-variable"
                    ])
                });

                // Mark as warned to avoid duplicate diagnostics
                var_info->state = STATE_UNKNOWN;
            }
        }

        // Handle control flow: if/else
        if (text == "if") {
            // Save current variable states for branch analysis
            mapping saved_states = save_variable_states(variables);
            branch_stack += ({ ([
                "type": "if",
                "saved_states": saved_states,
                "branch_states": ({})
            ]) });
        }

        // Handle else
        if (text == "else" && sizeof(branch_stack) > 0) {
            mapping branch = branch_stack[-1];
            if (branch->type == "if") {
                // Save current branch's final states
                branch->branch_states += ({ save_variable_states(variables) });
                // Restore to pre-if states for else branch
                restore_variable_states(variables, branch->saved_states);
            }
        }

        // Handle foreach - loop variable is always initialized
        if (text == "foreach") {
            // Find the loop variable(s) in: foreach (expr, type var) or foreach (expr; type var; ...)
            int paren_start = find_next_token(tokens, i, end_idx, "(");
            if (paren_start >= 0) {
                int comma_or_semi = -1;
                int paren_close = -1;
                int paren_depth = 1;
                for (int j = paren_start + 1; j < end_idx && j < sizeof(tokens); j++) {
                    string t = tokens[j]->text;
                    if (t == "(") paren_depth++;
                    else if (t == ")") {
                        paren_depth--;
                        if (paren_depth == 0) {
                            paren_close = j;
                            break;
                        }
                    }
                    else if (paren_depth == 1 && (t == "," || t == ";") && comma_or_semi < 0) {
                        comma_or_semi = j;
                    }
                }

                if (comma_or_semi >= 0) {
                    // Skip whitespace tokens after comma/semicolon
                    int var_start = comma_or_semi + 1;
                    while (var_start < end_idx && var_start < sizeof(tokens)) {
                        string t = tokens[var_start]->text;
                        if (sizeof(LSP.Compat.trim_whites(t)) > 0) break;
                        var_start++;
                    }

                    // Look for variable after comma/semicolon
                    mapping loop_var = try_parse_declaration(tokens, var_start, end_idx);
                    if (loop_var && loop_var->is_declaration) {
                        variables[loop_var->name] = ([
                            "type": loop_var->type,
                            "state": STATE_INITIALIZED,  // Loop variable is always initialized
                            "decl_line": tokens[var_start]->line,
                            "decl_char": 0,
                            "scope_depth": scope_depth + 1,
                            "needs_init": 0  // Don't warn for loop variables
                        ]);
                    }
                }

                // Skip past the foreach parentheses to avoid re-parsing the loop variable as a declaration
                if (paren_close >= 0) {
                    i = paren_close;
                }
            }
        }

        // Handle catch blocks - variables assigned in try may be uninitialized
        if (text == "catch") {
            // Find the preceding block and mark variables assigned there as MAYBE_INIT
            // This is a simplified approach - full implementation would track try/catch blocks
        }

        i++;
    }

    return diagnostics;
}
