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
