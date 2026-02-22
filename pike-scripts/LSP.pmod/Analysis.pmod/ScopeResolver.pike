#pragma strict_types
//! ScopeResolver.pike - Position-aware variable type resolution
//!
//! Provides scope-aware type lookup for variables, handling shadowing
//! and nested scopes. Uses the existing Diagnostics.pike infrastructure
//! to track variable declarations and their types across scopes.

// Access module-level helpers
// In Analysis.pmod, sibling modules are accessed via LSP.Analysis.module
constant mod = LSP.Analysis.module;

//! Resolve the type of a variable at a specific position
//!
//! @param code
//!   Pike source code to analyze
//! @param filename
//!   Filename for error messages
//! @param line
//!   Line number (1-indexed) where to query variable type
//! @param variable_name
//!   Name of variable to query
//! @returns
//!   Mapping with type information or 0 if not found
//!   ([ "type": string type, "scope_depth": int depth, "decl_line": int line ])
public mapping|int resolve_variable_type(string code, string filename, int line, string variable_name) {
    // Handle special keywords first
    if (variable_name == "this" || variable_name == "this_program" || variable_name == "this_object") {
        return resolve_this_keyword(code, filename, line, variable_name);
    }

    // Handle :: qualified access (e.g., "ParentClass::member")
    if (has_value(variable_name, "::")) {
        return resolve_qualified_access(code, filename, line, variable_name);
    }

    // Tokenize the code using Parser.Pike (same as Diagnostics.pike)
    array tokens;
    
    mixed err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        tokens = Parser.Pike.tokenize(split_tokens);
    };
    
    if (err || !tokens || sizeof(tokens) == 0) {
        return 0;
    }
    
    array(string) lines = code / "\n";
    
    // Build scope-aware variable map
    mapping scope_map = build_scope_map(tokens, lines, filename);

    // Find variables visible at the given line (with lambda closure support - Issue #607)
    array(mapping) visible_vars = get_visible_variables_with_lambda_support(tokens, scope_map, variable_name, line);
    
    if (sizeof(visible_vars) == 0) {
        return 0;
    }
    
    // Return the innermost scope variable (last in array = deepest scope)
    return visible_vars[-1];
}

//! Build a complete scope map tracking all variable declarations
//!
//! Returns a mapping from variable names to arrays of declaration info,
//! sorted by scope depth (outermost first, innermost last)
protected mapping build_scope_map(array tokens, array(string) lines, string filename) {
    // Map: variable_name -> array of ([ type, scope_depth, decl_line, end_line ])
    mapping(string:array(mapping)) scope_map = ([]);
    
    // Current scope depth
    int scope_depth = 0;
    
    // Stack to track scope ending lines
    array(int) scope_end_stack = ({});

    // Issue #607: Track lambda scopes for closure resolution
    // Lambda captures variables from enclosing scope by reference
    array(array(int)) lambda_stack = ({});
    array(int) lambda_scope_depth = ({});

    // Issue #606: Track if we're inside a class definition
    string current_class = 0;
    int in_class_scope = 0;
    int in_anonymous_class = 0;

    // Use module-level helper functions directly (imported from .module)
    
    int i = 0;
    int end_idx = sizeof(tokens);
    
    while (i < end_idx) {
        mapping tok = tokens[i];
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
            // Find matching closing brace to know when this scope ends
            int close_idx = mod->find_matching_brace(tokens, i, end_idx);
            if (close_idx >= 0) {
                scope_end_stack += ({ tokens[close_idx]->line });
            }
            i++;
            continue;
        }
        
        if (text == "}") {
            // Remove scope end marker
            if (sizeof(scope_end_stack) > 0) {
                scope_end_stack = scope_end_stack[0..sizeof(scope_end_stack)-2];
            }
            scope_depth--;
            i++;
            continue;
        }
        
        // Detect function parameter declarations
        if (mod->is_function_definition(tokens, i, end_idx)) {
            int body_start = mod->find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = mod->find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    // Extract function parameters
                    mapping(string:mapping) params = mod->extract_function_params(tokens, i, body_start);
                    
                    // Add parameters to scope map (function-local scope)
                    foreach (params; string param_name; mapping param_info) {
                        if (!scope_map[param_name]) {
                            scope_map[param_name] = ({});
                        }
                        scope_map[param_name] += ({
                            ([
                                "type": param_info->type,
                                "scope_depth": scope_depth + 1,  // Inside function
                                "decl_line": line,
                                "end_line": tokens[body_end]->line
                            ])
                        });
                    }
                }
            }
        }

        // Issue #607: Detect lambda expressions
        if (text == "lambda") {
            int body_start = mod->find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = mod->find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    lambda_stack += ({ ({ tokens[body_start]->line, tokens[body_end]->line }) });
                    lambda_scope_depth += ({ scope_depth });
                }
            }
        }

        // Issue #606: Track class definitions
        if (text == "class") {
            int next_idx = i + 1;
            while (next_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[next_idx]->text)) == 0) next_idx++;

            if (next_idx < end_idx) {
                string next_text = tokens[next_idx]->text;
                if (next_text == "{") {
                    in_anonymous_class = 1;
                    in_class_scope = 1;
                } else if (mod->is_identifier(next_text)) {
                    current_class = next_text;
                    in_class_scope = 1;
                    in_anonymous_class = 0;
                }
            }
        }

        // Detect variable declarations
        if (mod->is_type_keyword(text)) {
            mapping decl_info = mod->try_parse_declaration(tokens, i, end_idx);
            if (decl_info && decl_info->is_declaration && decl_info->name && sizeof(decl_info->name) > 0) {
                string var_name = decl_info->name;
                string var_type = decl_info->type || text;
                
                // Determine scope end line (innermost scope)
                int end_line = sizeof(scope_end_stack) > 0 ? scope_end_stack[-1] : 999999;
                
                if (!scope_map[var_name]) {
                    scope_map[var_name] = ({});
                }
                
                // Add this declaration to the variable's scope list
                scope_map[var_name] += ({
                    ([
                        "type": var_type,
                        "scope_depth": scope_depth,
                        "decl_line": line,
                        "end_line": end_line
                    ])
                });
                
                i = decl_info->end_idx;
                continue;
            }
        }
        
        i++;
    }
    
    return scope_map;
}

//! Get all variables with the given name that are visible at the specified line
//!
//! Returns array of variable info, sorted from outermost to innermost scope
//! The last element in the array is the variable from the innermost (most specific) scope
protected array(mapping) get_visible_variables_at_line(mapping scope_map, string variable_name, int line) {
    if (!scope_map[variable_name]) {
        return ({});
    }
    
    array(mapping) all_decls = scope_map[variable_name];
    array(mapping) visible = ({});
    
    // Filter to declarations that are visible at the given line
    // (declared before or at the line, and not yet out of scope)
    foreach (all_decls, mapping decl) {
        if (decl->decl_line <= line && line <= decl->end_line) {
            visible += ({ decl });
        }
    }
    
    // Sort by scope depth (outermost first, innermost last)
    sort(visible->scope_depth, visible);

    return visible;
}

//! Issue #606: Resolve this, this_program, and this_object keywords
protected mapping|int resolve_this_keyword(string code, string filename, int line, string keyword) {
    array tokens;

    mixed err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        tokens = Parser.Pike.tokenize(split_tokens);
    };

    if (err || !tokens || sizeof(tokens) == 0) {
        return 0;
    }

    string enclosing_class = 0;
    int is_anonymous = 0;
    int current_class_start = 0;
    int current_class_end = 999999;

    int i = 0;
    int end_idx = sizeof(tokens);

    while (i < end_idx) {
        mapping tok = tokens[i];
        string text = tok->text;
        int tok_line = tok->line;

        if (text == "class") {
            int next_idx = i + 1;
            while (next_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[next_idx]->text)) == 0) next_idx++;

            if (next_idx < end_idx) {
                string next_text = tokens[next_idx]->text;
                if (next_text == "{") {
                    if (tok_line <= line) {
                        current_class_start = tok_line;
                        is_anonymous = 1;
                    }
                } else if (mod->is_identifier(next_text)) {
                    if (tok_line <= line) {
                        enclosing_class = next_text;
                        current_class_start = tok_line;
                        is_anonymous = 0;
                    }
                }
            }
        } else if (text == "{" && (enclosing_class || is_anonymous) && tok_line >= current_class_start) {
            int close_idx = mod->find_matching_brace(tokens, i, end_idx);
            if (close_idx >= 0) {
                current_class_end = tokens[close_idx]->line;
            }
            if (tok_line > line) {
                break;
            }
        } else if (text == "}" && tok_line == current_class_end) {
            enclosing_class = 0;
            is_anonymous = 0;
        }

        i++;
    }

    string result_type;
    if (keyword == "this") {
        result_type = enclosing_class ? enclosing_class : "object";
    } else if (keyword == "this_program") {
        result_type = enclosing_class ? "program(" + enclosing_class + ")" : "program";
    } else if (keyword == "this_object") {
        result_type = "object";
    } else {
        return 0;
    }

    return ([
        "type": result_type,
        "scope_depth": 0,
        "decl_line": enclosing_class ? current_class_start : 1,
        "end_line": enclosing_class ? current_class_end : 999999,
        "is_keyword": 1,
        "keyword": keyword,
        "is_anonymous": is_anonymous
    ]);
}

//! Issue #605: Resolve :: qualified access (e.g., "ParentClass::member")
protected mapping|int resolve_qualified_access(string code, string filename, int line, string qualified_name) {
    array(string) parts = qualified_name / "::";
    if (sizeof(parts) != 2) {
        return 0;
    }

    string class_name = parts[0];
    string member_name = parts[1];

    array tokens;

    mixed err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        tokens = Parser.Pike.tokenize(split_tokens);
    };

    if (err || !tokens || sizeof(tokens) == 0) {
        return 0;
    }

    int class_start = 0;
    int class_end = 999999;

    int i = 0;
    int end_idx = sizeof(tokens);

    while (i < end_idx) {
        mapping tok = tokens[i];
        string text = tok->text;

        if (text == "class") {
            int next_idx = i + 1;
            while (next_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[next_idx]->text)) == 0) next_idx++;

            if (next_idx < end_idx && tokens[next_idx]->text == class_name) {
                class_start = tok->line;
                int brace_idx = mod->find_next_token(tokens, next_idx, end_idx, "{");
                if (brace_idx >= 0) {
                    int close_idx = mod->find_matching_brace(tokens, brace_idx, end_idx);
                    if (close_idx >= 0) {
                        class_end = tokens[close_idx]->line;
                    }
                }
                break;
            }
        }

        i++;
    }

    if (class_start == 0) {
        return 0;
    }

    i = 0;
    while (i < end_idx) {
        mapping tok = tokens[i];
        string text = tok->text;
        int tok_line = tok->line;

        if (tok_line < class_start || tok_line > class_end) {
            i++;
            continue;
        }

        if (mod->is_type_keyword(text)) {
            mapping decl_info = mod->try_parse_declaration(tokens, i, end_idx);
            if (decl_info && decl_info->is_declaration && decl_info->name == member_name) {
                return ([
                    "type": decl_info->type || text,
                    "scope_depth": 0,
                    "decl_line": tok_line,
                    "end_line": class_end,
                    "is_qualified": 1,
                    "qualifying_class": class_name,
                    "member_name": member_name
                ]);
            }
        }

        i++;
    }

    return 0;
}

//! Issue #607: Get visible variables with lambda closure support
protected array(mapping) get_visible_variables_with_lambda_support(array tokens, mapping scope_map, string variable_name, int line) {
    array(mapping) visible = get_visible_variables_at_line(scope_map, variable_name, line);

    array(array(int)) lambda_scopes = ({});

    int i = 0;
    int end_idx = sizeof(tokens);

    while (i < end_idx) {
        mapping tok = tokens[i];
        string text = tok->text;

        if (text == "lambda") {
            int body_start = mod->find_next_token(tokens, i, end_idx, "{");
            if (body_start >= 0) {
                int body_end = mod->find_matching_brace(tokens, body_start, end_idx);
                if (body_end > body_start) {
                    lambda_scopes += ({ ({ tokens[body_start]->line, tokens[body_end]->line }) });
                }
            }
        }

        i++;
    }

    foreach (lambda_scopes, array(int) lambda_bounds) {
        int lambda_start = lambda_bounds[0];
        int lambda_end = lambda_bounds[1];

        if (line >= lambda_start && line <= lambda_end) {
            if (scope_map[variable_name]) {
                array(mapping) all_decls = scope_map[variable_name];

                foreach (all_decls, mapping decl) {
                    if (decl->decl_line < lambda_start) {
                        int is_shadowed = 0;
                        foreach (visible, mapping v) {
                            if (v->decl_line >= lambda_start && v->decl_line <= lambda_end) {
                                is_shadowed = 1;
                                break;
                            }
                        }

                        if (!is_shadowed) {
                            visible += ({
                                ([
                                    "type": decl->type,
                                    "scope_depth": decl->scope_depth,
                                    "decl_line": decl->decl_line,
                                    "end_line": decl->end_line,
                                    "is_captured": 1,
                                    "captured_by_lambda": 1,
                                    "lambda_start": lambda_start
                                ])
                            });
                        }
                    }
                }
            }

            break;
        }
    }

    if (sizeof(visible) > 0) {
        sort(visible->scope_depth, visible);
    }

    return visible;
}
