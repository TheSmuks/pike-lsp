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
}
