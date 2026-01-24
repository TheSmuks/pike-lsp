//! Variables.pike - Variable analysis and occurrences
//!
//! This file provides variable analysis for Pike code, specifically
//! finding all identifier occurrences in source code. It uses tokenization
//! to accurately identify variables while filtering out keywords and operators.
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

//! Create a new Variables instance
//! @param ctx Optional LSP context object
void create(object ctx) {
    context = ctx;
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

    // Get helper function from module.pmod
    function is_identifier_fn = module_program->is_identifier;

    mixed err = catch {
        array(string) split_tokens = Parser.Pike.split(code);
        array pike_tokens = Parser.Pike.tokenize(split_tokens);

        // Track occurrence count for each (line, token) pair to handle duplicates
        // Key format: "line:token_text" -> occurrence count
        mapping(string:int) occurrence_count = ([]);

        // Filter for identifier tokens and build position map
        foreach (pike_tokens, mixed t) {
            // Skip non-identifier tokens
            // t is a Parser.Pike.Token object with: text, line, file
            string text = t->text;
            int line = t->line;

            // Use is_identifier helper from module.pmod for validation
            if (is_identifier_fn(text)) {
                // Skip common Pike keywords
                int is_keyword = 0;
                if (has_value(keywords, text)) {
                    is_keyword = 1;
                }
                if (!is_keyword) {
                    // Calculate character position - find nth occurrence of this token on this line
                    string key = sprintf("%d:%s", line, text);
                    int nth = occurrence_count[key] || 0;
                    nth = nth + 1;  // This is the nth occurrence (1-indexed)
                    int char_pos = find_nth_occurrence(code, line, text, nth);
                    if (char_pos >= 0) {
                        occurrences += ({
                            ([
                                "text": text,
                                "line": line,
                                "character": char_pos
                            ])
                        });
                        occurrence_count[key] = nth;
                    }
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

//! Find the nth occurrence of a token in a line (1-indexed)
//!
//! @param code Full source code
//! @param line_no Line number (1-indexed)
//! @param token_text Token text to find
//! @param nth Which occurrence to find (1-based)
//! @returns Character position (0-indexed) or -1 if not found
protected int find_nth_occurrence(string code, int line_no, string token_text, int nth) {
    array lines = code / "\n";
    if (line_no > 0 && line_no <= sizeof(lines)) {
        string line = lines[line_no - 1];
        int pos = -1;
        int search_start = 0;
        int i;
        for(i = 1; i <= nth; i++) {
            int found_at = search(line[search_start..], token_text);
            if (found_at == -1) return -1;
            pos = search_start + found_at;
            search_start = pos + sizeof(token_text);
        }
        return pos;
    }
    return -1;
}
