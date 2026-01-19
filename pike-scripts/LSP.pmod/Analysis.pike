//! Analysis.pike - Stateless analysis class for Pike LSP
//!
//! Design per CONTEXT.md:
//! - Analysis is stateless: all handlers are pure functions
//! - Analysis uses LSP.Compat.trim_whites() for string operations
//! - Analysis uses Parser.Pike for tokenization
//! - Handlers wrap errors in LSP.LSPError responses
//!
//! Use: import LSP.Analysis; object a = Analysis(); a->handle_find_occurrences(...);

//! Analysis class - Stateless analysis handlers for Pike LSP
//! Use: import LSP.Analysis; object a = Analysis(); a->handle_find_occurrences(...);
class Analysis {
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
            return LSP.LSPError(-32000, describe_error(err))->to_response();
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
}
