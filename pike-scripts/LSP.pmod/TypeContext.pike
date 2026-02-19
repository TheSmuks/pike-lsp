//! TypeContext.pike - Flow-sensitive type inference
//!
//! This module provides type context tracking for flow-sensitive type inference.
//! It tracks variable types across conditional branches (if/else) and merges
//! type information at convergence points.
//!
//! This is a well-known algorithm used in compilers and language servers.

#pragma strict_types

//! Type context that tracks variable types across branches
class FlowTypeContext {
    //! Current type bindings: variable name -> type info
    private mapping(string:mapping) type_bindings = ([]);

    //! Stack of branch contexts for if/else tracking
    private array(mapping(string:mapping)) branch_stack = ({});

    //! Type information for a variable
    //! @param kind The Pike type (int, string, float, mixed, etc.)
    //! @param source Line/source of type assignment
    //! @param branch_id Which branch (0 = main, 1+ = conditional branches)
    mapping make_type(string kind, string|void source, int|void branch_id) {
        return ([
            "kind": kind,
            "source": source,
            "branch_id": branch_id || 0,
            "line": source ? (int)source : 0
        ]);
    }

    //! Get the current type for a variable
    //! @param name Variable name
    //! @returns Type mapping or zero if not found
    mapping get_type(string name) {
        return type_bindings[name];
    }

    //! Set the type for a variable in the current context
    //! @param name Variable name
    //! @param type Type mapping from make_type()
    void set_type(string name, mapping type) {
        type_bindings[name] = type;
    }

    //! Start a new branch (enter if/else block)
    //! @param branch_id Unique identifier for this branch
    void enter_branch(int branch_id) {
        // Copy current bindings for the new branch
        mapping branch_context = ([]);
        foreach (indices(type_bindings), string var) {
            branch_context[var] = type_bindings[var] + ([]);
        }
        branch_context["__branch_id"] = branch_id;
        branch_stack += ({branch_context});
    }

    //! Exit current branch and return to parent context
    //! @returns The exited branch context
    mapping exit_branch() {
        if (sizeof(branch_stack) == 0) {
            return ([]);
        }
        mapping branch = branch_stack[-1];
        branch_stack = branch_stack[..<1];
        return branch;
    }

    //! Merge types from a branch into the current context
    //! Called at convergence points (after if/else blocks)
    //! @param branch The branch context to merge
    void merge_branch(mapping branch) {
        // For each variable in the branch:
        // - If it exists in both, merge to union type
        // - If it only exists in branch, add it
        // - If it only exists in current, keep current
        foreach (indices(branch), string var) {
            if (var == "__branch_id") continue;

            mapping branch_type = branch[var];
            mapping current_type = type_bindings[var];

            if (!current_type) {
                // Variable only in branch - add to current
                type_bindings[var] = branch_type + ([]);
            } else if (branch_type) {
                // Variable in both - merge types
                string merged = merge_types(current_type->kind, branch_type->kind);
                type_bindings[var] = make_type(merged, "merged", 0);
            }
        }
    }

    //! Merge two types into a union type
    //! @param type1 First type
    //! @param type2 Second type
    //! @returns Merged type string
    string merge_types(string type1, string type2) {
        if (type1 == type2) {
            return type1;
        }
        // Return "mixed" for incompatible types
        if ((type1 == "int" && type2 == "string") ||
            (type1 == "string" && type2 == "int") ||
            (type1 == "float" && (type2 == "int" || type2 == "string")) ||
            (type1 == "int" && (type2 == "float" || type2 == "string")) ||
            (type1 == "string" && (type2 == "float" || type2 == "int"))) {
            return "mixed";
        }
        // For compatible types, prefer the more specific
        return "mixed";
    }

    //! Get all current bindings
    mapping get_all_bindings() {
        return type_bindings + ([]);
    }

    //! Check if we're in a branch
    int in_branch() {
        return sizeof(branch_stack) > 0;
    }

    //! Get the current branch depth
    int branch_depth() {
        return sizeof(branch_stack);
    }
}

//! Parse if/else condition to extract variable type hints
//! @param condition The condition string (e.g., "if (x != 0)")
//! @returns Array of variable names found in condition
array(string) extract_condition_variables(string condition) {
    array(string) vars = ({});

    // Use Parser.Pike to tokenize the condition
    array tokens = Parser.Pike.split(condition);

    // Look for identifiers that are not keywords
    multiset(string) keywords = (<
        "if", "else", "for", "while", "do", "switch", "case", "default",
        "return", "break", "continue", "throw", "catch",
        "int", "string", "float", "mixed", "void", "array", "mapping",
        "multiset", "object", "program", "function",
        "static", "private", "protected", "public", "final",
        "==", "!=", "<", ">", "<=", ">=",
        "+", "-", "*", "/", "%", "=", "+=", "-=", "*=", "/=",
        "&&", "||", "!", "&", "|", "^", "~", "<<", ">>",
        "(", ")", "{", "}", "[", "]", ",", ";", ":", "?"
    >);

    foreach (tokens, string tok) {
        string trimmed = String.trim_all_whites(tok);
        if (sizeof(trimmed) == 0) continue;
        if (keywords[trimmed]) continue;
        if (trimmed[0] >= '0' && trimmed[0] <= '9') continue;
        if (has_prefix(trimmed, "\"") || has_prefix(trimmed, "'")) continue;

        // Looks like a variable name
        if (search(vars, trimmed) == -1) {
            vars += ({trimmed});
        }
    }

    return vars;
}

//! Infer type from assignment expression
//! @param expr The expression being assigned
//! @returns Inferred type string
string infer_type_from_expression(string expr) {
    if (!expr || sizeof(expr) == 0) {
        return "mixed";
    }

    // Trim whitespace
    expr = String.trim_whites(expr);

    // Check for literal types
    if (sizeof(expr) > 0) {
        // String literal
        if ((expr[0] == '"' && expr[-1] == '"') ||
            (expr[0] == '\'' && expr[-1] == '\'')) {
            return "string";
        }

        // Integer literal
        if ((expr[0] >= '0' && expr[0] <= '9') ||
            (sizeof(expr) > 1 && expr[0] == '-' && expr[1] >= '0' && expr[1] <= '9')) {
            return "int";
        }

        // Float literal
        if (has_value(expr, ".")) {
            return "float";
        }

        // Array literal
        if (has_prefix(expr, "({") || has_prefix(expr, "arr")) {
            return "array";
        }

        // Mapping literal
        if (has_prefix(expr, "([") || has_prefix(expr, "map")) {
            return "mapping";
        }

        // New object
        if (has_prefix(expr, "new ")) {
            return "object";
        }
    }

    // Default to mixed for complex expressions
    return "mixed";
}
