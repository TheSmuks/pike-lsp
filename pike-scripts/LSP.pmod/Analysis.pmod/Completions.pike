//! Completions.pike - Code completion context analysis class
//!
//! This class provides completion context analysis for Pike code.
//! It analyzes code around the cursor position to determine:
//! - What kind of completion is needed (global, identifier, member access, scope access)
//! - The object/module being accessed (for member/scope access)
//! - The prefix to complete
//!
//! Use: import LSP.Analysis; object c = Completions(context); c->handle_get_completion_context(...);

//! Completions class - Analyzes code at cursor position for completion context
class Completions {
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
}
