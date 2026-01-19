//! Intelligence.pike - Stateless intelligence class for Pike LSP
//!
//! Design per CONTEXT.md:
//! - Intelligence is stateless: all handlers are pure functions
//! - Intelligence uses LSP.Cache for all caching operations
//! - Intelligence uses LSP.Compat.trim_whites() for string operations
//! - Intelligence uses LSP.debug() for debug logging
//! - Handlers wrap errors in LSP.LSPError responses
//!
//! Use: import LSP.Intelligence; object I = Intelligence(); I->handle_introspect(...);

//! Intelligence class - Stateless introspection and resolution handlers
//! Use: import LSP.Intelligence; object I = Intelligence(); I->handle_introspect(...);
class Intelligence {
    //! Create a new Intelligence instance
    void create() {
        // No state to initialize (stateless pattern)
    }

    //! Introspect Pike code by compiling it and extracting symbol information
    //! @param params Mapping with "code" and "filename" keys
    //! @returns Mapping with "result" containing compilation results and symbols
    mapping handle_introspect(mapping params) {
        mixed err = catch {
            string code = params->code || "";
            string filename = params->filename || "input.pike";

            array diagnostics = ({});
            program compiled_prog;

            // Capture compilation errors
            void compile_error_handler(string file, int line, string msg) {
                diagnostics += ({
                    ([
                        "message": msg,
                        "severity": "error",
                        "position": ([ "file": file, "line": line ])
                    ])
                });
            };

            mixed old_error_handler = master()->get_inhibit_compile_errors();
            master()->set_inhibit_compile_errors(compile_error_handler);

            // Attempt compilation
            mixed compile_err = catch {
                compiled_prog = compile_string(code, filename);
            };

            master()->set_inhibit_compile_errors(old_error_handler);

            // If compilation failed, return diagnostics
            if (compile_err || !compiled_prog) {
                return ([
                    "result": ([
                        "success": 0,
                        "diagnostics": diagnostics,
                        "symbols": ({}),
                        "functions": ({}),
                        "variables": ({}),
                        "classes": ({}),
                        "inherits": ({})
                    ])
                ]);
            }

            // Cache the compiled program using LSP.Cache
            LSP.Cache.put("program_cache", filename, compiled_prog);

            // Extract type information
            mapping result = introspect_program(compiled_prog);
            result->success = 1;
            result->diagnostics = diagnostics;

            return ([ "result": result ]);
        };

        if (err) {
            return LSP.LSPError(-32000, describe_error(err))->to_response();
        }
    }

    //! Introspect a compiled program to extract symbols
    //! @param prog The compiled program to introspect
    //! @returns Mapping containing symbols, functions, variables, classes, inherits
    protected mapping introspect_program(program prog) {
        mapping result = ([
            "symbols": ({}),
            "functions": ({}),
            "variables": ({}),
            "classes": ({}),
            "inherits": ({})
        ]);

        // Try to instantiate
        object instance;
        catch { instance = prog(); };

        if (!instance) {
            // Can't instantiate - just get inheritance
            array inherit_list = ({});
            catch { inherit_list = Program.inherit_list(prog) || ({}); };

            foreach (inherit_list, program parent_prog) {
                string parent_path = "";
                catch { parent_path = Program.defined(parent_prog) || ""; };
                result->inherits += ({ ([ "path": parent_path ]) });
            }

            return result;
        }

        // Get symbols
        array(string) symbol_names = ({});
        array symbol_values = ({});
        catch { symbol_names = indices(instance); };
        catch { symbol_values = values(instance); };

        // Extract each symbol
        for (int i = 0; i < sizeof(symbol_names); i++) {
            string name = symbol_names[i];
            mixed value = i < sizeof(symbol_values) ? symbol_values[i] : 0;

            string kind = "variable";
            mapping type_info = ([ "kind": "mixed" ]);

            if (functionp(value)) {
                kind = "function";
                type_info = ([ "kind": "function" ]);

                // Try to extract function signature from _typeof()
                mixed type_val;
                catch { type_val = _typeof(value); };
                if (type_val) {
                    string type_str = sprintf("%O", type_val);
                    // Parse: function(type1, type2, ... : returnType)
                    int paren_start = search(type_str, "(");
                    int colon_pos = search(type_str, " : ");
                    if (paren_start >= 0 && colon_pos > paren_start) {
                        string args_str = type_str[paren_start+1..colon_pos-1];
                        string ret_str = type_str[colon_pos+3..<1];

                        // Parse arguments (split by comma, but respect nested parens)
                        array(string) arg_types = ({});
                        string current = "";
                        int depth = 0;
                        foreach (args_str / "", string c) {
                            if (c == "(" || c == "<") depth++;
                            else if (c == ")" || c == ">") depth--;
                            else if (c == "," && depth == 0) {
                                arg_types += ({ LSP.Compat.trim_whites(current) });
                                current = "";
                                continue;
                            }
                            current += c;
                        }
                        if (sizeof(LSP.Compat.trim_whites(current)) > 0) {
                            arg_types += ({ LSP.Compat.trim_whites(current) });
                        }

                        // Build arguments array with placeholder names
                        array(mapping) arguments = ({});
                        for (int j = 0; j < sizeof(arg_types); j++) {
                            string arg_type = arg_types[j];
                            // Skip "void" only arguments (optional params start with "void |")
                            if (arg_type == "void") continue;
                            arguments += ({
                                ([ "name": "arg" + (j + 1), "type": arg_type ])
                            });
                        }

                        type_info->arguments = arguments;
                        type_info->returnType = ret_str;
                        type_info->signature = type_str;
                    }
                }
            } else if (intp(value)) {
                type_info = ([ "kind": "int" ]);
            } else if (stringp(value)) {
                type_info = ([ "kind": "string" ]);
            } else if (floatp(value)) {
                type_info = ([ "kind": "float" ]);
            } else if (arrayp(value)) {
                type_info = ([ "kind": "array" ]);
            } else if (mappingp(value)) {
                type_info = ([ "kind": "mapping" ]);
            } else if (multisetp(value)) {
                type_info = ([ "kind": "multiset" ]);
            } else if (objectp(value)) {
                type_info = ([ "kind": "object" ]);
            } else if (programp(value)) {
                kind = "class";
                type_info = ([ "kind": "program" ]);
            }

            mapping symbol = ([
                "name": name,
                "type": type_info,
                "kind": kind,
                "modifiers": ({})
            ]);

            result->symbols += ({ symbol });

            if (kind == "function") {
                result->functions += ({ symbol });
            } else if (kind == "variable") {
                result->variables += ({ symbol });
            } else if (kind == "class") {
                result->classes += ({ symbol });
            }
        }

        // Get inheritance
        array inherit_list = ({});
        catch { inherit_list = Program.inherit_list(prog) || ({}); };

        foreach (inherit_list, program parent_prog) {
            string parent_path = "";
            catch { parent_path = Program.defined(parent_prog) || ""; };
            result->inherits += ({ ([ "path": parent_path ]) });
        }

        return result;
    }

    //! Resolve module path to file system location
    //! @param params Mapping with "module" and "currentFile" keys
    //! @returns Mapping with "result" containing "path" and "exists"
    mapping handle_resolve(mapping params) {
        mixed err = catch {
            string module_path = params->module || "";
            string current_file = params->currentFile || "";

            if (sizeof(module_path) == 0) {
                return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
            }

            // Handle local modules (starting with .)
            if (has_prefix(module_path, ".")) {
                string local_name = module_path[1..]; // Remove leading dot

                if (sizeof(current_file) > 0 && sizeof(local_name) > 0) {
                    // Get directory of current file
                    string current_dir = dirname(current_file);

                    LSP.debug("LOCAL MODULE RESOLVE: .%s\n", local_name);
                    LSP.debug("  Current file: %s\n", current_file);
                    LSP.debug("  Current dir:  %s\n", current_dir);

                    // Try .pike file first
                    string pike_file = combine_path(current_dir, local_name + ".pike");
                    LSP.debug("  Trying: %s -> %s\n", pike_file, file_stat(pike_file) ? "EXISTS" : "NOT FOUND");
                    if (file_stat(pike_file)) {
                        return ([
                            "result": ([ "path": pike_file, "exists": 1 ])
                        ]);
                    }

                    // Try .pmod file
                    string pmod_file = combine_path(current_dir, local_name + ".pmod");
                    LSP.debug("  Trying: %s -> %s\n", pmod_file, file_stat(pmod_file) ? "EXISTS" : "NOT FOUND");
                    if (file_stat(pmod_file) && !file_stat(pmod_file)->isdir) {
                        return ([
                            "result": ([ "path": pmod_file, "exists": 1 ])
                        ]);
                    }

                    // Try .pmod directory with module.pmod
                    string pmod_dir = combine_path(current_dir, local_name + ".pmod");
                    LSP.debug("  Trying: %s -> %s\n", pmod_dir, file_stat(pmod_dir) ? "EXISTS" : "NOT FOUND");
                    if (file_stat(pmod_dir) && file_stat(pmod_dir)->isdir) {
                        string module_file = combine_path(pmod_dir, "module.pmod");
                        if (file_stat(module_file)) {
                            return ([
                                "result": ([ "path": module_file, "exists": 1 ])
                            ]);
                        }
                        return ([
                            "result": ([ "path": pmod_dir, "exists": 1 ])
                        ]);
                    }
                }

                return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
            }

            // For non-local modules, use Pike's native resolution
            mixed resolved = master()->resolv(module_path);
            if (resolved) {
                string source_path = get_module_path(resolved);
                return ([
                    "result": ([
                        "path": sizeof(source_path) ? source_path : 0,
                        "exists": sizeof(source_path) ? 1 : 0
                    ])
                ]);
            }

            return ([ "result": ([ "path": 0, "exists": 0 ]) ]);
        };

        if (err) {
            return LSP.LSPError(-32000, describe_error(err))->to_response();
        }
    }

    //! Get the source file path for a resolved module
    //! Uses Pike's native module resolution instead of heuristics
    //! Handles dirnodes (directory modules), joinnodes (merged modules),
    //! and regular programs/objects.
    //! @param resolved The resolved module object or program
    //! @returns The source file path, or empty string if not found
    protected string get_module_path(mixed resolved) {
        if (!resolved) return "";

        // Handle objects (most modules resolve to objects)
        if (objectp(resolved)) {
            program obj_prog = object_program(resolved);

            // Handle joinnodes first (merged module paths from multiple sources)
            // These wrap dirnodes, so check first
            if (obj_prog->is_resolv_joinnode) {
                // Return first valid path from joined modules
                array joined = ({});
                catch { joined = resolved->joined_modules || ({}); };
                foreach(joined, mixed m) {
                    string path = get_module_path(m);
                    if (sizeof(path)) return path;
                }
            }

            // Handle dirnodes (like Crypto.pmod/)
            // Pike creates these for .pmod directories
            if (obj_prog->is_resolv_dirnode) {
                // Get the dirname from the dirnode
                string dirname = "";
                catch { dirname = resolved->dirname || ""; };

                // Fall back to module.pmod in the directory
                if (sizeof(dirname)) {
                    string module_file = combine_path(dirname, "module.pmod");
                    if (file_stat(module_file)) return module_file;
                    return dirname;
                }
            }

            // Regular object - get its program's definition
            catch {
                string path = Program.defined(obj_prog);
                if (path && sizeof(path)) return path;
            };
        }

        // Handle programs directly
        if (programp(resolved)) {
            catch {
                string path = Program.defined(resolved);
                if (path && sizeof(path)) return path;
            };
        }

        return "";
    }

    //! Resolve stdlib module and extract symbols with documentation
    //! Uses LSP.Cache for stdlib data caching with flat module name keys.
    //!
    //! @param params Mapping with "module" key (fully qualified module name)
    //! @returns Mapping with "result" containing module symbols and documentation
    //!
    //! Implements two-cache architecture:
    //! - Stdlib cache: flat by module name, on-demand loading, never invalidated during session
    //! - Symbols merged from runtime introspection and source file parsing
    //! - Documentation parsed from AutoDoc comments and merged into results
    //!
    //! Per CONTEXT.md decision:
    //! - Cache check happens before resolution (returns cached data if available)
    //! - Line number suffix is stripped from Program.defined() paths
    mapping handle_resolve_stdlib(mapping params) {
        mixed err = catch {
            string module_path = params->module || "";

            if (sizeof(module_path) == 0) {
                return ([ "result": ([ "found": 0, "error": "No module path" ]) ]);
            }

            // Check cache first - flat module name key per CONTEXT.md decision
            mapping cached = LSP.Cache.get("stdlib_cache", module_path);
            if (cached) {
                return ([ "result": cached ]);
            }

            // Resolve using master()->resolv()
            mixed resolved;
            mixed resolve_err = catch {
                resolved = master()->resolv(module_path);
            };

            if (resolve_err || !resolved) {
                return ([
                    "result": ([
                        "found": 0,
                        "error": resolve_err ? describe_error(resolve_err) : "Module not found"
                    ])
                ]);
            }

            // Get program for introspection
            program prog;
            if (objectp(resolved)) {
                prog = object_program(resolved);
            } else if (programp(resolved)) {
                prog = resolved;
            } else {
                return ([ "result": ([ "found": 0, "error": "Not a program" ]) ]);
            }

            // Use native module path resolution (reuses shared helper)
            string source_path = get_module_path(resolved);

            // Introspect
            mapping introspection = introspect_program(prog);

            // Parse source file to get all exported symbols (not just introspected ones)
            if (sizeof(source_path) > 0) {
                string code;
                mixed read_err = catch {
                    // Clean up path - remove line number suffix if present
                    // Pitfall 2 from RESEARCH.md: Program.defined() returns paths with line numbers
                    string clean_path = source_path;
                    if (has_value(clean_path, ":")) {
                        array parts = clean_path / ":";
                        // Check if last part is a number (line number)
                        if (sizeof(parts) > 1 && sizeof(parts[-1]) > 0) {
                            int is_line_num = 1;
                            foreach(parts[-1] / "", string c) {
                                if (c < "0" || c > "9") { is_line_num = 0; break; }
                            }
                            if (is_line_num) {
                                clean_path = parts[..sizeof(parts)-2] * ":";
                            }
                        }
                    }
                    code = Stdio.read_file(clean_path);
                };

                if (code && sizeof(code) > 0) {
                    // Parse the file to get all symbols using Parser class
                    program ParserClass = master()->resolv("LSP.Parser")->Parser;
                    object parser = ParserClass();
                    mapping parse_params = ([ "code": code, "filename": source_path ]);
                    mapping parse_response = parser->parse_request(parse_params);

                    // parse_request returns { "result": { "symbols": [...], "diagnostics": [...] } }
                    if (parse_response && parse_response->result &&
                        parse_response->result->symbols && sizeof(parse_response->result->symbols) > 0) {
                        array parsed_symbols = parse_response->result->symbols;

                        // Merge parsed symbols into introspection
                        // Add any new symbols that weren't in introspection
                        if (!introspection->symbols) {
                            introspection->symbols = ({});
                        }

                        // Create a set of introspected symbol names for quick lookup
                        multiset(string) introspected_names =
                            (multiset)(map(introspection->symbols, lambda(mapping s) { return s->name; }));

                        // Add parsed symbols that weren't in introspection
                        foreach(parsed_symbols, mapping sym) {
                            string name = sym->name;
                            if (name && !introspected_names[name]) {
                                introspection->symbols += ({ sym });
                                introspected_names[name] = 1;
                            }
                        }
                    }

                    // Parse documentation and merge it
                    mapping docs = parse_stdlib_documentation(source_path);
                    if (docs && sizeof(docs) > 0) {
                        // Merge documentation into introspected symbols
                        introspection = merge_documentation(introspection, docs);
                    }
                }
            }

            mapping result = ([ "found": 1, "path": source_path, "module": module_path ]) + introspection;

            // Cache using LSP.Cache (LRU eviction handled by Cache.pmod)
            LSP.Cache.put("stdlib_cache", module_path, result);

            return ([ "result": result ]);
        };

        if (err) {
            return LSP.LSPError(-32000, describe_error(err))->to_response();
        }
    }

    //! Parse stdlib source file for autodoc documentation
    //! Returns mapping of symbol name -> documentation mapping
    //!
    //! @param source_path Path to the stdlib source file (may have line number suffix)
    //! @returns Mapping of symbol name to parsed documentation
    //!
    //! Uses extract_autodoc_comments and extract_symbol_name helpers.
    protected mapping parse_stdlib_documentation(string source_path) {
        mapping docs = ([]);

        // Clean up path - remove line number suffix if present
        // Pitfall 2 from RESEARCH.md: Program.defined() returns paths with line numbers
        string clean_path = source_path;
        if (has_value(clean_path, ":")) {
            array parts = clean_path / ":";
            // Check if last part is a number (line number)
            if (sizeof(parts) > 1 && sizeof(parts[-1]) > 0) {
                int is_line_num = 1;
                foreach(parts[-1] / "", string c) {
                    if (c < "0" || c > "9") { is_line_num = 0; break; }
                }
                if (is_line_num) {
                    clean_path = parts[..sizeof(parts)-2] * ":";
                }
            }
        }

        // Try to read the source file
        string code;
        mixed read_err = catch {
            code = Stdio.read_file(clean_path);
        };

        if (read_err || !code || sizeof(code) == 0) {
            return docs;
        }

        // Parse using Tools.AutoDoc.PikeParser
        mixed parse_err = catch {
            // Extract autodoc comments
            mapping(int:string) autodoc_by_line = extract_autodoc_comments(code);

            // Use simple regex-based extraction for function/method documentation
            // Look for patterns like: //! @decl type name(args)
            // or autodoc blocks followed by function definitions

            array(string) lines = code / "\n";
            string current_doc = "";

            for (int i = 0; i < sizeof(lines); i++) {
                string line = lines[i];
                string trimmed = LSP.Compat.trim_whites(line);

                // Collect autodoc comments
                if (has_prefix(trimmed, "//!")) {
                    if (sizeof(current_doc) > 0) {
                        current_doc += "\n" + trimmed[3..];
                    } else {
                        current_doc = trimmed[3..];
                    }
                    continue;
                }

                // If we have accumulated docs and hit a non-doc line, try to associate
                if (sizeof(current_doc) > 0) {
                    // Look for function/method definition
                    // Pattern: type name( or PIKEFUN type name(
                    string name = extract_symbol_name(trimmed);
                    if (sizeof(name) > 0) {
                        docs[name] = parse_autodoc(current_doc);
                    }
                    current_doc = "";
                }
            }
        };

        return docs;
    }

    //! Extract autodoc comments from source code
    //! Returns mapping of declaration line -> documentation text
    //!
    //! @param code Source code to extract comments from
    //! @returns Mapping of line number to documentation text
    protected mapping(int:string) extract_autodoc_comments(string code) {
        mapping(int:string) result = ([]);
        array(string) lines = code / "\n";

        array(string) current_doc = ({});
        int doc_start_line = 0;

        for (int i = 0; i < sizeof(lines); i++) {
            string line = LSP.Compat.trim_whites(lines[i]);

            if (has_prefix(line, "//!")) {
                // Autodoc comment line
                if (sizeof(current_doc) == 0) {
                    doc_start_line = i + 1;
                }
                // Extract text after //!
                string doc_text = "";
                if (sizeof(line) > 3) {
                    doc_text = line[3..];
                    if (sizeof(doc_text) > 0 && doc_text[0] == ' ') {
                        doc_text = doc_text[1..]; // Remove leading space
                    }
                }
                current_doc += ({ doc_text });
            } else if (sizeof(current_doc) > 0) {
                // Non-comment line after doc block - this is the declaration
                // Store doc for this line (the declaration line)
                result[i + 1] = current_doc * "\n";
                current_doc = ({});
            }
        }

        return result;
    }

    //! Extract symbol name from a line that might be a function definition
    //!
    //! @param line Line of code that may contain a function definition
    //! @returns The extracted symbol name, or empty string if not found
    //!
    //! Handles both Pike function definitions (type name()) and
    //! PIKEFUN patterns from C modules (PIKEFUN type name()).
    protected string extract_symbol_name(string line) {
        // Skip preprocessor and empty lines
        if (sizeof(line) == 0 || line[0] == '#') return "";

        // PIKEFUN type name( pattern (for C files)
        if (has_value(line, "PIKEFUN")) {
            // PIKEFUN return_type name(
            string ret_type, name;
            if (sscanf(line, "%*sPIKEFUN%*[ \t]%s%*[ \t]%s(%*s", ret_type, name) == 2) {
                if (name) return name;
            }
        }

        // Look for patterns like: type name( or modifiers type name(
        // Match: optional_modifiers type name(
        array(string) tokens = ({});
        string current = "";

        foreach(line / "", string c) {
            if (c == "(") {
                if (sizeof(current) > 0) tokens += ({ LSP.Compat.trim_whites(current) });
                break;
            } else if (c == " " || c == "\t") {
                if (sizeof(current) > 0) {
                    tokens += ({ LSP.Compat.trim_whites(current) });
                    current = "";
                }
            } else {
                current += c;
            }
        }

        // The function name is typically the last token before (
        // Filter out modifiers and type keywords
        multiset(string) skip = (<
            "static", "public", "private", "protected", "final", "inline",
            "local", "optional", "variant", "nomask", "extern",
            "int", "float", "string", "array", "mapping", "multiset",
            "object", "function", "program", "mixed", "void", "zero", "auto"
        >);

        for (int i = sizeof(tokens) - 1; i >= 0; i--) {
            string tok = tokens[i];
            // Skip type annotations like array(int)
            if (has_value(tok, "(") || has_value(tok, ")")) continue;
            if (has_value(tok, "<") || has_value(tok, ">")) continue;
            if (has_value(tok, "|")) continue;
            if (skip[tok]) continue;
            if (sizeof(tok) > 0 && (tok[0] >= 'a' && tok[0] <= 'z' ||
                                  tok[0] >= 'A' && tok[0] <= 'Z' ||
                                  tok[0] == '_')) {
                return tok;
            }
        }

        return "";
    }

    //! Merge documentation into introspected symbols
    //!
    //! @param introspection The introspection result mapping
    //! @param docs Mapping of symbol name -> documentation
    //! @returns Updated introspection with documentation merged in
    //!
    //! Merges documentation into symbols, functions, and variables arrays.
    protected mapping merge_documentation(mapping introspection, mapping docs) {
        if (!introspection || !docs) return introspection;

        // Merge into symbols array
        if (introspection->symbols) {
            foreach(introspection->symbols; int idx; mapping sym) {
                string name = sym->name;
                if (name && docs[name]) {
                    introspection->symbols[idx] = sym + ([ "documentation": docs[name] ]);
                }
            }
        }

        // Merge into functions array
        if (introspection->functions) {
            foreach(introspection->functions; int idx; mapping sym) {
                string name = sym->name;
                if (name && docs[name]) {
                    introspection->functions[idx] = sym + ([ "documentation": docs[name] ]);
                }
            }
        }

        // Merge into variables array
        if (introspection->variables) {
            foreach(introspection->variables; int idx; mapping sym) {
                string name = sym->name;
                if (name && docs[name]) {
                    introspection->variables[idx] = sym + ([ "documentation": docs[name] ]);
                }
            }
        }

        return introspection;
    }
}
