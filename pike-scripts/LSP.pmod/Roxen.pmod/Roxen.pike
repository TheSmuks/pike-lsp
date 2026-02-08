//! Roxen.pike - Roxen module analysis for LSP
//! Per ADR-001: Uses Parser.Pike.split() for all code parsing
//! Per ADR-002: Uses String.trim_all_whites() for whitespace handling

constant MAX_PARSER_ITERATIONS = 5000;

constant ROXEN_MODULE_TYPES = ({
    "MODULE_LOCATION", "MODULE_TAG", "MODULE_FILTER", "MODULE_PARSER",
    "MODULE_FILE_EXTENSION", "MODULE_DIRECTORIES", "MODULE_URL",
    "MODULE_PROXY", "MODULE_AUTH", "MODULE_LAST",
});

constant REQUIRED_CALLBACKS = ([
    "MODULE_LOCATION": ({ "find_file" }),
    "MODULE_TAG": ({ }),
    "MODULE_FILTER": ({ "filter" }),
]);

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

//! Convert byte offset to line/column position
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

protected int has_fast_path_markers(string code) {
    if (has_value(code, "inherit \"module\"")) return 1;
    if (has_value(code, "inherit 'module'")) return 1;
    if (has_value(code, "inherit \"filesystem\"")) return 1;
    if (has_value(code, "inherit 'filesystem'")) return 1;
    if (has_value(code, "#include <module.h>")) return 1;
    if (has_value(code, "constant module_type = MODULE_")) return 1;
    // Removed: simpletag_, container_, defvar( - these don't indicate Roxen module alone
    return 0;
}

mapping detect_module(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array(string) module_types = ({});
    array(string) inherits = ({});
    string module_name = "";
    int is_roxen = 0;

    if (has_fast_path_markers(code)) {
        [module_types, inherits, module_name] = detect_module_types(code, filename);
        is_roxen = sizeof(module_types) > 0 || sizeof(inherits) > 0;
    }

    array(mapping) tags = parse_tag_definitions(code, filename);
    array(mapping) variables = parse_defvar_calls(code, filename);
    mapping(string:int) callbacks = detect_lifecycle_callbacks(code);

    return ([
        "result": ([
            "is_roxen_module": is_roxen ? 1 : 0,
            "module_type": module_types,
            "inherits": inherits,
            "module_name": module_name,
            "tags": tags,
            "variables": variables,
            "lifecycle": ([
                "callbacks": indices(callbacks),
                "has_create": callbacks->create || 0,
                "has_start": callbacks->start || 0,
                "has_stop": callbacks->stop || 0,
                "has_status": callbacks->status || 0,
            ]),
        ])
    ]);
}

//! Detect module types (MODULE_*), inherits, and module name
//! Per ADR-001: Uses Parser.Pike.split() instead of Tools.AutoDoc.PikeParser
//! @param code Source code to parse
//! @param filename Filename for error reporting
//! @returns Array with: ({module_types, inherits, module_name})
protected array(array(string)|string) detect_module_types(string code, string filename) {
    array(string) types = ({});
    array(string) inherits = ({});
    string module_name = "";
    array(mixed) tokens = Parser.Pike.split(code);

    // Look for: constant module_type = MODULE_* | MODULE_* | ...
    for (int i = 0; i < sizeof(tokens) - 4; i++) {
        if (stringp(tokens[i]) && tokens[i] == "constant") {
            // Skip whitespace
            int j = i + 1;
            while (j < sizeof(tokens) && stringp(tokens[j]) && (tokens[j] == " " || tokens[j] == "\n")) {
                j++;
            }

            if (j >= sizeof(tokens)) continue;

            // Check if this is "module_type"
            if (stringp(tokens[j]) && tokens[j] == "module_type") {
                // Skip to "="
                int k = j + 1;
                while (k < sizeof(tokens) && stringp(tokens[k]) && tokens[k] != "=") {
                    k++;
                }

                if (k >= sizeof(tokens)) continue;

                // After "=" scan ALL tokens until ";", collecting every MODULE_* token
                int m = k + 1;
                while (m < sizeof(tokens)) {
                    // Skip whitespace
                    while (m < sizeof(tokens) && stringp(tokens[m]) && (tokens[m] == " " || tokens[m] == "\n")) {
                        m++;
                    }

                    if (m >= sizeof(tokens)) break;

                    mixed token = tokens[m];

                    // Stop at semicolon or closing brace
                    if (stringp(token) && (token == ";" || token == "}")) {
                        break;
                    }

                    // Skip pipe operator
                    if (stringp(token) && token == "|") {
                        m++;
                        continue;
                    }

                    // Collect MODULE_* constants
                    if (stringp(token) && has_prefix(token, "MODULE_")) {
                        if (!has_value(types, token)) {
                            types += ({token});
                        }
                    }

                    m++;
                }
            }

            // Also extract module_name = "..."
            if (stringp(tokens[j]) && tokens[j] == "module_name") {
                int k = j + 1;
                while (k < sizeof(tokens) && stringp(tokens[k]) && tokens[k] != "=") {
                    k++;
                }

                if (k < sizeof(tokens) - 1) {
                    int m = k + 1;
                    while (m < sizeof(tokens) && stringp(tokens[m]) && (tokens[m] == " " || tokens[m] == "\n")) {
                        m++;
                    }

                    if (m < sizeof(tokens) && stringp(tokens[m])) {
                        string token = tokens[m];
                        if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                            module_name = token[1..sizeof(token)-2];
                        }
                    }
                }
            }
        }
    }

    // Look for inherit statements
    for (int i = 0; i < sizeof(tokens) - 2; i++) {
        if (stringp(tokens[i]) && tokens[i] == "inherit") {
            // Skip whitespace
            int j = i + 1;
            while (j < sizeof(tokens) && stringp(tokens[j]) && (tokens[j] == " " || tokens[j] == "\n")) {
                j++;
            }

            if (j >= sizeof(tokens)) continue;

            // Get the inherit target
            if (stringp(tokens[j])) {
                string inherit_target = tokens[j];
                // Strip quotes
                if (sizeof(inherit_target) >= 2) {
                    if (inherit_target[0] == '"' || inherit_target[0] == '\'') {
                        inherit_target = inherit_target[1..sizeof(inherit_target)-2];
                    }
                }

                // Track all inherits
                if (!has_value(inherits, inherit_target)) {
                    inherits += ({inherit_target});
                }

                // Bug fix: ONLY "filesystem" adds MODULE_LOCATION, not "module"
                if (inherit_target == "filesystem") {
                    if (!has_value(types, "MODULE_LOCATION")) {
                        types += ({"MODULE_LOCATION"});
                    }
                }
            }
        }
    }

    // Look for register_module() call to extract module name
    // Pattern: register_module(MODULE_TYPE, LOCALE(N, "Module Name"), ...)
    for (int i = 0; i < sizeof(tokens) - 5; i++) {
        if (stringp(tokens[i]) && tokens[i] == "register_module") {
            int j = i + 1;
            while (j < sizeof(tokens) && stringp(tokens[j]) && (tokens[j] == " " || tokens[j] == "\n")) {
                j++;
            }

            if (j < sizeof(tokens) && stringp(tokens[j]) && tokens[j] == "(") {
                // Skip to second argument (after MODULE_TYPE and comma)
                int k = j + 1;
                int comma_count = 0;
                while (k < sizeof(tokens) && comma_count < 2) {
                    if (stringp(tokens[k]) && tokens[k] == ",") {
                        comma_count++;
                    }
                    k++;
                }

                // Now at second argument - look for string or LOCALE call
                while (k < sizeof(tokens) && stringp(tokens[k]) && (tokens[k] == " " || tokens[k] == "\n")) {
                    k++;
                }

                if (k < sizeof(tokens) && stringp(tokens[k])) {
                    string token = tokens[k];
                    if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                        if (!sizeof(module_name)) {
                            module_name = token[1..sizeof(token)-2];
                        }
                    } else if (token == "LOCALE") {
                        // Skip to the string argument in LOCALE(N, "name")
                        while (k < sizeof(tokens) && stringp(tokens[k]) && tokens[k] != ")") {
                            k++;
                            if (k < sizeof(tokens) && stringp(tokens[k])) {
                                string t = tokens[k];
                                if (sizeof(t) >= 2 && (t[0] == '"' || t[0] == '\'')) {
                                    if (!sizeof(module_name)) {
                                        module_name = t[1..sizeof(t)-2];
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Fallback detection based on function patterns
    if (!sizeof(types)) {
        if (has_simpletag_functions(code)) types += ({"MODULE_TAG"});
        if (has_find_file(code)) types += ({"MODULE_LOCATION"});
    }

    return ({types, inherits, module_name});
}

mapping parse_tags(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array(mapping) tags = parse_tag_definitions(code, filename);

    return ([
        "result": (["tags": tags])
    ]);
}

//! Parse tag definitions (simpletag_*, container_*, and RXML.Tag classes)
//! Per ADR-001: Uses Parser.Pike.split() instead of Tools.AutoDoc.PikeParser
//! @param code Source code to parse
//! @param filename Filename for error reporting
//! @returns Array of tag mappings
protected array(mapping) parse_tag_definitions(string code, string filename) {
    array(mapping) tags = ({});
    array(mixed) tokens = Parser.Pike.split(code);

    // Look for: return_type function_name(
    // where return_type is string|void|mapping
    // and function_name starts with simpletag_ or container_
    for (int i = 0; i < sizeof(tokens) - 3; i++) {
        mixed token = tokens[i];

        // Check if this is a return type
        if (stringp(token) && (token == "string" || token == "void" || token == "mapping")) {
            // Skip whitespace to find function name
            int j = i + 1;
            while (j < sizeof(tokens) && stringp(tokens[j]) && (tokens[j] == " " || tokens[j] == "\n")) {
                j++;
            }

            if (j >= sizeof(tokens)) continue;

            // Now at function name
            mixed func_name = tokens[j];

            if (stringp(func_name)) {
                if (has_prefix(func_name, "simpletag_")) {
                    string tag_name = func_name[10..];
                    // Find actual position in source code
                    mapping position = find_token_position(code, func_name) || (["line": 1, "column": 1]);
                    array args = ({});
                    tags += ({(["name": tag_name, "type": "simple", "position": position, "args": args])});
                }
                else if (has_prefix(func_name, "container_")) {
                    string tag_name = func_name[10..];
                    // Find actual position in source code
                    mapping position = find_token_position(code, func_name) || (["line": 1, "column": 1]);
                    array args = ({});
                    tags += ({(["name": tag_name, "type": "container", "position": position, "args": args])});
                }
            }
        }
    }

    // Look for RXML.Tag class definitions
    // Pattern: class TagFoo { inherit RXML.Tag; constant name = "foo"; }
    for (int i = 0; i < sizeof(tokens) - 5; i++) {
        if (stringp(tokens[i]) && tokens[i] == "class") {
            // Skip whitespace
            int j = i + 1;
            while (j < sizeof(tokens) && stringp(tokens[j]) && (tokens[j] == " " || tokens[j] == "\n")) {
                j++;
            }

            if (j >= sizeof(tokens)) continue;

            // Get class name (should start with "Tag")
            if (stringp(tokens[j]) && has_prefix(tokens[j], "Tag")) {
                string class_name = tokens[j];

                // Look for inherit RXML.Tag within class body
                int k = j + 1;
                int has_rxml_tag_inherit = 0;
                int brace_depth = 0;
                string tag_name = "";
                int has_frame = 0;
                int flag_empty = 0;

                while (k < sizeof(tokens)) {
                    mixed token = tokens[k];

                    if (stringp(token)) {
                        if (token == "{") brace_depth++;
                        else if (token == "}") {
                            brace_depth--;
                            if (brace_depth == 0) break;  // End of class
                        }
                        else if (token == "inherit" && brace_depth == 1) {
                            // Check if inheriting RXML.Tag
                            int l = k + 1;
                            while (l < sizeof(tokens) && stringp(tokens[l]) && (tokens[l] == " " || tokens[l] == "\n")) {
                                l++;
                            }
                            if (l < sizeof(tokens) && stringp(tokens[l]) && tokens[l] == "RXML.Tag") {
                                has_rxml_tag_inherit = 1;
                            }
                            // Also check for "RXML.Tag" in one token
                            else if (l < sizeof(tokens) && stringp(tokens[l]) && has_prefix(tokens[l], "RXML")) {
                                has_rxml_tag_inherit = 1;
                            }
                        }
                        else if (token == "constant" && brace_depth == 1) {
                            // Look for constant name = "tagname"
                            int l = k + 1;
                            while (l < sizeof(tokens) && stringp(tokens[l]) && (tokens[l] == " " || tokens[l] == "\n")) {
                                l++;
                            }
                            if (l < sizeof(tokens) && stringp(tokens[l]) && tokens[l] == "name") {
                                int m = l + 1;
                                while (m < sizeof(tokens) && stringp(tokens[m]) && tokens[m] != "=") {
                                    m++;
                                }
                                if (m < sizeof(tokens) - 1) {
                                    m++;
                                    while (m < sizeof(tokens) && stringp(tokens[m]) && (tokens[m] == " " || tokens[m] == "\n")) {
                                        m++;
                                    }
                                    if (m < sizeof(tokens) && stringp(tokens[m])) {
                                        string t = tokens[m];
                                        if (sizeof(t) >= 2 && (t[0] == '"' || t[0] == '\'')) {
                                            tag_name = t[1..sizeof(t)-2];
                                        }
                                    }
                                }
                            }
                            // Look for FLAG_EMPTY_ELEMENT
                            if (l < sizeof(tokens) && stringp(tokens[l]) && tokens[l] == "flags") {
                                int m = l + 1;
                                while (m < sizeof(tokens) && stringp(tokens[m]) && tokens[m] != "=") {
                                    m++;
                                }
                                if (m < sizeof(tokens) - 1) {
                                    m++;
                                    while (m < sizeof(tokens) && stringp(tokens[m]) && (tokens[m] == " " || tokens[m] == "\n")) {
                                        m++;
                                    }
                                    if (m < sizeof(tokens) && stringp(tokens[m]) && tokens[m] == "FLAG_EMPTY_ELEMENT") {
                                        flag_empty = 1;
                                    }
                                }
                            }
                        }
                        else if (token == "class" && brace_depth == 1) {
                            // Look for Frame subclass (indicates container tag)
                            int l = k + 1;
                            while (l < sizeof(tokens) && stringp(tokens[l]) && (tokens[l] == " " || tokens[l] == "\n")) {
                                l++;
                            }
                            if (l < sizeof(tokens) && stringp(tokens[l]) && tokens[l] == "Frame") {
                                has_frame = 1;
                            }
                        }
                    }

                    k++;
                }

                // If this is an RXML.Tag class, add it to tags
                if (has_rxml_tag_inherit && sizeof(tag_name) > 0) {
                    string tag_type = flag_empty ? "simple" : (has_frame ? "container" : "simple");
                    // Find class position
                    mapping position = find_token_position(code, "class " + class_name) || (["line": 1, "column": 1]);
                    tags += ({(["name": tag_name, "type": tag_type, "position": position, "args": ({})])});
                }
            }
        }
    }

    return tags;
}

mapping parse_vars(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array(mapping) vars = parse_defvar_calls(code, filename);

    return ([
        "result": (["variables": vars])
    ]);
}

//! Parse defvar() calls using Parser.Pike.split()
//! Per ADR-001: Uses Parser.Pike.split() instead of Tools.AutoDoc.PikeParser
//! @param code Source code to parse
//! @param filename Filename for error reporting
//! @returns Array of variable mappings from defvar calls
protected array(mapping) parse_defvar_calls(string code, string filename) {
    array(mapping) vars = ({});
    array(mixed) tokens = Parser.Pike.split(code);

    // Look for: defvar("name", default, "Label", TYPE_*, "Doc")
    for (int i = 0; i < sizeof(tokens) - 5; i++) {
        if (stringp(tokens[i]) && tokens[i] == "defvar") {
            // Next should be "("
            int j = i + 1;
            while (j < sizeof(tokens) && stringp(tokens[j]) && (tokens[j] == " " || tokens[j] == "\n")) {
                j++;
            }

            if (j >= sizeof(tokens) || !stringp(tokens[j]) || tokens[j] != "(") continue;

            // Extract arguments
            string var_name = "";
            string name_string = "";
            string var_type = "";
            string doc_str = "";
            int defvar_start = i;

            // Parse two possible defvar signatures:
            // 1. defvar("name", default, "name_string", TYPE_*, "doc_str")
            // 2. defvar("name", "name_string", TYPE_*, "doc_str")  [no default]
            int pos = j + 1;

            // Skip whitespace after "("
            while (pos < sizeof(tokens) && stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n")) {
                pos++;
            }

            // First arg: variable name (string literal)
            if (pos < sizeof(tokens) && stringp(tokens[pos])) {
                string token = tokens[pos];
                if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                    var_name = token[1..sizeof(token)-2];
                }
            }

            // Skip comma after name
            pos++;
            while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                pos++;
            }
            if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;

            // Skip whitespace
            while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                pos++;
            }

            // Determine signature by looking at third argument position
            // Save current position to check signature type
            int second_arg_start = pos;

            // Skip second argument (could be default value or name_string)
            while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != "," && tokens[pos] != ")") {
                pos++;
            }

            // Check if we're at signature 1 or 2 by looking ahead
            int signature_type = 1;  // Default to signature 1
            if (pos < sizeof(tokens) && tokens[pos] == ",") {
                int peek_pos = pos + 1;
                // Skip whitespace after comma
                while (peek_pos < sizeof(tokens) && (stringp(tokens[peek_pos]) && (tokens[peek_pos] == " " || tokens[peek_pos] == "\n"))) {
                    peek_pos++;
                }
                // If next token is TYPE_*, it's signature 2 (no default value)
                if (peek_pos < sizeof(tokens) && stringp(tokens[peek_pos]) && has_prefix(tokens[peek_pos], "TYPE_")) {
                    signature_type = 2;
                }
            }

            // Reset position to parse based on signature type
            pos = second_arg_start;

            if (signature_type == 2) {
                // Signature 2: defvar("name", "name_string", TYPE_*, "doc_str")
                // Second arg is name_string
                if (pos < sizeof(tokens) && stringp(tokens[pos])) {
                    string token = tokens[pos];
                    if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                        name_string = token[1..sizeof(token)-2];
                    }
                }

                // Skip to third arg (TYPE_* constant)
                while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                    pos++;
                }
                if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;

                while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                    pos++;
                }

                // Collect TYPE_* constants (may have | combinations)
                if (pos < sizeof(tokens)) {
                    int type_start = pos;
                    while (pos < sizeof(tokens)) {
                        mixed t = tokens[pos];
                        if (stringp(t) && (t == "," || t == ")")) break;
                        if (stringp(t) && has_prefix(t, "TYPE_")) {
                            if (!sizeof(var_type)) {
                                var_type = t;
                            } else {
                                var_type += " | " + t;
                            }
                        }
                        pos++;
                    }
                }

                // Skip to fourth arg (doc string)
                while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                    pos++;
                }
                if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;

                while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                    pos++;
                }

                if (pos < sizeof(tokens) && stringp(tokens[pos])) {
                    string token = tokens[pos];
                    if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                        doc_str = token[1..sizeof(token)-2];
                    }
                }
            } else {
                // Signature 1: defvar("name", default, "name_string", TYPE_*, "doc_str")
                // Skip second arg (default value)
                while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                    pos++;
                }
                if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;

                // Third arg: name_string (string literal or LOCALE call)
                while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                    pos++;
                }

                if (pos < sizeof(tokens) && stringp(tokens[pos])) {
                    string token = tokens[pos];
                    if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                        name_string = token[1..sizeof(token)-2];
                    }
                    // Handle LOCALE(N, "text") pattern - extract the string
                    else if (token == "LOCALE") {
                        // Skip to opening paren
                        pos++;
                        while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != "(") {
                            pos++;
                        }
                        if (pos < sizeof(tokens) && tokens[pos] == "(") pos++;
                        // Skip first arg (locale index)
                        pos++;
                        while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                            pos++;
                        }
                        if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;
                        // Now at second arg - the string
                        while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                            pos++;
                        }
                        if (pos < sizeof(tokens) && stringp(tokens[pos])) {
                            string t = tokens[pos];
                            if (sizeof(t) >= 2 && (t[0] == '"' || t[0] == '\'')) {
                                name_string = t[1..sizeof(t)-2];
                            }
                        }
                    }
                }

                // Skip to fourth arg (TYPE_* constant)
                while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                    pos++;
                }
                if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;

                while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                    pos++;
                }

                // Collect TYPE_* constants (may have | combinations)
                if (pos < sizeof(tokens)) {
                    int type_start = pos;
                    while (pos < sizeof(tokens)) {
                        mixed t = tokens[pos];
                        if (stringp(t) && (t == "," || t == ")")) break;
                        if (stringp(t) && has_prefix(t, "TYPE_")) {
                            if (!sizeof(var_type)) {
                                var_type = t;
                            } else {
                                var_type += " | " + t;
                            }
                        }
                        pos++;
                    }
                }

                // Skip to fifth arg (doc string)
                while (pos < sizeof(tokens) && stringp(tokens[pos]) && tokens[pos] != ",") {
                    pos++;
                }
                if (pos < sizeof(tokens) && tokens[pos] == ",") pos++;

                while (pos < sizeof(tokens) && (stringp(tokens[pos]) && (tokens[pos] == " " || tokens[pos] == "\n"))) {
                    pos++;
                }

                if (pos < sizeof(tokens) && stringp(tokens[pos])) {
                    string token = tokens[pos];
                    if (sizeof(token) >= 2 && (token[0] == '"' || token[0] == '\'')) {
                        doc_str = token[1..sizeof(token)-2];
                    }
                }
            }

            if (sizeof(var_name) > 0) {
                // Find actual position of defvar in source code
                mapping position = find_token_position(code, "defvar", defvar_start) || (["line": 1, "column": 1]);
                vars += ({([
                    "name": var_name,
                    "type": var_type,
                    "name_string": name_string,
                    "doc_str": doc_str,
                    "position": position,
                ])});
            }
        }
    }

    return vars;
}

mapping get_callbacks(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    mapping(string:int) callbacks = detect_lifecycle_callbacks(code);
    array(string) callback_names = indices(callbacks);
    array(string) missing = ({});

    return ([
        "result": ([
            "lifecycle": ([
                "callbacks": callback_names,
                "has_create": callbacks->create || 0,
                "has_start": callbacks->start || 0,
                "has_stop": callbacks->stop || 0,
                "has_status": callbacks->status || 0,
                "missing_required": missing,
            ])
        ])
    ]);
}

protected mapping(string:int) detect_lifecycle_callbacks(string code) {
    mapping(string:int) found = ([]);
    array(string) tokens = Parser.Pike.split(code);

    // Helper to skip whitespace tokens
    int next_non_ws(int start) {
        while (start < sizeof(tokens) && sizeof(tokens[start]) == 1 && tokens[start] == " ") {
            start++;
        }
        return start;
    };

    for (int i = 0; i < sizeof(tokens) - 2; i++) {
        if (tokens[i] == "void" || tokens[i] == "int" || tokens[i] == "mapping" || tokens[i] == "string") {
            int j = next_non_ws(i + 1);
            if (j >= sizeof(tokens)) continue;
            string next = tokens[j];
            if (next == "create" || next == "start" || next == "stop" || next == "status") {
                int k = next_non_ws(j + 1);
                if (k < sizeof(tokens) && tokens[k] == "(") {
                    found[next] = 1;
                }
            }
        }
    }

    return found;
}

mapping validate_api(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array(mapping) diagnostics = ({});
    array result = detect_module_types(code, filename);
    array(string) module_types = result[0];

    foreach (module_types, string type) {
        array(string) required = REQUIRED_CALLBACKS[type] || ({});
        mapping(string:int) found = detect_lifecycle_callbacks(code);

        // Check for required callbacks
        foreach (required, string callback) {
            int callback_found = 0;

            // Check lifecycle callbacks
            if (callback == "create" || callback == "start" || callback == "stop" || callback == "status") {
                callback_found = found[callback] || 0;
            } else {
                // Check for other callbacks like find_file, filter using pattern matching
                callback_found = has_callback_function(code, callback);
            }

            if (!callback_found) {
                diagnostics += ({
                    ([
                        "severity": "error",
                        "message": sprintf("Module type %s requires %s() callback", type, callback),
                        "line": 1,
                        "column": 1,
                    ])
                });
            }
        }
    }

    return ([
        "result": (["diagnostics": diagnostics])
    ]);
}

//! Check if a specific callback function is defined in the code
//! @param code The source code to search
//! @param func_name The function name to look for
//! @returns 1 if the function is found, 0 otherwise
protected int has_callback_function(string code, string func_name) {
    array(string) tokens = Parser.Pike.split(code);

    // Helper to skip whitespace tokens
    int next_non_ws(int start) {
        while (start < sizeof(tokens) && sizeof(tokens[start]) == 1 && tokens[start] == " ") {
            start++;
        }
        return start;
    };

    for (int i = 0; i < sizeof(tokens) - 2; i++) {
        // Look for return type followed by function name followed by '('
        // e.g., "string find_file(" or "mapping filter("
        int j = next_non_ws(i);
        if (j >= sizeof(tokens) - 2) continue;

        string return_type = tokens[j];
        // Skip if this is not a potential return type
        if (return_type != "string" && return_type != "mapping" && return_type != "int" &&
            return_type != "void" && return_type != "array" && return_type != "mixed" &&
            return_type != "object" && return_type != "float") {
            continue;
        }

        int k = next_non_ws(j + 1);
        if (k >= sizeof(tokens) - 1) continue;

        string func = tokens[k];
        if (func == func_name) {
            int l = next_non_ws(k + 1);
            if (l < sizeof(tokens) && tokens[l] == "(") {
                return 1;
            }
        }
    }

    return 0;
}

protected int has_simpletag_functions(string code) {
    return has_value(code, "simpletag_");
}

protected int has_find_file(string code) {
    return has_value(code, "find_file");
}
