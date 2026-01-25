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

    // Extract autodoc comments from original code before preprocessing
    // Maps line number -> documentation string
    mapping(int:string) autodoc_by_line = extract_autodoc_comments(code);

    // Preprocess code: remove preprocessor directives that confuse PikeParser
    // We need to track nesting to properly handle conditional blocks
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
                        "kind": "import", // Treat #include as import for navigation
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

            if (parse_err) {
                autodoc_buffer = ({});
                parser->readToken();
                continue;
            }

            if (decl) {
                if (arrayp(decl)) {
                    string documentation = sizeof(autodoc_buffer) > 0 ? autodoc_buffer * "\n" : "";
                    autodoc_buffer = ({});

                    foreach(decl, mixed d) {
                        if (objectp(d)) {
                            mixed convert_err = catch {
                                symbols += ({symbol_to_json(d, documentation)});
                            };
                        }
                    }
                } else if (objectp(decl)) {
                    string decl_kind = get_symbol_kind(decl);

                    if (decl_kind != "class" && decl_kind != "enum") {
                        string documentation = sizeof(autodoc_buffer) > 0 ? autodoc_buffer * "\n" : "";
                        autodoc_buffer = ({});

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

                    parser->readToken();

                    mixed class_decl = decl;
                    string class_name = "";
                    if (objectp(decl)) {
                        catch {class_name = decl->name;};
                    }

                    int block_iter = 0;
                    array(string) member_autodoc_buffer = ({});
                    array(mapping) class_children = ({});

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
                                        mixed conv_err = catch {
                                            class_children += ({symbol_to_json(m, member_doc)});
                                        };
                                    }
                                }
                            } else if (objectp(member_decl)) {
                                mixed conv_err = catch {
                                    class_children += ({symbol_to_json(member_decl, member_doc)});
                                };
                            }
                        } else {
                            member_autodoc_buffer = ({});
                        }

                        parser->skipUntil((<";", "{", "}", "">));
                        if (parser->peekToken() == "{") {
                            parser->skipBlock();
                        }
                        if (parser->peekToken() == ";") {
                            parser->readToken();
                        }
                    }

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

                    while (brace_depth > 0 && parser->peekToken() != "" && body_iter++ < MAX_BLOCK_ITERATIONS) {
                        string token = parser->peekToken();

                        if (token == "}") {
                            brace_depth--;
                            parser->readToken();
                            continue;
                        }

                        if (token == "{") {
                            brace_depth++;
                            parser->readToken();
                            continue;
                        }

                        mixed local_decl;
                        mixed parse_err = catch {
                            local_decl = parser->parseDecl();
                        };

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
mapping tokenize_request(mapping params) {
    string code = params->code || "";
    array tokens = ({});

    // Access Parser.Pike via master()->resolv to avoid name conflict
    program PikeParserModule = master()->resolv("Parser.Pike");
    array(string) split_tokens = PikeParserModule->split(code);
    array pike_tokens = PikeParserModule->tokenize(split_tokens);

    foreach (pike_tokens, mixed t) {
        tokens += ({
            ([
                "text": t->text,
                "line": t->line,
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

// Protected helper methods
protected mapping(int:string) extract_autodoc_comments(string code) {
    mapping(int:string) result = ([]);
    array(string) lines = code / "\n";
    array(string) current_doc = ({});
    int doc_start_line = 0;

    for (int i = 0; i < sizeof(lines); i++) {
        string line = LSP.Compat.trim_whites(lines[i]);

        if (has_prefix(line, "//!")) {
            if (sizeof(current_doc) == 0) {
                doc_start_line = i + 1;
            }
            string doc_text = "";
            if (sizeof(line) > 3) {
                doc_text = line[3..];
                if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
                    doc_text = doc_text[1..];
                }
            }
            current_doc += ({doc_text});
        } else if (sizeof(current_doc) > 0) {
            result[i + 1] = current_doc * "\n";
            current_doc = ({});
        }
    }

    return result;
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
protected mapping simple_parse_autodoc(string doc) {
    if (!doc || sizeof(doc) == 0) return ([]);

    mapping result = ([
        "text": "",
        "params": ([]),
        // paramOrder will be set at the end to avoid O(n²) array copying
        "returns": "",
        "throws": "",
        "notes": ({}),
        "examples": ({}),
        "bugs": ({}),
        "seealso": ({}),
        "deprecated": ""
    ]);

    array(string) lines = doc / "\n";
    string current_section = "text";
    string current_param = "";
    array(string) text_buffer = ({});
    array(string) param_order = ({});  // Local array for tracking param order
    int ignoring = 0;

    // Macro for flushing buffer (Pike doesn't support local functions easily here)
    #define FLUSH_BUFFER() \
        if (sizeof(text_buffer) > 0) { \
            string content = text_buffer * "\n"; \
            if (current_section == "text") result->text = content; \
            else if (current_section == "param" && sizeof(current_param) > 0) result->params[current_param] = content; \
            else if (current_section == "returns") result->returns = content; \
            else if (current_section == "throws") result->throws = content; \
            else if (current_section == "example") result->examples += ({ content }); \
            else if (current_section == "bugs") result->bugs += ({ content }); \
            else if (current_section == "note") { \
                if (sizeof(result->notes) > 0) { \
                    if (result->notes[-1] == "") result->notes[-1] = content; \
                    else result->notes[-1] += "\n" + content; \
                } else result->notes += ({ content }); \
            } \
            else if (current_section == "seealso") { \
                array(string) parts = replace(content, "\n", ",") / ","; \
                foreach(parts, string part) { \
                    part = LSP.Compat.trim_whites(part); \
                    if (sizeof(part) > 0) result->seealso += ({ part }); \
                } \
            } \
            else if (current_section == "deprecated") { \
                if (result->deprecated == "" || result->deprecated == "Deprecated") result->deprecated = content; \
                else result->deprecated += "\n" + content; \
            } \
            text_buffer = ({}); \
        }

    foreach(lines, string line) {
        string trimmed = LSP.Compat.trim_whites(line);

        // Handle @ignore blocks
        if (has_prefix(trimmed, "@ignore")) {
            FLUSH_BUFFER(); // Flush anything before the ignore block
            ignoring = 1;
            continue;
        }
        if (has_prefix(trimmed, "@endignore")) {
            ignoring = 0;
            continue;
        }
        if (ignoring) continue;

        // Check for @tags
        if (has_prefix(trimmed, "@param")) {
            FLUSH_BUFFER();

            // Parse @param name description
            // Handle both "@param name" and "@param name description"
            string rest = trimmed[6..];
            if (sizeof(rest) > 0 && rest[0] == ' ') rest = LSP.Compat.trim_whites(rest);

            int space_pos = search(rest, " ");
            if (space_pos >= 0) {
                current_param = rest[..space_pos-1];
                text_buffer = ({ LSP.Compat.trim_whites(rest[space_pos+1..]) });
            } else {
                current_param = rest;
            }
            current_section = "param";
            result->params[current_param] = "";
            param_order += ({ current_param });  // Track order in local array

        } else if (has_prefix(trimmed, "@returns") || has_prefix(trimmed, "@return")) {
            FLUSH_BUFFER();

            string rest = "";
            if (has_prefix(trimmed, "@returns")) rest = trimmed[8..];
            else rest = trimmed[7..];

            rest = LSP.Compat.trim_whites(rest);
            if (sizeof(rest) > 0) text_buffer = ({ rest });
            current_section = "returns";

        } else if (has_prefix(trimmed, "@throws") || has_prefix(trimmed, "@exception")) {
            FLUSH_BUFFER();

            string rest = "";
            if (has_prefix(trimmed, "@throws")) rest = trimmed[7..];
            else rest = trimmed[10..];

            rest = LSP.Compat.trim_whites(rest);
            if (sizeof(rest) > 0) text_buffer = ({ rest });
            current_section = "throws";

        } else if (has_prefix(trimmed, "@example")) {
            FLUSH_BUFFER();
            current_section = "example";

        } else if (has_prefix(trimmed, "@bugs") || has_prefix(trimmed, "@bug")) {
            FLUSH_BUFFER();
            current_section = "bugs";

        } else if (has_prefix(trimmed, "@note")) {
            FLUSH_BUFFER();
            string note_text = sizeof(trimmed) > 5 ? LSP.Compat.trim_whites(trimmed[5..]) : "";
            result->notes += ({ note_text });
            current_section = "note";

        } else if (has_prefix(trimmed, "@seealso")) {
            FLUSH_BUFFER();
            string ref = LSP.Compat.trim_whites(trimmed[8..]);
            if (sizeof(ref) > 0) {
                array(string) parts = ref / ",";
                foreach(parts, string part) {
                    part = LSP.Compat.trim_whites(part);
                    if (sizeof(part) > 0) result->seealso += ({ part });
                }
            }
            current_section = "seealso";

        } else if (has_prefix(trimmed, "@deprecated")) {
            FLUSH_BUFFER();
            result->deprecated = sizeof(trimmed) > 11 ? LSP.Compat.trim_whites(trimmed[11..]) : "Deprecated";
            current_section = "deprecated";

        } else if (sizeof(trimmed) > 0) {
            // Regular text line - use full line to preserve indentation for examples
            // But strip first space if it exists (standard autodoc)
            string line_content = line;
            if (sizeof(line_content) > 0 && line_content[0] == ' ') line_content = line_content[1..];
            text_buffer += ({ line_content });
        } else {
            // Empty line
            text_buffer += ({ "" });
        }
    }

    FLUSH_BUFFER();

    // Set paramOrder once at the end (single allocation, not n times)
    if (sizeof(param_order) > 0) {
        result->paramOrder = param_order;
    }

    return result;
}

protected mapping symbol_to_json(object symbol, string|void documentation) {
    string kind = get_symbol_kind(symbol);

    mapping result = ([
        "name": symbol->name,
        "kind": kind,
        "modifiers": symbol->modifiers || ([]),
    ]);

    if (documentation && sizeof(documentation) > 0) {
        // Parse autodoc into structured format for TypeScript consumption
        result->documentation = simple_parse_autodoc(documentation);
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
        catch {
            if (symbol->classname) result->classname = symbol->classname;
        };
    }

    return result;
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
        else if (has_value(class_path, "OrType")) result->name = "or";
        else if (has_value(class_path, "VarargsType")) result->name = "varargs";
        else if (has_value(class_path, "AttributeType")) {
            result->name = "__attribute__";
            catch {
                if (type->attribute) result->attribute = type->attribute;
            };
            catch {
                if (type->subtype) return type_to_json(type->subtype);
                if (type->type) return type_to_json(type->type);
            };
        } else result->name = "unknown";
    }

    if (result->name == "__attribute__") {
        catch {
            if (type->type_or_type) return type_to_json(type->type_or_type);
            if (type->subtype) return type_to_json(type->subtype);
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

    // Handle ObjectType: include classname (e.g., "this_program", "Gmp.mpz")
    if (result->name == "object" || has_value(class_path, "ObjectType")) {
        catch {
            if (type->classname && sizeof(type->classname) > 0) {
                result->className = type->classname;
            }
        };
    }

    // Handle ProgramType: include classname
    if (result->name == "program" || has_value(class_path, "ProgramType")) {
        catch {
            if (type->classname && sizeof(type->classname) > 0) {
                result->className = type->classname;
            }
        };
    }

    return sizeof(result) > 0 ? result : 0;
}
