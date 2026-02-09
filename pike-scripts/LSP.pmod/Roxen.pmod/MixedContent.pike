//! Mixed Content.pike - RXML string detection in Pike multiline strings
//! Per ADR-001: Uses Parser.Pike.split() for all code parsing
//! Per ADR-002: Uses String.trim_all_whites() for whitespace handling
//!
//! This module extracts RXML content from Pike multiline string literals
//! (#"..." and #'...') for Phase 4 of Roxen Framework Support

// ============================================================================
// POSITION UTILITIES
// ============================================================================

//! Build newline offset array for O(1) line/column lookup
//! @param code Source code
//! @returns Array of character offsets where each line starts
protected array(int) build_newline_offsets(string code) {
    array(int) offsets = ({0});
    int pos = 0;
    while ((pos = search(code, "\n", pos)) >= 0) {
        offsets += ({pos + 1});  // Next line starts after newline
        pos++;
    }
    return offsets;
}

//! Convert byte offset to line/column position (1-indexed)
//! @param offset Byte offset in code
//! @param offsets Newline offset array from build_newline_offsets()
//! @returns Mapping with "line" and "column" (1-indexed)
protected mapping(string:int) offset_to_position(int offset, array(int) offsets) {
    int line = 1;
    int column = offset + 1;

    // Binary search for the line
    int low = 0, high = sizeof(offsets) - 1;
    while (low <= high) {
        int mid = (low + high) / 2;
        if (offsets[mid] <= offset) {
            line = mid + 1;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (line > 1) {
        column = offset - offsets[line - 1] + 1;
    }

    return (["line": line, "column": column]);
}

//! Find position of a token in the original code string
//! @param code Source code
//! @param token_str Token string to search for
//! @param start_offset Starting offset (default: 0)
//! @returns Mapping with "line" and "column", or 0 if not found
protected mapping(string:int) find_token_position(string code, string token_str, int|void start_offset) {
    int offset = search(code, token_str, start_offset || 0);
    if (offset < 0) return 0;

    array(int) offsets = build_newline_offsets(code);
    return offset_to_position(offset, offsets);
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

//! Calculate confidence score for RXML content (0.0 to 1.0)
//! @param content String content to analyze
//! @returns Confidence score
protected float calculate_rxml_confidence(string content) {
    float confidence = 0.0;

    string lower = lower_case(content);

    // Strong indicators
    if (has_value(lower, "<roxen")) confidence += 0.4;
    if (has_value(lower, "<set ")) confidence += 0.2;
    if (has_value(lower, "<emit ")) confidence += 0.2;
    if (has_value(lower, "<if ") || has_value(lower, "<elseif ") || has_value(lower, "<else>")) {
        confidence += 0.15;
    }

    // RXML entities
    if (has_value(lower, "&roxen.") || has_value(lower, "&form.") ||
        has_value(lower, "&page.") || has_value(lower, "&client.")) {
        confidence += 0.2;
    }

    // Basic XML structure
    if (has_value(content, "<") && has_value(content, ">")) {
        confidence += 0.1;
    }

    return min(confidence, 1.0);
}

// ============================================================================
// MARKER DETECTION
// ============================================================================

//! Known RXML tags for marker detection
constant KNOWN_RXML_TAGS = ({
    "roxen", "set", "emit", "if", "elseif", "else", "then", "case",
    "switch", "default", "for", "foreach", "while", "output", "insert",
    "config", "header", "cache", "input", "date", "apre", "locale",
    "referrer", "user", "container", "contents", "sqlquery"
});

//! Detect RXML markers in content
//! @param content RXML string content
//! @param content_offsets Newline offsets for the content
//! @returns Array of marker mappings
protected array(mapping) detect_rxml_markers(string content, array(int)|void content_offsets) {
    array(mapping) markers = ({});

    if (!content_offsets) {
        content_offsets = build_newline_offsets(content);
    }

    // Detect tags: <tagname or </tagname
    // Simple regex-like scanning
    int pos = 0;
    while (pos < sizeof(content)) {
        int tag_start = search(content, "<", pos);
        if (tag_start < 0) break;

        int tag_end = search(content, ">", tag_start);
        if (tag_end < 0) break;

        // Extract tag content
        string tag_content = content[tag_start + 1..tag_end - 1];

        // Skip if not a valid tag (check for alphanumeric start)
        if (sizeof(tag_content) > 0 && tag_content[0] >= 'a' && tag_content[0] <= 'z') {
            // Extract tag name
            string tag_name = "";
            int i = 0;
            if (tag_content[0] == '/') {
                // Closing tag
                i++;
            }

            while (i < sizeof(tag_content) &&
                   ((tag_content[i] >= 'a' && tag_content[i] <= 'z') ||
                    (tag_content[i] >= '0' && tag_content[i] <= '9') ||
                    tag_content[i] == '_')) {
                tag_name += tag_content[i..i];
                i++;
            }

            if (sizeof(tag_name) > 0) {
                tag_name = lower_case(tag_name);
                if (has_value(KNOWN_RXML_TAGS, tag_name)) {
                    mapping tag_pos = offset_to_position(tag_start, content_offsets);
                    markers += ({
                        ([
                            "type": "tag",
                            "name": tag_name,
                            "line": tag_pos->line,
                            "column": tag_pos->column
                        ])
                    });
                }
            }
        }

        pos = tag_end + 1;
    }

    // Detect RXML entities: &prefix.name;
    pos = 0;
    while (pos < sizeof(content)) {
        int entity_start = search(content, "&", pos);
        if (entity_start < 0) break;

        int entity_end = search(content, ";", entity_start);
        if (entity_end < 0) {
            pos = entity_start + 1;
            continue;
        }

        string entity = content[entity_start + 1..entity_end - 1];

        // Check for known entity prefixes
        array(string) parts = entity / ".";
        if (sizeof(parts) >= 2) {
            string prefix = lower_case(parts[0]);
            if (has_value(({"roxen", "form", "page", "client", "cache", "config", "usr"}), prefix)) {
                mapping entity_pos = offset_to_position(entity_start, content_offsets);
                markers += ({
                    ([
                        "type": "entity",
                        "name": prefix,
                        "line": entity_pos->line,
                        "column": entity_pos->column
                    ])
                });
            }
        }

        pos = entity_end + 1;
    }

    return markers;
}

// ============================================================================
// MULTILINE STRING DETECTION
// ============================================================================

//! Detect multiline string literals using Parser.Pike.split()
//! @param code Pike source code
//! @returns Array of detected RXML string mappings
protected array(mapping) detect_multiline_strings(string code) {
    array(mapping) results = ({});
    array(mixed) tokens = Parser.Pike.split(code);

    array(int) newline_offsets = build_newline_offsets(code);

    // Track string literal state
    int in_multiline_string = 0;
    int string_start_offset = 0;
    int string_quote_offset = 0;
    string current_content = "";
    int string_quote_length = 0;  // 2 for #" or #', 1 for closing "

    for (int i = 0; i < sizeof(tokens); i++) {
        mixed token = tokens[i];

        if (stringp(token)) {
            if (!in_multiline_string) {
                // Check for multiline string start: #" or #'
                if (token == "#\"" || token == "#'") {
                    in_multiline_string = 1;
                    string_quote_offset = i;
                    string_quote_length = 2;
                    current_content = "";

                    // Find actual position in source code
                    string_start_offset = find_token_offset_for_token(code, token, string_quote_offset);
                }
            } else {
                // Check for closing quote
                if ((string_quote_length == 2 && token == "\"") ||
                    (string_quote_length == 2 && token == "'")) {
                    // End of multiline string
                    in_multiline_string = 0;

                    // Calculate confidence
                    float confidence = calculate_rxml_confidence(current_content);

                    // Only include strings with reasonable confidence
                    if (confidence >= 0.3 && sizeof(String.trim_all_whites(current_content)) > 0) {
                        // Calculate positions
                        mapping start_pos = offset_to_position(string_start_offset + string_quote_length, newline_offsets);

                        // Calculate end position (rough approximation)
                        int content_end_offset = string_start_offset + string_quote_length + sizeof(current_content);
                        mapping end_pos = offset_to_position(content_end_offset, newline_offsets);

                        // Full range including quotes
                        mapping quote_start_pos = offset_to_position(string_start_offset, newline_offsets);
                        mapping quote_end_pos = offset_to_position(content_end_offset + 1, newline_offsets);

                        // Detect markers
                        array(mapping) markers = detect_rxml_markers(current_content);

                        results += ({
                            ([
                                "content": current_content,
                                "start": start_pos,
                                "end": end_pos,
                                "quote_start": quote_start_pos,
                                "quote_end": quote_end_pos,
                                "confidence": confidence,
                                "markers": markers
                            ])
                        });
                    }

                    current_content = "";
                    string_quote_length = 0;
                } else {
                    // Accumulate content
                    current_content += token;
                }
            }
        }
    }

    return results;
}

//! Find the offset of a token in the original source code
//! This is a simplified version that searches for the token string
//! @param code Full source code
//! @param token_str Token string to find
//! @param token_index Index in token array (for disambiguation)
//! @returns Character offset of the token
protected int find_token_offset_for_token(string code, string token_str, int token_index) {
    // Simple search - in practice, you'd need more sophisticated tracking
    // to handle duplicate tokens correctly
    int offset = 0;
    int found_count = 0;

    while (found_count <= token_index) {
        int next_pos = search(code, token_str, offset);
        if (next_pos < 0) return offset;

        // Verify this is actually the token (not substring of larger token)
        if (next_pos == 0 || code[next_pos - 1] == ' ' || code[next_pos - 1] == '\n' ||
            code[next_pos - 1] == '\t' || code[next_pos - 1] == '(' ||
            code[next_pos - 1] == '=' || code[next_pos - 1] == ',') {

            found_count++;
            if (found_count > token_index) {
                return next_pos;
            }
        }

        offset = next_pos + sizeof(token_str);
    }

    return offset;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

//! Extract RXML strings from Pike multiline string literals
//! @param params JSON-RPC parameters with "code" and "filename"
//! @returns JSON-RPC response with "result" containing "strings" array
mixed roxen_extract_rxml_strings(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    // Use Parser.Pike.split() per ADR-001
    array(mixed) tokens = Parser.Pike.split(code);

    // Detect multiline string literals
    array(mapping) strings = detect_multiline_strings(code);

    return ([
        "result": ([
            "strings": strings
        ])
    ]);
}
