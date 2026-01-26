//! Diagnostics.pike - Uninitialized variable analysis
//!
//! This file provides diagnostic analysis for Pike code, specifically
//! detecting variables used before initialization. It implements sophisticated
//! control flow tracking across scopes, branches, and function bodies.
//!
//! Design pattern:
//! - create(object ctx) constructor for context injection
//! - Handlers wrap errors in catch blocks with LSPError responses
//! - Partial analysis is returned on error rather than failing

//! Private context field (reserved for future use with LSP context)
protected object context;

//! Get access to module.pmod constants and helpers
//! In a .pmod subdirectory, we access module.pmod functions via the module program
protected program module_program = master()->resolv("LSP.Analysis.module");

//! Create a new Diagnostics instance
//! @param ctx Optional LSP context object
void create(object ctx) {
    context = ctx;
}

//! Analyze code for potentially uninitialized variable usage
//!
//! This is the main handler entry point for uninitialized variable analysis.
//!
//! @param params Mapping with "code" and "filename" keys
//! @returns Mapping with "result" containing "diagnostics" array
//!          Returns empty diagnostics on error (graceful degradation, not crash)
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

    // Helper functions from module.pmod
    function remove_out_of_scope_vars_fn = module_program->remove_out_of_scope_vars;
    function is_lambda_definition_fn = module_program->is_lambda_definition;
    function find_next_token_fn = module_program->find_next_token;
    function find_matching_brace_fn = module_program->find_matching_brace;
    function extract_function_params_fn = module_program->extract_function_params;
    function is_function_definition_fn = module_program->is_function_definition;

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
            remove_out_of_scope_vars_fn(variables, scope_depth);
            scope_depth--;
            i++;
            continue;
        }

        // Detect lambda definitions
        if (is_lambda_definition_fn(tokens, i, end_idx)) {
            // Skip to lambda body and analyze it
            int body_start = find_next_token_fn(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace_fn(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    // Add lambda parameters as initialized variables
                    mapping(string:mapping) param_vars = extract_function_params_fn(tokens, i, body_start);

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
        if (is_function_definition_fn(tokens, i, end_idx)) {
            // Skip to function body and analyze it
            int body_start = find_next_token_fn(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace_fn(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    // Add function parameters as initialized variables
                    mapping(string:mapping) param_vars = extract_function_params_fn(tokens, i, body_start);

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
            int body_start = find_next_token_fn(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace_fn(tokens, body_start, end_idx);
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

    // Get constants from module.pmod
    int STATE_UNINITIALIZED = module_program->STATE_UNINITIALIZED;
    int STATE_MAYBE_INIT = module_program->STATE_MAYBE_INIT;
    int STATE_INITIALIZED = module_program->STATE_INITIALIZED;
    int STATE_UNKNOWN = module_program->STATE_UNKNOWN;
    multiset(string) NEEDS_INIT_TYPES = module_program->NEEDS_INIT_TYPES;

    // Helper functions from module.pmod
    function remove_out_of_scope_vars_fn = module_program->remove_out_of_scope_vars;
    function is_lambda_definition_fn = module_program->is_lambda_definition;
    function find_next_token_fn = module_program->find_next_token;
    function find_matching_brace_fn = module_program->find_matching_brace;
    function extract_function_params_fn = module_program->extract_function_params;
    function is_type_keyword_fn = module_program->is_type_keyword;
    function is_identifier_fn = module_program->is_identifier;
    function try_parse_declaration_fn = module_program->try_parse_declaration;
    function is_assignment_operator_fn = module_program->is_assignment_operator;
    function find_next_meaningful_token_fn = module_program->find_next_meaningful_token;
    function find_prev_meaningful_token_fn = module_program->find_prev_meaningful_token;
    function save_variable_states_fn = module_program->save_variable_states;
    function restore_variable_states_fn = module_program->restore_variable_states;
    function get_char_pos_in_line_fn = module_program->get_char_pos_in_line;

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
            remove_out_of_scope_vars_fn(variables, scope_depth);
            scope_depth--;
            if (scope_depth <= 0) break;  // End of function body
            i++;
            continue;
        }

        // Detect lambda definitions inside function bodies
        if (is_lambda_definition_fn(tokens, i, end_idx)) {
            int body_start = find_next_token_fn(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = find_matching_brace_fn(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    mapping(string:mapping) param_vars = extract_function_params_fn(tokens, i, body_start);
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
        if (is_type_keyword_fn(text)) {
            int temp_idx = i + 1;
            // Skip whitespace
            while (temp_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[temp_idx]->text)) == 0) temp_idx++;
            // Check if next non-whitespace is an identifier (function name)
            if (temp_idx < end_idx && is_identifier_fn(tokens[temp_idx]->text)) {
                temp_idx++;
                // Skip whitespace
                while (temp_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[temp_idx]->text)) == 0) temp_idx++;
                // Check if next is opening paren
                if (temp_idx < end_idx && tokens[temp_idx]->text == "(") {
                    // This looks like a function definition - find body
                    int body_start = find_next_token_fn(tokens, temp_idx, end_idx, "{");
                    if (body_start >= 0) {
                        int body_end = find_matching_brace_fn(tokens, body_start, end_idx);
                        if (body_end > body_start) {
                            // Extract function parameters as initialized variables
                            mapping(string:mapping) param_vars = extract_function_params_fn(tokens, i, body_start);

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
        if (is_type_keyword_fn(text)) {
            // Try to parse variable declaration
            mapping decl_info = try_parse_declaration_fn(tokens, i, end_idx);
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
                    "decl_char": get_char_pos_in_line_fn(lines, line, var_name),
                    "scope_depth": scope_depth,
                    "needs_init": needs_init
                ]);

                i = decl_info->end_idx;
                continue;
            }
        }

        // Detect assignments to existing variables
        if (is_identifier_fn(text) && variables[text]) {
            // Check if this is an assignment (next non-whitespace token is =, +=, etc.)
            int next_idx = find_next_meaningful_token_fn(tokens, i + 1, end_idx);
            if (next_idx >= 0 && next_idx < sizeof(tokens)) {
                string next_text = tokens[next_idx]->text;
                if (is_assignment_operator_fn(next_text)) {
                    // This is an assignment - mark variable as initialized
                    variables[text]->state = STATE_INITIALIZED;
                    i = next_idx + 1;
                    continue;
                }
            }
        }

        // Detect variable usage (reading)
        if (is_identifier_fn(text) && variables[text]) {
            mapping var_info = variables[text];

            // Check if this is a read (not an assignment target)
            int next_idx = find_next_meaningful_token_fn(tokens, i + 1, end_idx);
            int is_read = 1;
            if (next_idx >= 0 && next_idx < sizeof(tokens)) {
                string next_text = tokens[next_idx]->text;
                if (is_assignment_operator_fn(next_text)) {
                    is_read = 0;  // This is an assignment target, not a read
                }
            }

            // Check previous token to see if we're a target of assignment
            int prev_idx = find_prev_meaningful_token_fn(tokens, i - 1, start_idx);
            if (prev_idx >= 0) {
                // If previous token is a type, this might be a declaration
                string prev_text = tokens[prev_idx]->text;
                if (is_type_keyword_fn(prev_text)) {
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
                            "character": get_char_pos_in_line_fn(lines, line, text)
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
            mapping saved_states = save_variable_states_fn(variables);
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
                branch->branch_states += ({ save_variable_states_fn(variables) });
                // Restore to pre-if states for else branch
                restore_variable_states_fn(variables, branch->saved_states);
            }
        }

        // Handle foreach - loop variable(s) are always initialized
        // Supports: foreach (expr, type var), foreach (expr; type var), foreach (expr; type key; type value)
        if (text == "foreach") {
            int paren_start = find_next_token_fn(tokens, i, end_idx, "(");
            if (paren_start >= 0) {
                // Collect ALL separator positions to handle multi-variable foreach
                array(int) separators = ({});
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
                    else if (paren_depth == 1 && (t == "," || t == ";")) {
                        separators += ({ j });  // Capture ALL separators
                    }
                }

                // Parse variable after EACH separator (skip first for comma syntax)
                for (int sep_idx = 0; sep_idx < sizeof(separators); sep_idx++) {
                    int var_start = separators[sep_idx] + 1;

                    // Skip whitespace tokens after separator
                    while (var_start < paren_close && var_start < sizeof(tokens)) {
                        string t = tokens[var_start]->text;
                        if (sizeof(LSP.Compat.trim_whites(t)) > 0) break;
                        var_start++;
                    }

                    // Look for variable declaration after this separator
                    mapping loop_var = try_parse_declaration_fn(tokens, var_start, paren_close);
                    if (loop_var && loop_var->is_declaration) {
                        // If variable already exists, just mark as initialized (handles pre-declared vars)
                        if (variables[loop_var->name]) {
                            variables[loop_var->name]->state = STATE_INITIALIZED;
                            variables[loop_var->name]->needs_init = 0;
                        } else {
                            variables[loop_var->name] = ([
                                "type": loop_var->type,
                                "state": STATE_INITIALIZED,  // Loop variable is always initialized
                                "decl_line": tokens[var_start]->line,
                                "decl_char": 0,
                                "scope_depth": scope_depth + 1,
                                "needs_init": 0  // Don't warn for loop variables
                            ]);
                        }
                    } else {
                        // Handle pre-declared variable: foreach (expr; var) or foreach (expr, var)
                        string t = tokens[var_start]->text;
                        if (is_identifier_fn(t)) {
                            if (variables[t]) {
                                variables[t]->state = STATE_INITIALIZED;
                            }
                        }
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

        // Handle sscanf - output arguments (3rd+) are initialized
        // Pattern: sscanf(source, format, var1, var2, ...)
        if (text == "sscanf") {
            int paren_start = find_next_token_fn(tokens, i + 1, end_idx, "(");
            if (paren_start >= 0) {
                int paren_close = -1;
                int paren_depth = 1;
                int arg_count = 0;  // Count arguments (commas at depth 1)
                int arg_start = paren_start + 1;

                for (int j = paren_start + 1; j < end_idx && j < sizeof(tokens); j++) {
                    string t = tokens[j]->text;
                    if (t == "(") paren_depth++;
                    else if (t == ")") {
                        paren_depth--;
                        if (paren_depth == 0) {
                            paren_close = j;
                            // Process final argument if arg_count >= 2
                            if (arg_count >= 2) {
                                // Scan from arg_start to j for tracked variables
                                for (int k = arg_start; k < j; k++) {
                                    string vt = tokens[k]->text;
                                    if (is_identifier_fn(vt) && variables[vt]) {
                                        variables[vt]->state = STATE_INITIALIZED;
                                    }
                                }
                            }
                            break;
                        }
                    }
                    else if (paren_depth == 1 && t == ",") {
                        // Process argument before comma if arg_count >= 2
                        if (arg_count >= 2) {
                            for (int k = arg_start; k < j; k++) {
                                string vt = tokens[k]->text;
                                if (is_identifier_fn(vt) && variables[vt]) {
                                    variables[vt]->state = STATE_INITIALIZED;
                                }
                            }
                        }
                        arg_count++;
                        arg_start = j + 1;  // Next arg starts after comma
                    }
                }

                // Skip past the sscanf call
                if (paren_close >= 0) {
                    i = paren_close;
                }
            }
        }

        i++;
    }

    return diagnostics;
}
