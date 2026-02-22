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

    // Find variables visible at the given line
    array(mapping) visible_vars = get_visible_variables_at_line(scope_map, variable_name, line);

    // Issue #603: If no variables found, check inherited class members
    if (sizeof(visible_vars) == 0) {
        visible_vars = get_inherited_variable(tokens, scope_map, variable_name, line);
    }

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

    // Track inherited classes per scope level: scope_depth -> array of class names
    array(array(string)) inherits_stack = ({});

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
            // Initialize inherits for new scope (inherit from parent)
            inherits_stack += (({}));
            i++;
            continue;
        }

        if (text == "}") {
            // Remove scope end marker
            if (sizeof(scope_end_stack) > 0) {
                scope_end_stack = scope_end_stack[0..sizeof(scope_end_stack)-2];
            }
            // Pop inherits for this scope
            if (sizeof(inherits_stack) > 0) {
                inherits_stack = inherits_stack[0..sizeof(inherits_stack)-2];
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

        // Handle constants (constant keyword) - Issue #601
        if (text == "constant") {
            // Skip 'constant' keyword
            int j = i + 1;
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;

            if (j < end_idx) {
                string name = tokens[j]->text;
                if (mod->is_identifier(name)) {
                    // Determine type from value if present
                    string const_type = "mixed";
                    j++;
                    while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;

                    if (j < end_idx && tokens[j]->text == "=") {
                        j++;
                        while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;

                        if (j < end_idx) {
                            string value_text = tokens[j]->text;
                            // Infer type from literal
                            if (sizeof(value_text) > 1 && value_text[0] == '"' && value_text[-1] == '"') {
                                const_type = "string";
                            } else if (sizeof(value_text) > 1 && value_text[0] == '\'') {
                                const_type = "int";
                            } else if (sizeof(value_text) > 0 && (value_text[0] >= '0' && value_text[0] <= '9')) {
                                if (has_value(value_text, ".")) {
                                    const_type = "float";
                                } else {
                                    const_type = "int";
                                }
                            }
                        }
                    }

                    int end_line = sizeof(scope_end_stack) > 0 ? scope_end_stack[-1] : 999999;
                    if (!scope_map[name]) {
                        scope_map[name] = ({});
                    }
                    scope_map[name] += ({
                        ([
                            "type": const_type,
                            "scope_depth": scope_depth,
                            "decl_line": line,
                            "end_line": end_line,
                            "is_constant": 1
                        ])
                    });
                    i = j;
                    continue;
                }
            }
        }

        // Handle type declarations where the type is an identifier (e.g., "Color c = RED;")
        // This is handled AFTER constants and other keyword-based declarations
        // Only handle when the pattern matches: <identifier> <identifier> = ...
        if (mod->is_identifier(text)) {
            int next_idx = i + 1;
            while (next_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[next_idx]->text)) == 0) next_idx++;

            // Check if this is a type declaration pattern: <identifier> <identifier> = ...
            if (next_idx < end_idx && mod->is_identifier(tokens[next_idx]->text)) {
                string type_name = text;
                string var_name = tokens[next_idx]->text;

                // Only add if the variable isn't already in scope
                if (!scope_map[var_name]) {
                    // Check for assignment
                    int assign_idx = next_idx + 1;
                    while (assign_idx < end_idx && sizeof(LSP.Compat.trim_whites(tokens[assign_idx]->text)) == 0) assign_idx++;

                    if (assign_idx < end_idx && tokens[assign_idx]->text == "=") {
                        // This is a type declaration - add it to scope
                        int end_line = sizeof(scope_end_stack) > 0 ? scope_end_stack[-1] : 999999;

                        if (!scope_map[var_name]) {
                            scope_map[var_name] = ({});
                        }
                        scope_map[var_name] += ({
                            ([
                                "type": "int",
                                "scope_depth": scope_depth,
                                "decl_line": line,
                                "end_line": end_line
                            ])
                        });

                        i = assign_idx + 1;
                        continue;
                    }
                }
            }
        }

        // Handle enum declarations - Issue #601
        if (text == "enum") {
            int j = i + 1;
            // Skip optional enum name
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;
            if (j < end_idx && mod->is_identifier(tokens[j]->text)) {
                j++;
            }
            // Skip whitespace
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;
            // Expect '{'
            if (j < end_idx && tokens[j]->text == "{") {
                j++;
                int enum_line = tokens[i]->line;

                int end_line = sizeof(scope_end_stack) > 0 ? scope_end_stack[-1] : 999999;

                while (j < end_idx) {
                    // Skip whitespace
                    while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;
                    if (j >= end_idx) break;
                    if (tokens[j]->text == "}") break;

                    // Get enum value name
                    string enum_name = tokens[j]->text;
                    if (mod->is_identifier(enum_name)) {
                        if (!scope_map[enum_name]) {
                            scope_map[enum_name] = ({});
                        }
                        scope_map[enum_name] += ({
                            ([
                                "type": "int",
                                "scope_depth": scope_depth,
                                "decl_line": enum_line,
                                "end_line": end_line,
                                "is_enum": 1
                            ])
                        });
                    }
                    j++;
                    // Skip past = and value
                    while (j < end_idx && tokens[j]->text != "," && tokens[j]->text != "}") j++;
                    if (j < end_idx && tokens[j]->text == ",") j++;
                }
            }
            i = j;
            continue;
        }

        // Handle inheritance (inherit keyword) - Issue #601/#603
        // Track inherit for later use in type resolution
        if (text == "inherit") {
            // Find the inherited class name
            int j = i + 1;
            // Skip whitespace
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;
            // Get the class name
            if (j < end_idx) {
                string inherit_name = tokens[j]->text;
                // Remove quotes if it's a string literal
                if (sizeof(inherit_name) > 2 && inherit_name[0] == '"' && inherit_name[-1] == '"') {
                    inherit_name = inherit_name[1..sizeof(inherit_name)-2];
                }
                // Add to inherits stack for current scope
                if (sizeof(inherits_stack) > 0) {
                    inherits_stack[-1] += ({ inherit_name });
                }
            }
            // Skip to end of inherit statement
            while (j < end_idx && tokens[j]->text != ";") j++;
            i = j + 1;
            continue;
        }

        // Handle implicit/mixed types - Issue #601
        // Detect variable assignments without explicit type (e.g., x = 5;)
        // But NOT when preceded by a type keyword (e.g., "int x = 5" or "Color c = RED")
        // And only if the variable doesn't already exist in the scope
        if (mod->is_identifier(text) && !scope_map[text]) {
            // Check if this identifier is preceded by a type keyword or type name
            int prev_idx = i - 1;
            while (prev_idx >= 0 && sizeof(LSP.Compat.trim_whites(tokens[prev_idx]->text)) == 0) prev_idx--;
            int is_type_decl = 0;
            if (prev_idx >= 0) {
                string prev_text = tokens[prev_idx]->text;
                // Check if previous token is a type keyword
                if (mod->is_type_keyword(prev_text)) {
                    is_type_decl = 1;
                }
                // Check if previous token is a closing paren (likely a cast or type assertion)
                if (prev_text == ")") {
                    is_type_decl = 1;
                }
                // Check if previous token is an identifier (could be a type name like an enum)
                if (mod->is_identifier(prev_text)) {
                    is_type_decl = 1;
                }
            }

            // Skip if this is a typed declaration - let the existing handler process it
            if (is_type_decl) {
                // But if the existing type handler didn't process it (e.g., enum types),
                // we need to handle it ourselves
                // For now, just skip and let the normal flow handle it
                i++;
                continue;
            }

            int j = i + 1;
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;

            if (j < end_idx && tokens[j]->text == "=") {
                j++;
                while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;

                // For implicit/mixed types, always return "mixed" since Pike is dynamically typed
                // and we're not inferring the type from assignments
                string impl_type = "mixed";

                int end_line = sizeof(scope_end_stack) > 0 ? scope_end_stack[-1] : 999999;
                if (!scope_map[text]) {
                    scope_map[text] = ({});
                }
                scope_map[text] += ({
                    ([
                        "type": impl_type,
                        "scope_depth": scope_depth,
                        "decl_line": line,
                        "end_line": end_line,
                        "is_implicit": 1
                    ])
                });
                i = j + 1;
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

//! Look up a variable in inherited classes
//!
//! When a variable is not found in the current scope, this function searches
//! for it in classes that are inherited at the current scope level.
//! Issue #603: Multi-level inheritance scope resolution
protected array(mapping) get_inherited_variable(array tokens, mapping scope_map, string variable_name, int line) {
    array(mapping) result = ({});

    // First, collect all class definitions and their members from the tokens
    mapping(string:mapping) class_definitions = ([]);

    int i = 0;
    int end_idx = sizeof(tokens);
    string current_class = 0;
    int current_class_start = 0;
    int current_class_end = 999999;
    array(string) current_inherits = ({});

    while (i < end_idx) {
        mapping tok = tokens[i];
        string text = tok->text;
        int tok_line = tok->line;

        // Track class scope
        if (text == "class") {
            // Get class name
            int j = i + 1;
            // Skip the class keyword and get to the class name
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;
            if (j < end_idx && mod->is_identifier(tokens[j]->text)) {
                current_class = tokens[j]->text;
                current_class_start = tok_line;
                current_class_end = 999999;
                current_inherits = ({});
                // Initialize class definition immediately
                class_definitions[current_class] = ([
                    "start": current_class_start,
                    "end": current_class_end,
                    "inherits": current_inherits,
                    "members": ([])
                ]);
            }
        } else if (text == "{" && current_class) {
            int close_idx = mod->find_matching_brace(tokens, i, end_idx);
            if (close_idx >= 0) {
                current_class_end = tokens[close_idx]->line;
            }
        } else if (text == "}") {
            // End of class - save class definition (preserve existing members!)
            if (current_class) {
                class_definitions[current_class]["end"] = current_class_end;
                class_definitions[current_class]["inherits"] = current_inherits;
                // Don't overwrite members - they're already populated
            }
            current_class = 0;
            current_class_end = 999999;
        } else if (text == "inherit" && current_class) {
            // Track inherit inside a class
            int j = i + 1;
            while (j < end_idx && sizeof(LSP.Compat.trim_whites(tokens[j]->text)) == 0) j++;
            if (j < end_idx) {
                string inherit_name = tokens[j]->text;
                if (sizeof(inherit_name) > 2 && inherit_name[0] == '"' && inherit_name[-1] == '"') {
                    inherit_name = inherit_name[1..sizeof(inherit_name)-2];
                }
                current_inherits += ({ inherit_name });
            }
        }

        // Track member variables in current class
        if (current_class && tok_line >= current_class_start && tok_line <= current_class_end) {
            if (mod->is_type_keyword(text)) {
                mapping decl_info = mod->try_parse_declaration(tokens, i, end_idx);
                if (decl_info && decl_info->is_declaration && decl_info->name) {
                    // Add to class members
                    if (!class_definitions[current_class]["members"][decl_info->name]) {
                        class_definitions[current_class]["members"][decl_info->name] = ({});
                    }
                    class_definitions[current_class]["members"][decl_info->name] += ({
                        ([
                            "type": decl_info->type || text,
                            "decl_line": tok_line
                        ])
                    });
                    i = decl_info->end_idx;
                    continue;
                }
            }
        }

        i++;
    }

    // Now find which class contains the given line and check its inherits
    foreach (class_definitions; string class_name; mapping class_info) {
        if (line >= class_info->start && line <= class_info->end) {
            // werror("DEBUG: Found class %s containing line %d\n", class_name, line);
            // We're inside this class - search through inherits
            // Last inherit wins (shadowing)
            for (int j = sizeof(class_info->inherits) - 1; j >= 0; j--) {
                string inherit_name = class_info->inherits[j];
                // Look up the inherited class
                if (class_definitions[inherit_name]) {
                    mapping inherit_info = class_definitions[inherit_name];
                    if (inherit_info->members[variable_name]) {
                        // Found it - add to result
                        array(mapping) members = inherit_info->members[variable_name];
                        foreach (members, mapping member) {
                            result += ({
                                ([
                                    "type": member->type,
                                    "scope_depth": 0,  // Inherited, treat as class-level
                                    "decl_line": member->decl_line,
                                    "end_line": inherit_info->end,
                                    "inherited_from": inherit_name,
                                    "is_inherited": 1
                                ])
                            });
                        }
                        // Return on first match (last inherited class shadows earlier ones)
                        // But we need to collect all and sort
                        if (sizeof(result) > 0) {
                            break;
                        }
                    }
                }
            }
        }
    }

    // Sort by decl_line (earlier first)
    if (sizeof(result) > 0) {
        sort(result->decl_line, result);
    }

    return result;
}
