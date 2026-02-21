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
