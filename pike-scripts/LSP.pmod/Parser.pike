//! Parser.pike - Stateless parser class for Pike LSP
//!
//! Design per CONTEXT.md:
//! - Parser is a pure function: source text in, structured result out
//! - Parser has no cache interaction (cache belongs to handler layer)
//! - Parser methods throw exceptions on unexpected errors (caller catches)
//!
//! This file acts as a class - instantiate with Parser() from LSP.Parser

// Constants (MAINT-004: Configuration constants)
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

//! Create a new Parser instance
void create() {
    // No state to initialize
}

//! Parse Pike source code and extract symbols
//! @param params Mapping with "code", "filename", "line" keys
//! @returns Mapping with "result" containing "symbols" and "diagnostics"
//! @throws On unexpected parsing errors (caller catches)
mapping parse_request(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";
    int line = params->line || 1;

    array symbols = ({});
    array diagnostics = ({});

    // Check if this is a .pmod file (modules should have unreachable code detection)
    int is_pmod_file = has_suffix(filename, ".pmod");

    // Extract autodoc comments from original code before preprocessing
    // Maps line number -> documentation string
    // Use consolidated function from Intelligence.module
    program IntelligenceModule = master()->resolv("LSP.Intelligence.module");
    function extract_autodoc_comments = IntelligenceModule->extract_autodoc_comments;
    mapping(int:string) autodoc_by_line = extract_autodoc_comments(code);

    // STEP 1: Identify preprocessor conditional blocks for token-based extraction
    // This happens BEFORE preprocessing to preserve branch structure
    array(mapping) preprocessor_blocks = parse_preprocessor_blocks(code);

    // STEP 2: Preprocess code: remove preprocessor directives that confuse PikeParser
    // We need to track nesting to properly handle conditional blocks
    // NOTE: This remains UNCHANGED for backward compatibility - base parse is identical
    string preprocessed = "";
    int preprocessed_line = 0;
    int if_depth = 0;

    foreach(code / "\n", string src_line) {
        preprocessed_line++;
        string trimmed = LSP.Compat.trim_whites(src_line);

        // Handle conditional compilation - we can't evaluate these, so skip entire blocks
        if (has_prefix(trimmed, "#if")) {
            if_depth++;
            preprocessed += "\n";
        } else if (has_prefix(trimmed, "#else") || has_prefix(trimmed, "#elif")) {
            preprocessed += "\n";
        } else if (has_prefix(trimmed, "#endif")) {
            if_depth--;
            preprocessed += "\n";
        } else if (if_depth > 0) {
            preprocessed += "\n";
        } else if (has_prefix(trimmed, "#include")) {
            // Extract include path for navigation
            string include_path = "";
            string rest = trimmed[8..];
            rest = LSP.Compat.trim_whites(rest);

            if (sizeof(rest) > 1) {
                if (rest[0] == '"') {
                    int end = search(rest, "\"", 1);
                    if (end > 0) include_path = rest[1..end-1];
                } else if (rest[0] == '<') {
                    int end = search(rest, ">", 1);
                    if (end > 0) include_path = rest[1..end-1];
                }
            }

            if (sizeof(include_path) > 0) {
                symbols += ({
                    ([
                        "name": include_path,
                        "kind": "include", // #include directives have kind='include' to distinguish from imports
                        "modifiers": ({}),
                        "position": ([
                            "file": filename,
                            "line": preprocessed_line
                        ]),
                        "classname": include_path // Use classname to store the path for the resolver
                    ])
                });
            }
            preprocessed += "\n";
        } else if (has_prefix(trimmed, "#require")) {
            // Extract require directive using limited subset parsing
            string rest = trimmed[sizeof("#require")..];
            rest = LSP.Compat.trim_whites(rest);

            string require_path = "";
            string resolution_type = "unknown";
            int skip = 0;

            // Pattern 1: String literal - #require "module.pike";
            if (sizeof(rest) > 0 && rest[0] == '"') {
                int end = search(rest, "\"", 1);
                if (end > 0) {
                    require_path = rest[1..end-1];
                    resolution_type = "string_literal";
                }
            }
            // Pattern 2: Constant identifier - #require constant(ModuleName);
            else if (has_prefix(rest, "constant(")) {
                string inner = rest[sizeof("constant(")..];
                inner = LSP.Compat.trim_whites(inner);
                int end = search(inner, ")");
                if (end > 0) {
                    require_path = inner[0..end-1];
                    require_path = LSP.Compat.trim_whites(require_path);
                    resolution_type = "constant_identifier";
                }
            }
            // Pattern 3: Complex expression - mark as skip
            else {
                require_path = rest;
                resolution_type = "complex_require";
                skip = 1;
            }

            if (sizeof(require_path) > 0) {
                symbols += ({
                    ([
                        "name": require_path,
                        "kind": "require", // #require directives have kind='require'
                        "modifiers": ([
                            "resolution_type": resolution_type,
                            "skip": skip
                        ]),
                        "position": ([
                            "file": filename,
                            "line": preprocessed_line
                        ]),
                        "classname": require_path // Use classname to store the path for the resolver
                    ])
                });
            }
            preprocessed += "\n";
        } else if (has_prefix(trimmed, "#pike") ||
                   has_prefix(trimmed, "#pragma") ||
                   has_prefix(trimmed, "#define") ||
                   has_prefix(trimmed, "#charset")) {
            preprocessed += "\n";
        } else {
            preprocessed += src_line + "\n";
        }
    }

    mixed err = catch {
        object parser = Tools.AutoDoc.PikeParser(preprocessed, filename, line);
        int iter = 0;
        array(string) autodoc_buffer = ({});

        while (parser->peekToken() != "" && iter++ < MAX_TOP_LEVEL_ITERATIONS) {
            string current_token = parser->peekToken();

            if (has_prefix(current_token, "//!")) {
                string doc_text = current_token;
                if (sizeof(doc_text) > 3) {
                    doc_text = doc_text[3..];
                    if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
                        doc_text = doc_text[1..];
                    }
                } else {
                    doc_text = "";
                }
                autodoc_buffer += ({doc_text});
                parser->readToken();
                continue;
            }

            mixed decl;
            mixed parse_err = catch {
                decl = parser->parseDecl();
            };

            // Check if decl is a Modifier that was returned for the @ splat operator
            // AutoDoc.PikeParser returns Modifier for @ since it's not a real modifier
            int is_splat_modifier = 0;
            if (!parse_err && decl && objectp(decl)) {
                string decl_repr = sprintf("%O", decl);
                if (has_value(decl_repr, "->Modifier(")) {
                    // Check if current token is @ (splat operator)
                    string current_tok = parser->peekToken();
                    if (current_tok == "@") {
                        is_splat_modifier = 1;
                    }
                }
            }

            if (parse_err || !decl || is_splat_modifier) {
                autodoc_buffer = ({});

                // Only generate diagnostic if there was an actual error (not just no decl)
                if (parse_err) {
                    string error_msg = describe_error(parse_err);
                    // Get current position from parser
                    int error_line = line;
                    if (parser->current_line) {
                        error_line = parser->current_line;
                    }
                    // Get current token for context
                    string current_token = "";
                    catch { current_token = parser->peekToken(); };
                    // Add diagnostic for this error - improved message
                    if (!has_value(error_msg, "expected identifier") &&
                        !has_value(error_msg, "sprintf: Wrong type")) {
                        // Improve error message with more context
                        string improved_msg = improve_syntax_error_message(error_msg, current_token, filename, error_line);
                        diagnostics += ({
                            ([
                                "message": improved_msg,
                                "severity": "error",
                                "position": ([
                                    "file": filename,
                                    "line": error_line
                                ])
                            ])
                        });
                    }
                }
                // Try to recover by skipping to next statement boundary
                // Note: skipUntil may need multiple calls due to newline handling quirks
                int recovery_attempts = 0;

                // If this was the @ splat operator, skip it first
                if (is_splat_modifier) {
                    parser->readToken();
                }

                while (recovery_attempts < 10) {
                    parser->skipUntil((<";", "{", "}", "">));
                    string tok = parser->peekToken();
                    if (tok == "" || (tok != ";" && tok != "{" && tok != "}" && tok != "}")) {
                        // EOF or not at statement boundary - try to skip one token
                        parser->readToken();
                        recovery_attempts++;
                        if (parser->peekToken() == "") {
                            break;  // EOF
                        }
                    } else {
                        // At statement boundary - consume and continue
                        parser->readToken();
                        break;
                    }
                }
                continue;
            }

            if (decl) {
                if (arrayp(decl)) {
                    string documentation = sizeof(autodoc_buffer) > 0 ? autodoc_buffer * "\n" : "";
                    autodoc_buffer = ({});

                    foreach(decl, mixed d) {
                        if (objectp(d)) {
                            string doc = documentation;
                            // Check autodoc_by_line - prefer it if it has autodoc markup tags
                            if (d->position && d->position->firstline && autodoc_by_line[d->position->firstline]) {
                                string line_doc = autodoc_by_line[d->position->firstline];
                                // Prefer autodoc_by_line if empty doc, or if line_doc has markup
                                program IntelligenceModule = master()->resolv("LSP.Intelligence.module");
                                if (sizeof(doc) == 0 || (IntelligenceModule && IntelligenceModule->has_autodoc_markup(line_doc))) {
                                    doc = line_doc;
                                }
                            }
                            mixed convert_err = catch {
                                symbols += ({symbol_to_json(d, doc)});
                            };
                        }
                    }
                } else if (objectp(decl)) {
                    string decl_kind = get_symbol_kind(decl);

                    if (decl_kind != "class" && decl_kind != "enum") {
                        string documentation = sizeof(autodoc_buffer) > 0 ? autodoc_buffer * "\n" : "";
                        autodoc_buffer = ({});

                        // Check autodoc_by_line - prefer it if it has autodoc markup tags
                        if (decl->position && decl->position->firstline && autodoc_by_line[decl->position->firstline]) {
                            string line_doc = autodoc_by_line[decl->position->firstline];
                            // Prefer autodoc_by_line if empty doc, or if line_doc has markup
                            program IntelligenceModule = master()->resolv("LSP.Intelligence.module");
                            if (sizeof(documentation) == 0 || (IntelligenceModule && IntelligenceModule->has_autodoc_markup(line_doc))) {
                                documentation = line_doc;
                            }
                        }

                        mixed convert_err = catch {
                            symbols += ({symbol_to_json(decl, documentation)});
                        };
                    }
                }
            } else {
                autodoc_buffer = ({});
            }

            parser->skipUntil((<";", "{", "">));
            if (parser->peekToken() == "{") {
                string decl_kind = "";
                if (objectp(decl)) {
                    decl_kind = get_symbol_kind(decl);
                }

                if (decl_kind == "class" || decl_kind == "enum") {
                    string class_documentation = sizeof(autodoc_buffer) > 0 ? autodoc_buffer * "\n" : "";
                    autodoc_buffer = ({});

                    // Check autodoc_by_line - prefer it if it has autodoc markup tags
                    if (decl->position && decl->position->firstline && autodoc_by_line[decl->position->firstline]) {
                        string line_doc = autodoc_by_line[decl->position->firstline];
                        // Prefer autodoc_by_line if empty doc, or if line_doc has markup
                        program IntelligenceModule = master()->resolv("LSP.Intelligence.module");
                        if (sizeof(class_documentation) == 0 || (IntelligenceModule && IntelligenceModule->has_autodoc_markup(line_doc))) {
                            class_documentation = line_doc;
                        }
                    }

                    parser->readToken();

                    mixed class_decl = decl;

                    // Parse class body using the reusable function
                    array(mapping) class_children = parse_class_body(
                        parser,
                        autodoc_by_line,
                        filename
                    );

                    // Consume closing brace if present
                    if (parser->peekToken() == "}") {
                        parser->readToken();
                    }

                    if (objectp(class_decl)) {
                        mixed conv_err = catch {
                            mapping class_json = symbol_to_json(class_decl, class_documentation);
                            class_json["children"] = class_children;
                            symbols += ({class_json});
                        };
                    }
                } else if (decl_kind == "method" || decl_kind == "function") {
                    parser->readToken();

                    int body_iter = 0;
                    int brace_depth = 1;
                    // Track if we've seen a return statement in this block (for unreachable code detection)
                    int seen_return = 0;

                    while (brace_depth > 0 && parser->peekToken() != "" && body_iter++ < MAX_BLOCK_ITERATIONS) {
                        string token = parser->peekToken();

                        if (token == "}") {
                            brace_depth--;
                            // Reset return tracking when exiting a block
                            if (brace_depth == 0) {
                                seen_return = 0;
                            }
                            parser->readToken();
                            continue;
                        }

                        if (token == "{") {
                            brace_depth++;
                            parser->readToken();
                            continue;
                        }

                        // Check for return statement - only at the top level of this function body
                        if (token == "return" && brace_depth == 1 && is_pmod_file) {
                            // Mark that we've seen a return
                            seen_return = 1;
                            // Consume the return token and skip to semicolon
                            parser->readToken();
                            parser->skipUntil((<";", "{", "}", "">));
                            if (parser->peekToken() == ";") {
                                parser->readToken();
                            }
                            continue;
                        }

                        mixed local_decl;
                        mixed parse_err = catch {
                            local_decl = parser->parseDecl();
                        };

                        // Check for unreachable code AFTER parsing the declaration
                        // This ensures we get proper line numbers and avoid duplicates
                        if (!parse_err && local_decl && seen_return && brace_depth == 1 && is_pmod_file) {
                            // Get line info from the parsed declaration
                            int unreachable_line = 1;
                            if (objectp(local_decl) && local_decl->position && local_decl->position->firstline) {
                                unreachable_line = local_decl->position->firstline;
                            }
                            // Only add diagnostic if we haven't already reported for this line
                            int already_reported = 0;
                            foreach(diagnostics, mapping d) {
                                if (d->position && d->position->line == unreachable_line &&
                                    has_value(d->message, "unreachable")) {
                                    already_reported = 1;
                                    break;
                                }
                            }
                            if (!already_reported) {
                                diagnostics += ({
                                    ([
                                        "message": "Unreachable code: code after return statement",
                                        "severity": "warning",
                                        "position": ([
                                            "file": filename,
                                            "line": unreachable_line
                                        ])
                                    ])
                                });
                            }
                        }

                        if (!parse_err && local_decl) {
                            if (arrayp(local_decl)) {
                                foreach(local_decl, mixed d) {
                                    if (objectp(d)) {
                                        string dkind = get_symbol_kind(d);
                                        if (dkind == "variable" || dkind == "constant" || dkind == "typedef") {
                                            symbols += ({symbol_to_json(d, "")});
                                        }
                                    }
                                }
                            } else if (objectp(local_decl)) {
                                string dkind = get_symbol_kind(local_decl);
                                if (dkind == "variable" || dkind == "constant" || dkind == "typedef") {
                                    symbols += ({symbol_to_json(local_decl, "")});
                                }
                            }
                            continue;
                        } else {
                            parser->skipUntil((<";", "{", "}", "">));
                            if (parser->peekToken() == ";") {
                                parser->readToken();
                            }
                        }
                    }
                } else {
                    parser->skipBlock();
                }
            }
            if (parser->peekToken() == ";") {
                parser->readToken();
            }
        }
    };

    if (err) {
        string error_msg = describe_error(err);
        if (!has_value(error_msg, "expected identifier")) {
            diagnostics += ({
                ([
                    "message": error_msg,
                    "severity": "error",
                    "position": ([
                        "file": filename,
                        "line": 1
                    ])
                ])
            });
        }
    }

    // STEP 2b: If we found fewer symbols than expected, use tokenization fallback
    // to find any remaining declarations that the parser missed
    // This helps with error recovery - we can still provide partial results
    array(mapping) tokenized_symbols = ({});
    mixed tok_err = catch {
        array(string) tokens = Parser.Pike.split(code);
        array tok = Parser.Pike.tokenize(tokens);

        // Track what's already found
        multiset(string) found_names = (< >);
        foreach(symbols, mapping s) {
            if (s->name) found_names[s->name] = 1;
        }

        // Type keywords for fallback declaration detection
        multiset(string) type_kw = (<
            "int", "string", "float", "mixed", "void", "array",
            "mapping", "multiset", "object", "program", "function",
            "zero", "type", "unknown"
        >);

        // Walk tokens and recover declaration symbols that parseDecl() missed.
        // This explicitly handles declarations with:
        // - union types: int|string
        // - intersection types: A&B
        // - attribute types: __attribute__(deprecated) int
        // - range types: int(0..255)
        int i = 0;
        while (i < sizeof(tok)) {
            object t = tok[i];
            string txt = t->text;

            if (is_ignorable_token(txt)) {
                i++;
                continue;
            }

            int type_start = 0;
            if (type_kw[txt] || txt == "__attribute__") {
                type_start = 1;
            } else if (is_identifier_token(txt)) {
                // Support class/interface-style type starts (A&B x;)
                // and dotted names (Foo.Bar x;).
                if ((txt[0] >= 'A' && txt[0] <= 'Z') || txt[0] == '_') {
                    type_start = 1;
                }
            }

            if (!type_start) {
                i++;
                continue;
            }

            // Scan until declaration terminator.
            int end_idx = i;
            while (end_idx < sizeof(tok)) {
                string end_txt = tok[end_idx]->text;
                if (end_txt == ";") break;
                if (end_txt == "\n" || end_txt == "{" || end_txt == "}") {
                    end_idx = -1;
                    break;
                }
                end_idx++;
            }

            if (end_idx < 0 || end_idx >= sizeof(tok)) {
                i++;
                continue;
            }

            mapping|int recovered =
                recover_declaration_symbol_from_tokens(tok, i, end_idx, filename, type_kw, found_names);
            if (mappingp(recovered) && recovered->name) {
                tokenized_symbols += ({ recovered });
                found_names[recovered->name] = 1;
            }

            // Skip to token after ';' to avoid duplicate work.
            i = end_idx + 1;
        }
    };

    // Add any tokenized symbols to results
    if (sizeof(tokenized_symbols) > 0) {
        symbols += tokenized_symbols;
        // Add a diagnostic noting we used fallback extraction
        diagnostics += ({
            ([
                "message": "Partial parsing - some symbols extracted via fallback",
                "severity": "warning",
                "position": ([
                    "file": filename,
                    "line": 1
                ])
            ])
        });
    }

    // STEP 2c: Extract dynamic module loading patterns (load_module, compile_file)
    // These patterns cannot be statically resolved, but we extract them for
    // documentation/analysis purposes and potential IDE features
    array(mapping) dynamic_modules = extract_dynamic_modules(code, filename);
    symbols += dynamic_modules;

    // STEP 3: Extract symbols from preprocessor conditional branches
    // These are ADDITIVE to the base symbols - no existing symbols are modified
    int total_branches = 0;
    int MAX_BRANCHES = 16;  // Variant cap to prevent excessive extraction

    foreach (preprocessor_blocks; int block_idx; mapping block) {
        string block_condition = block->condition || "";

        foreach (block->branches; int branch_idx; mapping branch) {
            string branch_condition = branch->condition || "";
            array(string) branch_lines = branch->lines || ({});
            int branch_start = branch->start_line || 1;

            // Skip branches with no code
            if (sizeof(branch_lines) == 0) {
                continue;
            }

            // Filter out preprocessor directive lines from branch code
            // We only want the actual Pike code, not #if/#elif/#else/#endif
            array(string) code_lines = ({});
            foreach (branch_lines, string line) {
                string trimmed = LSP.Compat.trim_whites(line);
                // Skip preprocessor directives
                if (!has_prefix(trimmed, "#if") &&
                    !has_prefix(trimmed, "#elif") &&
                    !has_prefix(trimmed, "#else") &&
                    !has_prefix(trimmed, "#endif") &&
                    !has_prefix(trimmed, "#ifdef") &&
                    !has_prefix(trimmed, "#ifndef")) {
                    code_lines += ({line});
                }
            }

            // Reconstruct branch code for token-based extraction
            string branch_code = code_lines * "\n";

            // Skip if no code after filtering
            if (sizeof(branch_code) == 0) {
                continue;
            }

            // Enforce variant cap (check after we know branch has code)
            if (total_branches >= MAX_BRANCHES) {
                diagnostics += ({
                    ([
                        "message": sprintf("Preprocessor variant cap reached: only %d branches processed (add more if needed)", MAX_BRANCHES),
                        "severity": "warning",
                        "position": ([
                            "file": filename,
                            "line": branch_start
                        ])
                    ])
                });
                break;
            }

            // Extract symbols from this branch using token-based analysis
            array(mapping) branch_symbols = extract_symbols_from_branch(
                branch_code,
                filename,
                branch_start
            );

            // Mark each symbol as conditional and add branch metadata
            foreach (branch_symbols; int i; mapping sym) {
                sym["conditional"] = 1;
                sym["condition"] = branch_condition;
                sym["branch"] = branch_idx;

                // Preserve position data from extraction
                if (!sym["position"]) {
                    sym["position"] = ([
                        "file": filename,
                        "line": branch_start
                    ]);
                }
            }

            // Append conditional symbols to result
            symbols += branch_symbols;
            total_branches++;
        }

        // Stop processing blocks if we hit the cap
        if (total_branches >= MAX_BRANCHES) {
            break;
        }
    }

    return ([
        "result": ([
            "symbols": symbols,
            "diagnostics": diagnostics
        ])
    ]);
}

//! Tokenize Pike source code
//! @param params Mapping with "code" key
//! @returns Mapping with "result" containing "tokens" array
//! @throws On tokenization errors (caller catches)
//! PERF-004: Includes character positions to avoid JavaScript string search
mapping tokenize_request(mapping params) {
    string code = params->code || "";
    array tokens = ({});

    // Access Parser.Pike via master()->resolv to avoid name conflict
    program PikeParserModule = master()->resolv("Parser.Pike");
    array(string) split_tokens = PikeParserModule->split(code);
    array pike_tokens = PikeParserModule->tokenize(split_tokens);

    // Build character position index for each line
    array code_lines = code / "\n";
    mapping(int:mapping(string:array(int))) line_positions = ([]);

    for (int i = 0; i < sizeof(code_lines); i++) {
        string line = code_lines[i];
        if (!line || sizeof(line) == 0) continue;

        mapping(string:array(int)) token_chars = ([]);

        // Find all occurrences of each token in this line
        foreach (pike_tokens, mixed t) {
            if (t->line != i + 1) continue;

            string token_text = t->text;
            if (!token_chars[token_text]) {
                token_chars[token_text] = ({});
            }

            // Find this token's position (nth occurrence)
            int nth = sizeof(token_chars[token_text]);
            int char_pos = -1;
            int search_start = 0;

            for (int j = 0; j <= nth; j++) {
                int found = search(line[search_start..], token_text);
                if (found == -1) break;
                char_pos = search_start + found;
                search_start = char_pos + sizeof(token_text);
            }

            if (char_pos >= 0) {
                token_chars[token_text] += ({char_pos});
            }
        }

        line_positions[i + 1] = token_chars;
    }

    // Build tokens with character positions
    mapping(string:int) occurrence_index = ([]);

    foreach (pike_tokens, mixed t) {
        string key = sprintf("%d:%s", t->line, t->text);
        int occ_idx = occurrence_index[key] || 0;
        occurrence_index[key] = occ_idx + 1;

        // Get pre-computed character position
        int char_pos = -1;
        if (line_positions[t->line] && line_positions[t->line][t->text]) {
            array(int) positions = line_positions[t->line][t->text];
            if (occ_idx < sizeof(positions)) {
                char_pos = positions[occ_idx];
            }
        }

        tokens += ({
            ([
                "text": t->text,
                "line": t->line,
                "character": char_pos,
                "file": t->file
            ])
        });
    }

    return ([
        "result": ([
            "tokens": tokens
        ])
    ]);
}

//! Compile Pike source code and capture diagnostics
//! @param params Mapping with "code" and "filename" keys
//! @returns Mapping with "result" containing "symbols" and "diagnostics"
//! @throws On compilation errors (caller catches)
mapping compile_request(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    array diagnostics = ({});

    // Capture compilation errors using set_inhibit_compile_errors
    void capture_error(string file, int line, string msg) {
        diagnostics += ({
            ([
                "message": msg,
                "severity": "error",
                "position": ([
                    "file": file,
                    "line": line
                ])
            ])
        });
    };

    // Save old handlers
    mixed old_error = master()->get_inhibit_compile_errors();

    // Set our capture handlers
    master()->set_inhibit_compile_errors(capture_error);

    // Try to compile
    mixed err = catch {
        compile_string(code, filename);
    };

    // Restore old handler
    master()->set_inhibit_compile_errors(old_error);

    return ([
        "result": ([
            "symbols": ({}),
            "diagnostics": diagnostics
        ])
    ]);
}

//! Parse preprocessor conditional blocks and extract branch structure
//! @param code Raw source code
//! @returns Array of preprocessor block mappings with conditions, branches, line ranges
protected array(mapping) parse_preprocessor_blocks(string code) {
    array(mapping) blocks = ({});
    array(mapping) stack = ({});

    array(string) lines = code / "\n";

    foreach (lines; int line_num; string raw_line) {
        int line_index = line_num + 1;  // 1-based line numbers
        string trimmed = LSP.Compat.trim_whites(raw_line);

        // Detect preprocessor directives
        if (has_prefix(trimmed, "#if") || has_prefix(trimmed, "#ifdef") || has_prefix(trimmed, "#ifndef")) {
            // Start of a new conditional block
            string condition = "";
            if (has_prefix(trimmed, "#ifdef")) {
                condition = LSP.Compat.trim_whites(trimmed[sizeof("#ifdef")..]);
            } else if (has_prefix(trimmed, "#ifndef")) {
                condition = LSP.Compat.trim_whites(trimmed[sizeof("#ifndef")..]);
            } else {
                condition = LSP.Compat.trim_whites(trimmed[sizeof("#if")..]);
            }

            mapping branch = ([
                "condition": condition,
                "startLine": line_index,
                "endLine": line_index,
                "lines": ({raw_line})
            ]);

            mapping block = ([
                "condition": condition,
                "branches": ({branch}),
                "nesting_depth": sizeof(stack)
            ]);

            stack += ({block});
        }
        else if (has_prefix(trimmed, "#elif")) {
            // New branch in current conditional block
            if (sizeof(stack) > 0) {
                string condition = LSP.Compat.trim_whites(trimmed[sizeof("#elif")..]);
                mapping branch = ([
                    "condition": condition,
                    "startLine": line_index,
                    "endLine": line_index,
                    "lines": ({raw_line})
                ]);

                mapping current_block = stack[-1];
                current_block["branches"] += ({branch});
            }
        }
        else if (has_prefix(trimmed, "#else")) {
            // Else branch in current conditional block
            if (sizeof(stack) > 0) {
                mapping branch = ([
                    "condition": "else",
                    "startLine": line_index,
                    "endLine": line_index,
                    "lines": ({raw_line})
                ]);

                mapping current_block = stack[-1];
                current_block["branches"] += ({branch});
            }
        }
        else if (has_prefix(trimmed, "#endif")) {
            // End of current conditional block
            if (sizeof(stack) > 0) {
                mapping block = stack[-1];
                stack = stack[0..sizeof(stack)-2];  // Pop from stack

                // Update end line of the last branch
                if (sizeof(block->branches) > 0) {
                    mapping last_branch = block->branches[-1];
                    last_branch->endLine = line_index;
                }

                blocks += ({block});
            }
        }
        else {
            // Regular line - add to current branch of all active blocks
            foreach (stack; int i; mapping block) {
                if (sizeof(block->branches) > 0) {
                    mapping current_branch = block->branches[-1];
                    current_branch->endLine = line_index;
                    current_branch->lines += ({raw_line});
                }
            }
        }
    }

    return blocks;
}

//! Custom preprocessor tokenizer that handles incomplete syntax gracefully
//! This tokenizer is specifically designed for extracting symbols from preprocessor
//! branches, even when the code is syntactically incomplete.
//! @param code Raw source code from a preprocessor branch
//! @returns Array of tokens (strings)
protected array(string) tokenize_preprocessor_branch(string code) {
    array(string) tokens = ({});
    if (!code || sizeof(code) == 0) {
        return tokens;
    }

    // Track whether we're inside a multi-line string/comment
    int in_string = 0;
    int in_multiline_comment = 0;
    string current_token = "";
    int pos = 0;

    while (pos < sizeof(code)) {
        string char = code[pos..pos];

        // Handle multi-line comments
        if (in_multiline_comment) {
            if (pos + 1 < sizeof(code) && code[pos..pos+1] == "*/") {
                in_multiline_comment = 0;
                pos += 2;
            } else {
                pos++;
            }
            continue;
        }

        // Handle strings (single and double quoted)
        if (in_string) {
            if (char == "\\" && pos + 1 < sizeof(code)) {
                // Escaped character
                current_token += char + code[pos+1..pos+1];
                pos += 2;
            } else if ((char == "\"" && in_string == 1) || (char == "'" && in_string == 2)) {
                // End of string
                current_token += char;
                tokens += ({current_token});
                current_token = "";
                in_string = 0;
                pos++;
            } else {
                current_token += char;
                pos++;
            }
            continue;
        }

        // Handle single-line comments
        if (char == "/" && pos + 1 < sizeof(code)) {
            if (code[pos+1..pos+1] == "/") {
                // Single-line comment - skip to end of line
                while (pos < sizeof(code) && code[pos..pos] != "\n") {
                    pos++;
                }
                continue;
            } else if (code[pos+1..pos+1] == "*") {
                // Multi-line comment start
                in_multiline_comment = 1;
                pos += 2;
                continue;
            }
        }

        // Handle string start
        if (char == "\"") {
            if (sizeof(current_token) > 0) {
                tokens += ({current_token});
                current_token = "";
            }
            in_string = 1;
            current_token += char;
            pos++;
            continue;
        }
        if (char == "'") {
            if (sizeof(current_token) > 0) {
                tokens += ({current_token});
                current_token = "";
            }
            in_string = 2;
            current_token += char;
            pos++;
            continue;
        }

        // Handle whitespace - token boundary
        // Use trim_whites check instead of non-existent String.is_whitespace
        if (sizeof(String.trim_whites(char)) == 0) {
            if (sizeof(current_token) > 0) {
                tokens += ({current_token});
                current_token = "";
            }
            pos++;
            continue;
        }

        // Handle punctuation - these are individual tokens
        if (has_value("{}[]();:,.<>+=-*&|^!~?/%@", char)) {
            if (sizeof(current_token) > 0) {
                tokens += ({current_token});
                current_token = "";
            }
            tokens += ({char});
            pos++;
            continue;
        }

        // Regular character - accumulate into token
        current_token += char;
        pos++;
    }

    // Don't forget the last token
    if (sizeof(current_token) > 0) {
        tokens += ({current_token});
    }

    return tokens;
}

//! Extract symbol declarations from potentially incomplete code using token-based analysis
//! Uses our custom tokenizer for better handling of incomplete syntax in preprocessor branches
//! @param branch_code String of code from a single preprocessor branch
//! @param filename Source filename for position tracking
//! @param line_offset Line number offset for this branch within the file
//! @returns Array of symbol mappings extracted from the branch
protected array(mapping) extract_symbols_from_branch(string branch_code, string filename, int line_offset) {
    array(mapping) symbols = ({});

    // Token keywords for type detection
    multiset(string) type_keywords = (<
        "int", "string", "float", "mixed", "void", "array",
        "mapping", "multiset", "object", "program", "function"
    >);

    // Modifier tokens
    multiset(string) modifiers = (<
        "static", "local", "private", "protected", "public", "final", "optional"
    >);

    // Additional Pike 8.0 keywords
    multiset(string) pike_keywords = (<
        "constant", "class", "enum", "typedef", "inherit", "import",
        "lambda", "inline", "variant", "nomask", "static"
    >);

    mixed err = catch {
        // Use custom tokenizer that handles incomplete code better
        // Fall back to Parser.Pike.split() if custom tokenizer fails
        array(string) tokens;
        mixed tokenize_err = catch {
            tokens = tokenize_preprocessor_branch(branch_code);
        };

        if (tokenize_err || !tokens || sizeof(tokens) == 0) {
            // Fallback to Parser.Pike.split()
            program PikeParserModule = master()->resolv("Parser.Pike");
            tokens = PikeParserModule->split(branch_code);
        }

        // Walk tokens looking for declaration patterns
        int i = 0;
        while (i < sizeof(tokens)) {
            string token = tokens[i];
            string trimmed = String.trim_all_whites(token);

            // Skip empty tokens and whitespace
            if (sizeof(trimmed) == 0) {
                i++;
                continue;
            }

            // Pattern 1: class/enum declarations
            if (trimmed == "class" || trimmed == "enum") {
                // Next token should be the class/enum name
                if (i + 1 < sizeof(tokens)) {
                    string name_token = String.trim_all_whites(tokens[i + 1]);
                    // Skip if it's a keyword (not a name)
                    if (sizeof(name_token) > 0 && !type_keywords[name_token] && name_token != "{") {
                        symbols += ({
                            ([
                                "name": name_token,
                                "kind": trimmed,  // "class" or "enum"
                                "position": ([
                                    "file": filename,
                                    "line": line_offset
                                ])
                            ])
                        });
                    }
                }
                i++;
                continue;
            }

            // Pattern 2: modifier + type + name (e.g., "static int x")
            if (modifiers[trimmed]) {
                // Find next non-whitespace token - should be a type
                int type_idx = i + 1;
                while (type_idx < sizeof(tokens)) {
                    string type_trimmed = String.trim_all_whites(tokens[type_idx]);
                    if (sizeof(type_trimmed) > 0) {
                        // Found next non-whitespace token
                        if (type_keywords[type_trimmed]) {
                            // Now find the name token (skip whitespace after type)
                            int name_idx = type_idx + 1;
                            while (name_idx < sizeof(tokens)) {
                                string name_token = String.trim_all_whites(tokens[name_idx]);
                                if (sizeof(name_token) > 0) {
                                    // Found the name
                                    // Skip if it's not an identifier
                                    if (name_token != "{" &&
                                        name_token != ";" &&
                                        name_token != "(" &&
                                        !type_keywords[name_token]) {
                                        symbols += ({
                                            ([
                                                "name": name_token,
                                                "kind": "variable",
                                                "modifiers": ({trimmed}),
                                                "position": ([
                                                    "file": filename,
                                                    "line": line_offset
                                                ])
                                            ])
                                        });
                                    }
                                    break;
                                }
                                name_idx++;
                            }
                        }
                        break;
                    }
                    type_idx++;
                }
                i++;
                continue;
            }

            // Pattern 3: type + name (e.g., "int x" or "string foo()")
            if (type_keywords[trimmed]) {
                // Find next non-whitespace token - that should be the variable/function name
                int next_idx = i + 1;
                while (next_idx < sizeof(tokens)) {
                    string next_trimmed = String.trim_all_whites(tokens[next_idx]);
                    if (sizeof(next_trimmed) > 0) {
                        // Found the next non-whitespace token

                        // Skip if it's not an identifier (e.g., another keyword or operator)
                        if (next_trimmed != "{" &&
                            next_trimmed != ";" &&
                            next_trimmed != "(" &&
                            !type_keywords[next_trimmed] &&
                            !modifiers[next_trimmed]) {

                            // Check if this is a function (look for opening paren after name)
                            string kind = "variable";
                            int after_name_idx = next_idx + 1;
                            while (after_name_idx < sizeof(tokens)) {
                                string after_trimmed = String.trim_all_whites(tokens[after_name_idx]);
                                if (sizeof(after_trimmed) > 0) {
                                    if (after_trimmed == "(") {
                                        kind = "method";
                                    }
                                    break;
                                }
                                after_name_idx++;
                            }

                            symbols += ({
                                ([
                                    "name": next_trimmed,
                                    "kind": kind,
                                    "position": ([
                                        "file": filename,
                                        "line": line_offset
                                    ])
                                ])
                            });
                        }
                        break;
                    }
                    next_idx++;
                }
                i++;
                continue;
            }

            i++;
        }
    };

    // Log errors but don't fail - token extraction is best-effort
    if (err) {
        werror("extract_symbols_from_branch: %O\n", describe_error(err));
    }

    return symbols;
}

//! Parse preprocessor blocks - public wrapper
//! @param params Mapping with "code" key
//! @returns Mapping with "result" containing "blocks" array
//! @throws On parsing errors (caller catches)
mapping parse_preprocessor_blocks_request(mapping params) {
    string code = params->code || "";
    array blocks = parse_preprocessor_blocks(code);

    return ([
        "result": ([
            "blocks": blocks
        ])
    ]);
}

//! Parse multiple Pike source files in a single request
//! @param params Mapping with "files" array (each with "code" and "filename")
//! @returns Mapping with "result" containing "results" array and "count"
//! @throws On batch processing errors (caller catches)
mapping batch_parse_request(mapping params) {
    array files = params->files || ({});
    array results = ({});

    foreach (files, mapping file_info) {
        string code = file_info->code || "";
        string filename = file_info->filename || "unknown.pike";

        // Try to parse each file, continuing even if one fails
        mixed parse_err;
        mapping parse_result;

        parse_err = catch {
            parse_result = parse_request(([
                "code": code,
                "filename": filename,
                "line": 1
            ]));
        };

        if (parse_err) {
            // On error, return result with error diagnostic
            results += ({
                ([
                    "filename": filename,
                    "symbols": ({}),
                    "diagnostics": ({
                        ([
                            "severity": "error",
                            "message": "Parse error: " + describe_error(parse_err),
                            "position": ([
                                "file": filename,
                                "line": 1
                            ])
                        ])
                    })
                ])
            });
        } else {
            // Extract results from parse response
            mapping parse_data = parse_result->result || ([]);
            results += ({
                ([
                    "filename": filename,
                    "symbols": parse_data->symbols || ({}),
                    "diagnostics": parse_data->diagnostics || ({})
                ])
            });
        }
    }

    return ([
        "result": ([
            "results": results,
            "count": sizeof(results)
        ])
    ]);
}

protected string get_symbol_kind(object symbol) {
    string repr = sprintf("%O", symbol);

    if (has_value(repr, "->Class(")) return "class";
    if (has_value(repr, "->Method(")) return "method";
    if (has_value(repr, "->Variable(")) return "variable";
    if (has_value(repr, "->Constant(")) return "constant";
    if (has_value(repr, "->Typedef(")) return "typedef";
    if (has_value(repr, "->Enum(") && !has_value(repr, "->EnumConstant(")) return "enum";
    if (has_value(repr, "->EnumConstant(")) return "enum_constant";
    if (has_value(repr, "->Inherit(")) return "inherit";
    if (has_value(repr, "->Import(")) return "import";
    if (has_value(repr, "->Modifier(")) return "modifier";
    if (has_value(repr, "->Module(")) return "module";
    if (has_value(repr, "->NameSpace(")) return "namespace";

    if (catch {return symbol->returntype ? "method" : 0;} == 0) return "method";
    if (catch {return symbol->type ? "variable" : 0;} == 0) return "variable";

    return "unknown";
}

//! Parse autodoc documentation string into structured format
//! Extracts @param, @returns, @throws, @note, @seealso, @deprecated tags
//! @param doc Raw autodoc string (with //! prefixes stripped)
//! @returns Mapping with text, params, returns, throws, notes, seealso, deprecated
//! @deprecated Use TypeAnalysis.parse_autodoc() instead. This function delegates to
//!             TypeAnalysis which provides superior parsing with inline markup,
//!             structured types, and native Pike parser integration.
protected mapping simple_parse_autodoc(string doc) {
    if (!doc || sizeof(doc) == 0) return ([]);

    // Delegate to TypeAnalysis.parse_autodoc() for superior parsing
    program type_analysis_program = master()->resolv("LSP.Intelligence.TypeAnalysis");
    if (type_analysis_program) {
        mixed err = catch {
            object type_analyzer = type_analysis_program(0);
            return type_analyzer->parse_autodoc(doc);
        };

        // Log error but continue to minimal fallback
        if (err) {
            // Fallback: return basic text only
            return ([ "text": doc ]);
        }
    }

    // Absolute fallback if TypeAnalysis unavailable (should not happen in normal operation)
    return ([ "text": doc ]);
}

//! Parse a class or enum body and return child symbols
//! @param parser The PikeParser positioned after the opening {
//! @param autodoc_by_line Mapping of line->autodoc documentation
//! @param filename Source filename for position tracking
//! @returns Array of child symbol mappings
protected array(mapping) parse_class_body(
    object parser,
    mapping autodoc_by_line,
    string filename
) {
    array(mapping) class_children = ({});
    array(string) member_autodoc_buffer = ({});
    int block_iter = 0;

    while (parser->peekToken() != "}" && parser->peekToken() != "" && block_iter++ < MAX_BLOCK_ITERATIONS) {
        string member_token = parser->peekToken();

        if (has_prefix(member_token, "//!")) {
            string doc_text = member_token;
            if (sizeof(doc_text) > 3) {
                doc_text = doc_text[3..];
                if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
                    doc_text = doc_text[1..];
                }
            } else {
                doc_text = "";
            }
            member_autodoc_buffer += ({doc_text});
            parser->readToken();
            continue;
        }

        mixed member_decl;
        mixed member_err = catch {
            member_decl = parser->parseDecl();
        };

        if (member_err) {
            member_autodoc_buffer = ({});
            parser->readToken();
            continue;
        }

        if (member_decl) {
            string member_doc = sizeof(member_autodoc_buffer) > 0 ? member_autodoc_buffer * "\n" : "";
            member_autodoc_buffer = ({});

            if (arrayp(member_decl)) {
                foreach(member_decl, mixed m) {
                    if (objectp(m)) {
                        string doc = member_doc;
                        // Check autodoc_by_line - prefer it if it has autodoc markup tags
                        if (m->position && m->position->firstline && autodoc_by_line[m->position->firstline]) {
                            string line_doc = autodoc_by_line[m->position->firstline];
                            // Prefer autodoc_by_line if empty doc, or if line_doc has markup
                            program IntelligenceModule = master()->resolv("LSP.Intelligence.module");
                            if (sizeof(doc) == 0 || (IntelligenceModule && IntelligenceModule->has_autodoc_markup(line_doc))) {
                                doc = line_doc;
                            }
                        }
                        mixed conv_err = catch {
                            class_children += ({symbol_to_json(m, doc)});
                        };
                    }
                }
            } else if (objectp(member_decl)) {
                string doc = member_doc;
                // Check autodoc_by_line - prefer it if it has autodoc markup tags
                if (member_decl->position && member_decl->position->firstline && autodoc_by_line[member_decl->position->firstline]) {
                    string line_doc = autodoc_by_line[member_decl->position->firstline];
                    // Prefer autodoc_by_line if empty doc, or if line_doc has markup
                    program IntelligenceModule = master()->resolv("LSP.Intelligence.module");
                    if (sizeof(doc) == 0 || (IntelligenceModule && IntelligenceModule->has_autodoc_markup(line_doc))) {
                        doc = line_doc;
                    }
                }
                mixed conv_err = catch {
                    class_children += ({symbol_to_json(member_decl, doc)});
                };
            }
        } else {
            member_autodoc_buffer = ({});
        }

        parser->skipUntil((<";", "{", "}", "">));
        if (parser->peekToken() == "{") {
            // Check if this is a nested class/enum
            string member_kind = "";
            if (objectp(member_decl)) {
                member_kind = get_symbol_kind(member_decl);
            }

            if (member_kind == "class" || member_kind == "enum") {
                // Recursively parse nested class body
                parser->readToken();  // Consume opening brace
                array(mapping) nested_children = parse_class_body(
                    parser,
                    autodoc_by_line,
                    filename
                );

                // Attach nested children to the last class member
                if (sizeof(class_children) > 0 && sizeof(nested_children) > 0) {
                    class_children[-1]["children"] = nested_children;
                }

                // Consume closing brace if present
                if (parser->peekToken() == "}") {
                    parser->readToken();
                }
            } else {
                // Not a nested class - skip the block
                parser->skipBlock();
            }
        }
        if (parser->peekToken() == ";") {
            parser->readToken();
        }
    }

    return class_children;
}

protected mapping symbol_to_json(object symbol, string|void documentation) {
    string kind = get_symbol_kind(symbol);

    mapping result = ([
        "name": symbol->name,
        "kind": kind,
        "modifiers": symbol->modifiers || ([]),
    ]);

    if (documentation && sizeof(documentation) > 0) {
        // Use TypeAnalysis.parse_autodoc() for superior parsing
        // (supports inline markup, structured types, paramOrder, @ignore/@endignore)
        program type_analysis_program = master()->resolv("LSP.Intelligence.TypeAnalysis");
        if (type_analysis_program) {
            object type_analyzer = type_analysis_program(0);
            result->documentation = type_analyzer->parse_autodoc(documentation);
        } else {
            // Fallback to simple parser if TypeAnalysis not available
            result->documentation = simple_parse_autodoc(documentation);
        }
    }

    catch {
        if (symbol->position) {
            result->position = ([
                "file": symbol->position->filename || "",
                "line": symbol->position->firstline || 1
            ]);
        }
    };

    if (kind == "method") {
        catch {
            if (symbol->returntype) {
                result->returnType = type_to_json(symbol->returntype);
            }
        };
        catch {
            if (symbol->argnames) result->argNames = symbol->argnames;
        };
        catch {
            if (symbol->argtypes) result->argTypes = map(symbol->argtypes, type_to_json);
        };
    } else if (kind == "variable" || kind == "constant" || kind == "typedef") {
        catch {
            if (symbol->type) result->type = type_to_json(symbol->type);
        };
    } else if (kind == "class") {
        // Could add inherits, children later
    } else if (kind == "inherit" || kind == "import") {
        // RESEARCH NOTE (Feb 2026): Inherit statement handling is fully implemented
        //
        // Parser behavior:
        // - parseDecl() returns Tools.AutoDoc.PikeParser()->Inherit() for inherit statements
        // - Inherit objects have: name (local alias), classname (full path), position
        // - get_symbol_kind() line 573 returns "inherit" for these objects
        // - Main parsing loop (lines 182-239) automatically processes inherits as class members
        //
        // Test results show correct extraction:
        // - "inherit Y;" → {kind:"inherit", name:"Y", classname:"Y"}
        // - "inherit Z : z_alias;" → {kind:"inherit", name:"z_alias", classname:"Z"}
        // - "inherit A.B.C;" → {kind:"inherit", name:"C", classname:"A.B.C"}
        //
        // No Pike-side changes needed - focus TypeScript efforts on navigation/resolution.
        catch {
            if (symbol->classname) {
                string c = symbol->classname;
                if (sizeof(c) >= 2 && c[0] == '"' && c[-1] == '"') c = c[1..sizeof(c)-2];
                if (sizeof(c) >= 2 && c[0] == '\'' && c[-1] == '\'') c = c[1..sizeof(c)-2];
                result->classname = c;
            }
        };
        catch {
            if (symbol->name) {
                string n = symbol->name;
                if (sizeof(n) >= 2 && n[0] == '"' && n[-1] == '"') n = n[1..sizeof(n)-2];
                if (sizeof(n) >= 2 && n[0] == '\'' && n[-1] == '\'') n = n[1..sizeof(n)-2];
                result->name = n;
            }
        };
    }

    return result;
}

//! Improve syntax error messages with more helpful context
//! @param error_msg Raw error message from Pike parser
//! @param current_token The token the parser is currently on
//! @param filename Source filename
//! @param error_line Line number where error occurred
//! @returns Improved error message with context and suggestions
protected string improve_syntax_error_message(string error_msg, string current_token, string filename, int error_line) {
    string improved = "Syntax error";

    // Extract key information from the raw error
    string lower_msg = lower_case(error_msg);

    // Handle common parsing errors with helpful messages
    if (has_value(lower_msg, "unexpected")) {
        // "Unexpected token" - explain what was found
        if (sizeof(current_token) > 0) {
            improved = sprintf("Unexpected token '%s' at line %d", current_token, error_line);
            // Add suggestions based on what was found
            if (current_token == "(") {
                improved += ". Did you forget to close a parenthesis or bracket?";
            } else if (current_token == ")") {
                improved += ". There is an unmatched closing parenthesis.";
            } else if (current_token == "}") {
                improved += ". There is an unmatched closing brace.";
            } else if (current_token == "{") {
                improved += ". There is an unmatched opening brace.";
            } else if (current_token == ";") {
                improved += ". Unexpected semicolon - check for missing statements before this.";
            } else if (has_prefix(current_token, "\"") || has_prefix(current_token, "'")) {
                improved += ". Unclosed string or character literal.";
            }
        } else {
            improved = sprintf("Unexpected end of input at line %d - missing closing bracket or semicolon?", error_line);
        }
    }
    else if (has_value(lower_msg, "expected")) {
        // "Expected X but found Y"
        improved = sprintf("Syntax error at line %d: %s", error_line, error_msg);
        // Add helpful suggestions
        if (has_value(lower_msg, "identifier")) {
            improved += ". Expected an identifier - check for typos or missing variable names.";
        } else if (has_value(lower_msg, "(") || has_value(lower_msg, ")")) {
            improved += ". Check for unmatched parentheses.";
        } else if (has_value(lower_msg, ";")) {
            improved += ". Statement may be missing a semicolon.";
        }
    }
    else if (has_value(lower_msg, "unmatched") || has_value(lower_msg, "mismatch")) {
        improved = sprintf("Bracket mismatch at line %d: %s", error_line, error_msg);
    }
    else if (has_value(lower_msg, "unknown")) {
        improved = sprintf("Unknown syntax at line %d: %s. Check for typos in keywords.", error_line, error_msg);
    }
    else if (has_value(lower_msg, "illegal")) {
        improved = sprintf("Illegal syntax at line %d: %s", error_line, error_msg);
    }
    else {
        // Generic improvement for other errors
        improved = sprintf("Syntax error at line %d: %s", error_line, error_msg);
    }

    return improved;
}

//! Check whether a token should be skipped by fallback token recovery.
protected int is_ignorable_token(string token) {
    if (!token || sizeof(token) == 0) return 1;
    if (token == "\n") return 1;
    if (token[0] == ' ' || token[0] == '\t' || token[0] == '\r') return 1;
    if (has_prefix(token, "//")) return 1;
    if (has_prefix(token, "/*")) return 1;
    if (has_prefix(token, "*/")) return 1;
    return 0;
}

//! Check if token is a Pike identifier token (supports dotted names).
protected int is_identifier_token(string token) {
    if (!token || sizeof(token) == 0) return 0;

    int first = token[0];
    if (!((first >= 'a' && first <= 'z') ||
          (first >= 'A' && first <= 'Z') ||
          first == '_')) {
        return 0;
    }

    for (int i = 1; i < sizeof(token); i++) {
        int ch = token[i];
        if (!((ch >= 'a' && ch <= 'z') ||
              (ch >= 'A' && ch <= 'Z') ||
              (ch >= '0' && ch <= '9') ||
              ch == '_' || ch == '.')) {
            return 0;
        }
    }

    return 1;
}

//! Pike declaration modifiers that may appear before a type.
protected int is_modifier_keyword(string token) {
    return has_value(({
        "public", "private", "protected", "static", "final",
        "local", "constant", "optional", "inline", "variant"
    }), token);
}

//! Remove wrapping parenthesis around a full type expression.
protected array(string) unwrap_type_parens(array(string) tokens) {
    if (!tokens) return ({});

    while (sizeof(tokens) >= 2 && tokens[0] == "(" && tokens[-1] == ")") {
        int depth = 0;
        int wraps = 1;

        for (int i = 0; i < sizeof(tokens); i++) {
            string tok = tokens[i];
            if (tok == "(") depth++;
            else if (tok == ")") {
                depth--;
                if (depth == 0 && i < sizeof(tokens) - 1) {
                    wraps = 0;
                    break;
                }
            }
            if (depth < 0) {
                wraps = 0;
                break;
            }
        }

        if (!wraps || depth != 0) break;
        tokens = tokens[1..<1];
    }

    return tokens;
}

//! Split type tokens by top-level operator (ignores nested parentheses).
protected array(array(string)) split_type_tokens_top_level(array(string) tokens, string op) {
    array(array(string)) parts = ({});
    array(string) current = ({});
    int depth = 0;

    foreach (tokens, string tok) {
        if (tok == "(") depth++;
        else if (tok == ")" && depth > 0) depth--;

        if (tok == op && depth == 0) {
            parts += ({ current });
            current = ({});
            continue;
        }

        current += ({ tok });
    }

    parts += ({ current });
    return parts;
}

//! Parse a fallback type expression from token texts into JSON shape used by TS.
protected mapping|int parse_fallback_type_tokens(array(string) raw_tokens) {
    if (!raw_tokens || sizeof(raw_tokens) == 0) return 0;

    array(string) tokens = unwrap_type_parens(raw_tokens);
    if (sizeof(tokens) == 0) return 0;

    // __attribute__(...) <type>
    if (sizeof(tokens) >= 3 && tokens[0] == "__attribute__" && tokens[1] == "(") {
        int depth = 1;
        int attr_end = -1;
        for (int i = 2; i < sizeof(tokens); i++) {
            if (tokens[i] == "(") depth++;
            else if (tokens[i] == ")") {
                depth--;
                if (depth == 0) {
                    attr_end = i;
                    break;
                }
            }
        }

        if (attr_end > 1) {
            mapping attr_type = ([ "name": "__attribute__" ]);
            string attr_name = "";
            if (attr_end > 2) {
                attr_name = tokens[2..attr_end - 1] * "";
            }
            if (sizeof(attr_name) > 0) {
                attr_type->attribute = attr_name;
            }
            if (attr_end + 1 < sizeof(tokens)) {
                mapping|int inner = parse_fallback_type_tokens(tokens[attr_end + 1..]);
                if (inner) attr_type->type = inner;
            }
            return attr_type;
        }
    }

    // Union (A|B)
    array(array(string)) union_parts = split_type_tokens_top_level(tokens, "|");
    if (sizeof(union_parts) > 1) {
        array(mapping) parsed = ({});
        foreach (union_parts, array(string) part) {
            mapping|int part_type = parse_fallback_type_tokens(part);
            if (mappingp(part_type)) parsed += ({ part_type });
        }
        if (sizeof(parsed) == 1) return parsed[0];
        if (sizeof(parsed) > 1) return ([ "name": "or", "types": parsed ]);
    }

    // Intersection (A&B)
    array(array(string)) intersection_parts = split_type_tokens_top_level(tokens, "&");
    if (sizeof(intersection_parts) > 1) {
        array(mapping) parsed = ({});
        foreach (intersection_parts, array(string) part) {
            mapping|int part_type = parse_fallback_type_tokens(part);
            if (mappingp(part_type)) parsed += ({ part_type });
        }
        if (sizeof(parsed) == 1) return parsed[0];
        if (sizeof(parsed) > 1) return ([ "name": "and", "types": parsed ]);
    }

    // Range types: int(0..255), int(..255), int(0..)
    if (sizeof(tokens) >= 4 &&
        (tokens[0] == "int" || tokens[0] == "string") &&
        tokens[1] == "(" && tokens[-1] == ")") {
        array(string) inner = tokens[2..<1];
        int depth = 0;
        int range_idx = -1;

        for (int i = 0; i < sizeof(inner); i++) {
            if (inner[i] == "(") depth++;
            else if (inner[i] == ")" && depth > 0) depth--;
            else if (inner[i] == ".." && depth == 0) {
                range_idx = i;
                break;
            }
        }

        if (range_idx >= 0) {
            mapping result = ([ "name": tokens[0] ]);
            if (range_idx > 0) {
                string min = inner[..range_idx - 1] * "";
                if (sizeof(min) > 0) result->min = min;
            }
            if (range_idx + 1 < sizeof(inner)) {
                string max = inner[range_idx + 1..] * "";
                if (sizeof(max) > 0) result->max = max;
            }
            return result;
        }
    }

    if (sizeof(tokens) == 1) {
        return ([ "name": tokens[0] ]);
    }

    // Fallback for complex types we don't fully decompose in token recovery.
    return ([ "name": tokens * "" ]);
}

//! Recover a variable declaration from token stream when parseDecl() fails.
protected mapping|int recover_declaration_symbol_from_tokens(
    array tok,
    int start_idx,
    int end_idx,
    string filename,
    multiset(string) type_kw,
    multiset(string) found_names
) {
    if (start_idx < 0 || end_idx <= start_idx || end_idx > sizeof(tok)) return 0;

    array(string) sig = ({});
    int i = start_idx;
    while (i < end_idx) {
        string txt = tok[i]->text;

        if (has_prefix(txt, "/*")) {
            // Skip block comments entirely.
            while (i < end_idx && !has_prefix(tok[i]->text, "*/")) i++;
            i++;
            continue;
        }

        if (!is_ignorable_token(txt)) {
            sig += ({ txt });
        }
        i++;
    }

    if (sizeof(sig) < 2) return 0;

    while (sizeof(sig) > 0 && is_modifier_keyword(sig[0])) {
        sig = sig[1..];
    }

    if (sizeof(sig) < 2) return 0;

    int name_idx = -1;
    for (int idx = sizeof(sig) - 1; idx >= 1; idx--) {
        string candidate = sig[idx];
        if (!is_identifier_token(candidate)) continue;
        if (type_kw[candidate]) continue;
        if (is_modifier_keyword(candidate)) continue;
        name_idx = idx;
        break;
    }

    if (name_idx <= 0) return 0;

    string name = sig[name_idx];
    if (!name || sizeof(name) == 0 || found_names[name]) return 0;

    array(string) type_tokens = sig[..name_idx - 1];
    if (sizeof(type_tokens) == 0) return 0;

    mapping symbol = ([
        "name": name,
        "kind": "variable",
        "position": ([
            "file": filename,
            "line": tok[start_idx]->line
        ])
    ]);

    mapping|int parsed_type = parse_fallback_type_tokens(type_tokens);
    if (mappingp(parsed_type)) {
        symbol->type = parsed_type;
    }

    return symbol;
}

protected mapping|int type_to_json(object|void type) {
    if (!type) return 0;

    mapping result = ([]);

    catch {
        if (type->name) result->name = type->name;
    };

    // Check what type class this is
    string class_path = "";
    catch {class_path = Program.defined(object_program(type)) || "";};

    if (!result->name) {
        if (has_value(class_path, "IntType")) result->name = "int";
        else if (has_value(class_path, "StringType")) result->name = "string";
        else if (has_value(class_path, "FloatType")) result->name = "float";
        else if (has_value(class_path, "ArrayType")) result->name = "array";
        else if (has_value(class_path, "MappingType")) result->name = "mapping";
        else if (has_value(class_path, "MultisetType")) result->name = "multiset";
        else if (has_value(class_path, "FunctionType")) result->name = "function";
        else if (has_value(class_path, "ObjectType")) result->name = "object";
        else if (has_value(class_path, "ProgramType")) result->name = "program";
        else if (has_value(class_path, "MixedType")) result->name = "mixed";
        else if (has_value(class_path, "VoidType")) result->name = "void";
        else if (has_value(class_path, "ZeroType")) result->name = "zero";
        else if (has_value(class_path, "TypeType")) result->name = "type";
        else if (has_value(class_path, "OrType")) result->name = "or";
        else if (has_value(class_path, "AndType")) result->name = "and";
        else if (has_value(class_path, "VarargsType")) result->name = "varargs";
        else if (has_value(class_path, "AttributeType")) {
            result->name = "__attribute__";
            catch {
                if (type->attribute) result->attribute = type->attribute;
            };
            catch { if (type->type_or_type) result->type = type_to_json(type->type_or_type); };
            catch { if (!result->type && type->subtype) result->type = type_to_json(type->subtype); };
            catch { if (!result->type && type->type) result->type = type_to_json(type->type); };
        } else result->name = "unknown";
    }

    // Preserve __attribute__ wrapper in the JSON output and include inner type.
    if (result->name == "__attribute__" || has_value(class_path, "AttributeType")) {
        catch { if (type->attribute) result->attribute = type->attribute; };
        catch { if (!result->type && type->type_or_type) result->type = type_to_json(type->type_or_type); };
        catch { if (!result->type && type->subtype) result->type = type_to_json(type->subtype); };
        catch { if (!result->type && type->type) result->type = type_to_json(type->type); };
    }

    // Handle VarargsType: extract the element type (stored in 'type' field)
    if (result->name == "varargs" || has_value(class_path, "VarargsType")) {
        catch {
            if (type->type) {
                result->elementType = type_to_json(type->type);
            }
        };
    }

    // Handle FunctionType: extract argTypes and returnType
    if (result->name == "function" || has_value(class_path, "FunctionType")) {
        catch {
            if (type->argtypes && sizeof(type->argtypes) > 0) {
                result->argTypes = map(type->argtypes, type_to_json);
            }
        };
        catch {
            if (type->returntype) {
                result->returnType = type_to_json(type->returntype);
            }
        };
    }

    // Handle OrType: extract constituent types
    if (result->name == "or" || has_value(class_path, "OrType")) {
        result->name = "or";
        catch {
            if (type->types && sizeof(type->types) > 0) {
                result->types = map(type->types, type_to_json);
            }
        };
    }

    // Handle AndType (intersection): extract constituent types
    if (result->name == "and" || has_value(class_path, "AndType")) {
        result->name = "and";
        catch {
            if (type->types && sizeof(type->types) > 0) {
                result->types = map(type->types, type_to_json);
            }
        };
    }

    // Handle range bounds on IntType/StringType (e.g., int(0..255))
    if (result->name == "int" || result->name == "string") {
        catch {
            if (type->min && sizeof((string)type->min) > 0) {
                result->min = (string)type->min;
            }
        };
        catch {
            if (type->max && sizeof((string)type->max) > 0) {
                result->max = (string)type->max;
            }
        };
    }

    // Handle ObjectType: include classname (e.g., "this_program", "Gmp.mpz")
    if (result->name == "object" || has_value(class_path, "ObjectType")) {
        catch {
            if (type->classname && sizeof(type->classname) > 0) {
                result->className = type->classname;
            }
        };
        // Pike's internal "unknown" type often comes through as object("unknown").
        if (result->className == "unknown") {
            result->name = "unknown";
            m_delete(result, "className");
        }
    }

    // Handle ProgramType: include classname
    if (result->name == "program" || has_value(class_path, "ProgramType")) {
        catch {
            if (type->classname && sizeof(type->classname) > 0) {
                result->className = type->classname;
            }
        };
    }

    // Handle NamedType (typedef/name type): Pike returns "{ myint = int }" for typedefs
    // Check if this is a named type by looking for "=" in the type representation
    if (result->name && has_value(class_path, "NamedType")) {
        // This is a named/typedef type - extract the alias name and resolve to underlying type
        // Pike's typeof returns "{ alias = underlying }" format
        string type_str = sprintf("%O", type);
        if (has_value(type_str, "=")) {
            // Parse "{ name = underlying }" format
            // Extract the name before "="
            string name_part = "";
            string underlying_part = "";
            sscanf(type_str, "{%s=%s}", name_part, underlying_part);
            if (sizeof(name_part) && sizeof(underlying_part)) {
                result->name = "name";
                result->nameAlias = String.trim_all_whites(name_part);
                result->resolvedType = String.trim_all_whites(underlying_part);
            }
        }
    }

    return sizeof(result) > 0 ? result : 0;
}

//! Extract dynamic module loading patterns from Pike source code
//! Detects load_module() and compile_file() calls with string literal arguments
//! @param code The source code to analyze
//! @param filename The filename for position tracking
//! @returns Array of symbol mappings for dynamically loaded modules
protected array(mapping) extract_dynamic_modules(string code, string filename) {
    array(mapping) results = ({});

    // Use tokenization to find patterns
    mixed err = catch {
        array(string) tokens = Parser.Pike.split(code);
        array tok = Parser.Pike.tokenize(tokens);

        // Look for load_module( and compile_file( patterns
        for (int i = 0; i < sizeof(tok); i++) {
            object t = tok[i];
            string txt = t->text;

            // Check for load_module or compile_file function calls
            if (txt == "load_module" || txt == "compile_file") {
                // Look for opening parenthesis after function name
                int paren_idx = i + 1;
                while (paren_idx < sizeof(tok)) {
                    string next_txt = tok[paren_idx]->text;
                    // Skip whitespace
                    if (sizeof(next_txt) == 0 || next_txt[0] == ' ') {
                        paren_idx++;
                        continue;
                    }
                    if (next_txt == "(") {
                        // Found opening paren, now look for string literal argument
                        int arg_idx = paren_idx + 1;
                        while (arg_idx < sizeof(tok)) {
                            string arg_txt = tok[arg_idx]->text;
                            // Skip whitespace
                            if (sizeof(arg_txt) == 0 || arg_txt[0] == ' ') {
                                arg_idx++;
                                continue;
                            }
                            // Check for string literal
                            if (has_prefix(arg_txt, "\"") || has_prefix(arg_txt, "'")) {
                                // Extract the string content (strip quotes)
                                string module_path = arg_txt;
                                // Handle escaped quotes at the end
                                if (sizeof(module_path) >= 2) {
                                    // Find the ending quote (could be at position 0 or 1)
                                    int end_pos = -1;
                                    if (module_path[0] == '"' || module_path[0] == '\'') {
                                        // Search for closing quote from position 1
                                        int search_start = 1;
                                        while (search_start < sizeof(module_path)) {
                                            if (module_path[search_start] == module_path[0]) {
                                                // Check if it's escaped
                                                if (search_start == 0 || module_path[search_start - 1] != '\\') {
                                                    end_pos = search_start;
                                                    break;
                                                }
                                            }
                                            search_start++;
                                        }
                                        if (end_pos > 0) {
                                            module_path = module_path[1..end_pos - 1];
                                        }
                                    }
                                }

                                // Only add if we extracted a non-empty path
                                if (sizeof(module_path) > 0) {
                                    results += ({
                                        ([
                                            "name": module_path,
                                            "kind": txt == "load_module" ? "load_module" : "compile_file",
                                            "modifiers": ({}),
                                            "position": ([
                                                "file": filename,
                                                "line": t->line
                                            ]),
                                            "classname": module_path
                                        ])
                                    });
                                }
                                break;
                            }
                            // If we hit something other than whitespace and not a string, stop
                            break;
                        }
                        break;
                    }
                    // If not (, stop looking
                    break;
                }
            }
        }
    };

    // Log errors but continue - this is best-effort extraction
    if (err) {
        werror("extract_dynamic_modules: %O\n", describe_error(err));
    }

    return results;
}
