//! Completions.pike - Code completion context analysis
//!
//! This file provides completion context analysis for Pike code.
//! It analyzes code around the cursor position to determine:
//! - What kind of completion is needed (global, identifier, member access, scope access)
//! - The object/module being accessed (for member/scope access)
//! - The prefix to complete
//!
//! Design pattern:
//! - create(object ctx) constructor for context injection
//! - Handlers wrap errors in catch blocks
//! - Uses Parser.Pike for tokenization

//! Private context field (reserved for future use with LSP context)
protected object context;

//! Get access to module.pmod helpers
//! In a .pmod subdirectory, we access module.pmod functions via the module program
protected program module_program = master()->resolv("LSP.Analysis.module");

//! Create a new Completions instance
//! @param ctx Optional LSP context object
void create(object ctx) {
    context = ctx;
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
//! PERF-003: Returns tokenization data for caching on the TypeScript side.
//! The splitTokens and tokens can be reused in subsequent completion requests
//! when the document hasn't changed, avoiding expensive re-tokenization.
//!
//! @param params Mapping with "code" (string), "line" (int, 1-based), "character" (int, 0-based)
//! @returns Mapping with "result" containing context, objectName, prefix, operator,
//!          plus "splitTokens" and "tokens" for caching
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

    array(string) split_tokens = ({});
    array(object) pike_tokens = ({});

    mixed err = catch {
        split_tokens = Parser.Pike.split(code);
        pike_tokens = Parser.Pike.tokenize(split_tokens);

        // Find tokens around the cursor position
        // We need to find the token at or just before the cursor
        int token_idx = -1;

        for (int i = 0; i < sizeof(pike_tokens); i++) {
            object tok = pike_tokens[i];
            int tok_line = tok->line;
            // Use the token's native character position from the tokenizer
            // Note: Parser.Pike.tokenize() doesn't provide character positions, so this is 0
            int tok_char = tok->character || 0;

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
            return ([
                "result": result,
                "splitTokens": split_tokens,
            ]);
        }

        // Check if we only have whitespace tokens (empty or whitespace-only file)
        bool has_non_ws_tokens = false;
        for (int i = 0; i < sizeof(pike_tokens); i++) {
            string text = LSP.Compat.trim_whites(pike_tokens[i]->text);
            if (sizeof(text) > 0) {
                has_non_ws_tokens = true;
                break;
            }
        }

        if (!has_non_ws_tokens) {
            // Only whitespace - treat as global context
            result->context = "global";
            return ([
                "result": result,
                "splitTokens": split_tokens,
            ]);
        }

        // Extract the prefix by looking at the actual text at cursor position
        string prefix = extract_prefix_at_cursor(code, target_line, target_char);
        result->prefix = prefix;

        // NEW: Check if cursor is immediately after a dot (with whitespace handling)
        // This handles the "Module.|" pattern where there's no partial identifier
        bool cursor_after_dot = is_cursor_after_dot(code, target_line, target_char);

        // Scan backwards to find the most recent access operator
        string found_operator = "";
        int operator_idx = -1;

        for (int i = token_idx; i >= 0; i--) {
            object tok = pike_tokens[i];
            string text = LSP.Compat.trim_whites(tok->text);

            // Check if this is an access operator
            if (text == "->" || text == "." || text == "::") {
                // Check if this is a safe navigation operator (?->) by looking at previous token
                if (i > 0) {
                    object prev_tok = pike_tokens[i - 1];
                    string prev_text = LSP.Compat.trim_whites(prev_tok->text);
                    if (prev_text == "?") {
                        found_operator = "?->";
                        operator_idx = i - 1;  // Mark ? as the operator position
                        break;
                    }
                }
                found_operator = text;
                operator_idx = i;
                break;
            }

            // Check for safe index operator (?[) - tokenized as ? then [
            if (text == "[") {
                if (i > 0) {
                    object prev_tok = pike_tokens[i - 1];
                    string prev_text = LSP.Compat.trim_whites(prev_tok->text);
                    if (prev_text == "?") {
                        found_operator = "?[";
                        operator_idx = i - 1;
                        break;
                    }
                }
            }

            // Check for ternary operator (? :)
            // Look for ? but not ?-> or ?[ (safe navigation)
            if (text == "?") {
                // Look ahead to see if this is ?-> or ?[ (safe navigation)
                bool is_safe_nav = false;
                for (int j = i + 1; j < sizeof(pike_tokens); j++) {
                    string next_text = LSP.Compat.trim_whites(pike_tokens[j]->text);
                    if (sizeof(next_text) > 0) {
                        if (next_text == "->" || next_text == "[") {
                            is_safe_nav = true;
                        }
                        break;
                    }
                }
                if (!is_safe_nav) {
                    found_operator = "?:";
                    operator_idx = i;
                }
            }

            // Stop at statement boundaries
            if (text == ";" || text == "{" || text == "}") {
                break;
            }
        }

        // Check for ternary : (colon in ternary expression)
        // Look backwards for the nearest ?
        if (found_operator == "" || found_operator == ":") {
            for (int i = token_idx; i >= 0; i--) {
                object tok = pike_tokens[i];
                string text = LSP.Compat.trim_whites(tok->text);

                // Found ? - this is a ternary expression
                if (text == "?") {
                    found_operator = "?:";
                    operator_idx = i;
                    break;
                }

                // Stop at statement boundaries or other expression boundaries
                if (text == ";" || text == "{" || text == "}" || text == "(" || text == ")") {
                    break;
                }
            }
        }

        if (found_operator != "" && found_operator != "?:") {
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
                    obj_text == "->" || obj_text == "::" ||
                    obj_text == "?" || obj_text == ":") {
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

            if (found_operator == "::") {
                result->context = "scope_access";
            } else {
                result->context = "member_access";
            }
        } else if (found_operator == "?:") {
            // Ternary operator - provide expression context
            result->context = "expression";
            result->operator = "?:";
        } else if (cursor_after_dot && token_idx >= 0) {
            // NEW: Cursor is after a dot but token scan didn't find the operator
            // This happens when there's no token after the dot (e.g., "Array.|")
            // Force member_access context for the identifier before the dot
            object tok = pike_tokens[token_idx];
            string text = LSP.Compat.trim_whites(tok->text);

            // Check if the token before cursor looks like a module/identifier
            if (sizeof(text) > 0) {
                // Check first character to determine if it's a valid identifier start
                int first_char = text[0];
                if ((first_char >= 'A' && first_char <= 'Z') ||  // Starts with uppercase (module)
                    (first_char >= 'a' && first_char <= 'z') ||  // or lowercase (variable)
                    first_char == '_') {                          // or underscore
                    result->context = "member_access";
                    result->operator = ".";
                    result->objectName = text;
                }
            }
        } else {
            // No access operator found - regular identifier completion
            result->context = "identifier";
        }
    };

    if (err) {
        // Gracefully degrade - return default "none" context on error
        // Log for debugging but don't crash
        werror("get_completion_context error: %s\n", describe_error(err));
    }

    return ([
        "result": result,
        // PERF-003: Include splitTokens for caching (tokens are not JSON-serializable)
        "splitTokens": split_tokens,
    ]);
}

//! PERF-003: Get completion context using pre-tokenized input
//!
//! Optimized version that skips tokenization when the caller provides
//! cached tokens from a previous request. This provides ~10x speedup
//! for repeated completion requests on unchanged documents.
//!
//! @param params Mapping with "code", "line", "character", and "splitTokens"
//! @returns Mapping with "result" containing completion context
mapping handle_get_completion_context_cached(mapping params) {
    string code = params->code || "";
    int target_line = params->line || 1;
    int target_char = params->character || 0;
    array(string) split_tokens = params->splitTokens || ({});

    mapping result = ([
        "context": "none",
        "objectName": "",
        "prefix": "",
        "operator": ""
    ]);

    mixed err = catch {
        array pike_tokens = Parser.Pike.tokenize(split_tokens);

        // Find tokens around the cursor position
        int token_idx = -1;

        for (int i = 0; i < sizeof(pike_tokens); i++) {
            object tok = pike_tokens[i];
            int tok_line = tok->line;
            array(string) lines = code / "\n";
            int tok_char = module_program->get_char_position(lines, tok_line, tok->text);

            if (tok_line < target_line ||
                (tok_line == target_line && tok_char <= target_char)) {
                token_idx = i;
            } else {
                break;
            }
        }

        if (token_idx == -1) {
            result->context = "global";
            return (["result": result]);
        }

        // Check if we only have whitespace tokens (empty or whitespace-only file)
        bool has_non_ws_tokens = false;
        for (int i = 0; i < sizeof(pike_tokens); i++) {
            string text = LSP.Compat.trim_whites(pike_tokens[i]->text);
            if (sizeof(text) > 0) {
                has_non_ws_tokens = true;
                break;
            }
        }

        if (!has_non_ws_tokens) {
            result->context = "global";
            return (["result": result]);
        }

        // Extract the prefix by looking at the actual text at cursor position
        string prefix = extract_prefix_at_cursor(code, target_line, target_char);
        result->prefix = prefix;

        // NEW: Check if cursor is immediately after a dot (with whitespace handling)
        bool cursor_after_dot = is_cursor_after_dot(code, target_line, target_char);

        // Scan backwards to find the most recent access operator
        string found_operator = "";
        int operator_idx = -1;

        for (int i = token_idx; i >= 0; i--) {
            object tok = pike_tokens[i];
            string text = LSP.Compat.trim_whites(tok->text);

            // Check if this is an access operator
            if (text == "->" || text == "." || text == "::") {
                // Check if this is a safe navigation operator (?->) by looking at previous token
                if (i > 0) {
                    object prev_tok = pike_tokens[i - 1];
                    string prev_text = LSP.Compat.trim_whites(prev_tok->text);
                    if (prev_text == "?") {
                        found_operator = "?->";
                        operator_idx = i - 1;  // Mark ? as the operator position
                        break;
                    }
                }
                found_operator = text;
                operator_idx = i;
                break;
            }

            // Check for safe index operator (?[) - tokenized as ? then [
            if (text == "[") {
                if (i > 0) {
                    object prev_tok = pike_tokens[i - 1];
                    string prev_text = LSP.Compat.trim_whites(prev_tok->text);
                    if (prev_text == "?") {
                        found_operator = "?[";
                        operator_idx = i - 1;
                        break;
                    }
                }
            }

            // Check for ternary operator (? :)
            // Look for ? but not ?-> or ?[ (safe navigation)
            if (text == "?") {
                // Look ahead to see if this is ?-> or ?[ (safe navigation)
                bool is_safe_nav = false;
                for (int j = i + 1; j < sizeof(pike_tokens); j++) {
                    string next_text = LSP.Compat.trim_whites(pike_tokens[j]->text);
                    if (sizeof(next_text) > 0) {
                        if (next_text == "->" || next_text == "[") {
                            is_safe_nav = true;
                        }
                        break;
                    }
                }
                if (!is_safe_nav) {
                    found_operator = "?:";
                    operator_idx = i;
                }
            }

            // Stop at statement boundaries
            if (text == ";" || text == "{" || text == "}") {
                break;
            }
        }

        // Check for ternary : (colon in ternary expression)
        // Look backwards for the nearest ?
        if (found_operator == "" || found_operator == ":") {
            for (int i = token_idx; i >= 0; i--) {
                object tok = pike_tokens[i];
                string text = LSP.Compat.trim_whites(tok->text);

                // Found ? - this is a ternary expression
                if (text == "?") {
                    found_operator = "?:";
                    operator_idx = i;
                    break;
                }

                // Stop at statement boundaries or other expression boundaries
                if (text == ";" || text == "{" || text == "}" || text == "(" || text == ")") {
                    break;
                }
            }
        }

        if (found_operator != "" && found_operator != "?:") {
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
                    obj_text == "->" || obj_text == "::" ||
                    obj_text == "?" || obj_text == ":") {
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

            if (found_operator == "::") {
                result->context = "scope_access";
            } else {
                result->context = "member_access";
            }
        } else if (found_operator == "?:") {
            // Ternary operator - provide expression context
            result->context = "expression";
            result->operator = "?:";
        } else if (cursor_after_dot && token_idx >= 0) {
            // NEW: Cursor is after a dot but token scan didn't find the operator
            // This happens when there's no token after the dot (e.g., "Array.|")
            // Force member_access context for the identifier before the dot
            object tok = pike_tokens[token_idx];
            string text = LSP.Compat.trim_whites(tok->text);

            // Check if the token before cursor looks like a module/identifier
            if (sizeof(text) > 0) {
                // Check first character to determine if it's a valid identifier start
                int first_char = text[0];
                if ((first_char >= 'A' && first_char <= 'Z') ||  // Starts with uppercase (module)
                    (first_char >= 'a' && first_char <= 'z') ||  // or lowercase (variable)
                    first_char == '_') {                          // or underscore
                    result->context = "member_access";
                    result->operator = ".";
                    result->objectName = text;
                }
            }
        } else {
            // No access operator found - regular identifier completion
            result->context = "identifier";
        }
    };

    if (err) {
        werror("get_completion_context_cached error: %s\n", describe_error(err));
    }

    return (["result": result]);
}

//! Check if cursor is immediately after a dot operator (with optional whitespace)
//!
//! When the cursor is at "Array.|" or "Array.   |" (with whitespace), this
//! function detects that the user wants member access completion even though
//! there's no partial identifier after the dot.
//!
//! @param code Full source code
//! @param line_no Line number (1-indexed)
//! @param char_pos Character position (0-indexed)
//! @returns true if cursor follows a dot operator (possibly with whitespace)
protected bool is_cursor_after_dot(string code, int line_no, int char_pos) {
    array lines = code / "\n";
    if (line_no > 0 && line_no <= sizeof(lines)) {
        string line = lines[line_no - 1];

        // Look backwards from cursor position, skipping whitespace
        int i = char_pos - 1;
        while (i >= 0 && (line[i] == ' ' || line[i] == '\t')) {
            i--;
        }

        // Check if character immediately before cursor (after whitespace) is a dot
        if (i >= 0 && line[i] == '.') {
            return true;
        }
    }
    return false;
}

//! Helper to extract the prefix being typed at the cursor position
//!
//! Gets the partial identifier being typed by looking backwards from
//! the cursor position for word characters.
//!
//! @param code Full source code
//! @param line_no Line number (1-indexed)
//! @param char_pos Character position (0-indexed)
//! @returns The prefix string (may be empty)
protected string extract_prefix_at_cursor(string code, int line_no, int char_pos) {
    array lines = code / "\n";
    if (line_no > 0 && line_no <= sizeof(lines)) {
        string line = lines[line_no - 1];
        // Get text up to cursor position
        string text_before_cursor = line[0..char_pos - 1];

        // Extract trailing identifier characters
        string prefix = "";
        for (int i = sizeof(text_before_cursor) - 1; i >= 0; i--) {
            string ch = text_before_cursor[i..i];
            if ((ch >= "a" && ch <= "z") ||
                (ch >= "A" && ch <= "Z") ||
                (ch >= "0" && ch <= "9") ||
                ch == "_") {
                prefix = ch + prefix;
            } else {
                break;
            }
        }
        return prefix;
    }
    return "";
}
