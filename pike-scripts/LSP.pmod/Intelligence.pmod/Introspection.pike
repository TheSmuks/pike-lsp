//! Introspection.pike - Symbol extraction and introspection handlers
//!
//! This file provides handlers for introspecting Pike code to extract
//! symbols, types, and structure information.
//!
//! Design pattern:
//! - create(object ctx) constructor for context injection
//! - Handlers wrap errors in catch blocks with LSPError responses
//! - Uses LSP.Cache for caching compiled programs
//! - Uses LSP.Compat.trim_whites() for string operations
//! - Uses helper functions from module.pmod directly

// Import sibling modules for access to their exports
constant Cache = LSP.Cache;

//! Bootstrap modules used internally by the resolver.
//! These modules cannot be resolved using the normal path because
//! they are used during the resolution process itself, causing
//! circular dependency if we try to resolve them.
//!
//! IMPORTANT: Stdio is used for reading source files during introspection.
//! Using Stdio.read_file() triggers module resolution, causing infinite
//! recursion when resolving Stdio itself. Use Stdio.FILE()->read() instead.
constant BOOTSTRAP_MODULES = (<
    "Stdio",     // Used for file I/O during source parsing
    "String",    // May be used for string operations
    "Array",     // Core type used throughout
    "Mapping",   // Core type used throughout
>);

private object context;

//! Create a new Introspection instance
//! @param ctx Optional context object (reserved for future use)
void create(object ctx) {
    context = ctx;
}

//! Check if a filename is within the LSP.pmod module directory
//! @param filename The file path to check
//! @returns 1 if the file is part of LSP.pmod, 0 otherwise
protected int is_lsp_module_file(string filename) {
    // Normalize path separators
    string normalized = replace(filename, "\\", "/");
    // Check if path contains LSP.pmod
    return has_value(normalized / "/", "LSP.pmod");
}

//! Convert a file path within LSP.pmod to a module name for resolv()
//! @param filename The file path (e.g., "/path/to/LSP.pmod/Parser.pike")
//! @returns Module name (e.g., "LSP.Parser") or empty string if not a valid LSP module file
protected string path_to_module_name(string filename) {
    // Normalize path separators
    string normalized = replace(filename, "\\", "/");

    // Find LSP.pmod in the path
    int lsp_pos = search(normalized, "LSP.pmod/");
    if (lsp_pos == -1) {
        return "";
    }

    // Extract the part after LSP.pmod/
    string after_lsp = normalized[lsp_pos + 10..];

    // Get the filename without extension
    array parts = after_lsp / "/";
    if (sizeof(parts) == 0) {
        return "";
    }

    string file = parts[-1];
    // Remove .pike or .pmod extension
    if (has_suffix(file, ".pike")) {
        file = file[..<5];
    } else if (has_suffix(file, ".pmod")) {
        file = file[..<6];
    }

    // Build module name: "LSP.Parser" or "LSP.Compat" or "LSP.module"
    // For nested modules like "LSP.pmod/Foo.pmod/Bar.pike", we'd need more complex logic
    // But current structure is flat: LSP.pmod/{Parser,Intelligence,Analysis,Compat,Cache,module}.{pike,pmod}
    return "LSP." + file;
}

//! Check if a filename is within a .pmod module directory
//! @param filename The file path to check
//! @returns 1 if the file is inside a .pmod directory, 0 otherwise
protected int is_in_pmod_directory(string filename) {
    string normalized = replace(filename, "\\", "/");
    array path_parts = normalized / "/";
    for (int i = 0; i < sizeof(path_parts); i++) {
        if (has_suffix(path_parts[i], ".pmod")) {
            return 1;
        }
    }
    return 0;
}

//! Extract the parent module name for a file in a .pmod directory
//! @param filename The file path (e.g., "/path/to/Crypto.pmod/RSA.pmod")
//! @returns Module name (e.g., "Crypto") or empty string if not in a .pmod directory
protected string get_parent_module_name(string filename) {
    string normalized = replace(filename, "\\", "/");
    array path_parts = normalized / "/";

    // Find the .pmod directory in the path
    for (int i = 0; i < sizeof(path_parts); i++) {
        if (has_suffix(path_parts[i], ".pmod")) {
            // Extract module name (e.g., "Crypto.pmod" -> "Crypto")
            string mod_dir = path_parts[i];
            if (has_suffix(mod_dir, ".pmod")) {
                mod_dir = mod_dir[..<6];
            }
            return mod_dir;
        }
    }
    return "";
}

//! Preprocess code to convert relative module references to absolute paths
//! This allows files in .pmod directories to compile without sibling modules.
//! @param code Source code with potential relative references (e.g., "inherit .Random;")
//! @param module_name Parent module name (e.g., "Crypto")
//! @returns Preprocessed code with absolute references (e.g., "inherit Crypto.Random;")
protected string preprocess_relative_references(string code, string module_name) {
    if (!module_name || sizeof(module_name) == 0) {
        return code;
    }

    string result = "";
    foreach(code / "\n", string line) {
        string trimmed = LSP.Compat.trim_whites(line);

        // Pattern: inherit .ModuleName
        if (sscanf(trimmed, "inherit .%s", string rest) == 1) {
            // Extract the module name (stop at semicolon, space, or comment)
            string sibling_name = "";
            for (int i = 0; i < sizeof(rest); i++) {
                string c = rest[i..i];
                if (c == ";" || c == " " || c == "/" || c == "{" || c == "}") {
                    break;
                }
                sibling_name += c;
            }

            if (sizeof(sibling_name) > 0) {
                // Replace .Sibling with Module.Sibling
                string replacement = "inherit " + module_name + "." + sibling_name;
                result += replacement + (sizeof(rest) > sizeof(sibling_name) ? rest[sizeof(sibling_name)..] : ";") + "\n";
                continue;
            }
        }

        // Pattern: .Module.member (e.g., .Random.random_string)
        // This is harder - we'd need to parse expressions. For now, keep as-is.
        // The inherit conversion handles most compilation issues.

        result += line + "\n";
    }

    return result;
}

//! Introspect Pike code using parser only (no compilation)
//!
//! This is used for files with #require directives that trigger expensive
//! module loading during compilation, causing timeouts.
//!
//! IMPORTANT: Does NOT call master()->resolv() to avoid triggering
//! module resolution that can cause circular dependencies.
//!
//! @param params Mapping with "code" and "filename" keys
//! @returns Mapping with "result" containing minimal symbol information
protected mapping handle_introspect_parser_only(mapping params) {
    string code = params->code || "";
    string filename = params->filename || "input.pike";

    werror("[DEBUG] handle_introspect_parser_only: filename=%s (returning empty result to avoid timeout)\n", filename);

    // Return minimal result without any module resolution
    // This prevents the timeout that occurs when trying to resolve modules
    // with #require directives during compilation
    return ([
        "result": ([
            "success": 1,
            "diagnostics": ({}),
            "symbols": ({}),
            "functions": ({}),
            "variables": ({}),
            "classes": ({}),
            "inherits": ({}),
            "parser_only": 1,
            "require_directive_skipped": 1  // Flag indicating we skipped #require processing
        ])
    ]);
}

//! Introspect Pike code by compiling it and extracting symbol information
//! @param params Mapping with "code" and "filename" keys
//! @returns Mapping with "result" containing compilation results and symbols
mapping handle_introspect(mapping params) {
    mixed err = catch {
        string code = params->code || "";
        string filename = params->filename || "input.pike";

        werror("[DEBUG] handle_introspect called: filename=%s, code_length=%d\n", filename, sizeof(code));

        // Check for #require directives - these trigger expensive module loading
        // during compilation and can cause timeouts. For such files, use parser-based
        // extraction instead of compilation.
        int has_require_directives = 0;
        if (has_value(code, "#require")) {
            // Check if it's actually a #require directive (not in a comment or string)
            array lines = code / "\n";
            foreach (lines, string line) {
                string trimmed = LSP.Compat.trim_whites(line);
                // Skip comments
                if (sizeof(trimmed) > 0 && trimmed[0] == '#') {
                    if (has_prefix(trimmed, "#require")) {
                        has_require_directives = 1;
                        werror("[DEBUG] File has #require directive, using parser-based extraction\n");
                        break;
                    }
                }
            }
        }

        // For files with #require, use parser-based extraction to avoid timeout
        if (has_require_directives) {
            werror("[DEBUG] Using parser-based extraction for: %s\n", filename);
            return handle_introspect_parser_only(params);
        }

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

        // Check if file is in a .pmod directory and preprocess for relative references
        string code_to_compile = code;
        if (is_in_pmod_directory(filename)) {
            string module_name = get_parent_module_name(filename);
            if (sizeof(module_name) > 0) {
                werror("[DEBUG] File in .pmod directory, module=%s, preprocessing relative references\n", module_name);
                code_to_compile = preprocess_relative_references(code, module_name);
            }
        }

        // Attempt compilation
        // For LSP module files, use master()->resolv() to get the compiled program
        // with proper module context. For other files, use compile_string().
        werror("[DEBUG] About to compile: filename=%s\n", filename);
        mixed compile_err = catch {
            if (is_lsp_module_file(filename)) {
                werror("[DEBUG] File is LSP module file\n");
                string module_name = path_to_module_name(filename);
                if (sizeof(module_name) > 0) {
                    werror("[DEBUG] Resolving module: %s\n", module_name);
                    // Resolve via module system - LSP namespace is available
                    mixed resolved = master()->resolv(module_name);
                    if (resolved && programp(resolved)) {
                        // For LSP.* modules, resolv returns the program directly
                        // e.g., LSP.Parser -> Parser program
                        compiled_prog = resolved;
                    } else {
                        // Fallback: try to compile normally
                        compiled_prog = compile_string(code_to_compile, filename);
                    }
                } else {
                    compiled_prog = compile_string(code_to_compile, filename);
                }
            } else {
                // Normal file - compile directly (may be preprocessed if in .pmod)
                compiled_prog = compile_string(code_to_compile, filename);
            }
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
        werror("[DEBUG] Compilation successful, about to introspect\n");
        Cache.put("program_cache", filename, compiled_prog);

        // Extract type information
        werror("[DEBUG] About to call introspect_program\n");
        mapping result = introspect_program(compiled_prog);
        werror("[DEBUG] introspect_program completed, symbols=%d\n", sizeof(result->symbols || ({})));
        result->success = 1;
        result->diagnostics = diagnostics;

        werror("[DEBUG] handle_introspect returning success\n");
        return ([ "result": result ]);
    };

    if (err) {
        return LSP.module.LSPError(-32000, describe_error(err))->to_response();
    }
}

//! Safely instantiate a program with timeout protection
//!
//! Some modules have #require directives or complex dependencies that can
//! cause circular dependencies or timeout during instantiation. This function
//! attempts to instantiate but returns 0 if it takes too long or fails.
//!
//! @param prog The program to instantiate
//! @returns The instantiated object or 0 if instantiation failed/timed out
protected object safe_instantiate(program prog) {
    if (!prog) return 0;

    // Try instantiation with error handling
    mixed err = catch {
        object instance = prog();
        return instance;
    };

    // If instantiation fails, return 0
    // This handles modules with #require directives that trigger
    // circular module resolution (e.g., Crypto.PGP with #require constant(Crypto.HashState))
    return 0;
}

//! Introspect a compiled program to extract symbols
//! @param prog The compiled program to introspect
//! @returns Mapping containing symbols, functions, variables, classes, inherits
//!
//! IMPORTANT: Uses safe_instantiate() to prevent timeout crashes when
//! introspecting modules with complex dependencies (e.g., Crypto.PGP
//! which has #require directives that trigger module loading).
mapping introspect_program(program prog) {
    mapping result = ([
        "symbols": ({}),
        "functions": ({}),
        "variables": ({}),
        "classes": ({}),
        "inherits": ({})
    ]);

    // Try to instantiate using safe method with timeout protection
    // Some modules (like Crypto.PGP) have #require directives that trigger
    // module loading, which can cause circular dependencies or timeouts
    object instance = safe_instantiate(prog);

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

    // Get inheritance
    array inherit_list = ({});
    catch { inherit_list = Program.inherit_list(prog) || ({}); };
    mapping(string:string) inherited_symbols = ([]);

    // Pre-scan inherits to map symbols to parents
    foreach (inherit_list, program parent_prog) {
        string parent_path = "";
        catch { parent_path = Program.defined(parent_prog) || ""; };
        result->inherits += ({ ([ "path": parent_path ]) });

        // Identify parent name
        string parent_name = parent_path;
        if (sizeof(parent_name) > 0) {
            array parts = parent_name / "/";
            string fname = parts[-1];
            if (has_suffix(fname, ".pike")) fname = fname[..<5];
            else if (has_suffix(fname, ".pmod")) fname = fname[..<6];
            parent_name = fname;
        } else {
            parent_name = sprintf("%O", parent_prog);
            // Cleanup /main()->Name or similar
            if (has_value(parent_name, "->")) {
                parent_name = (parent_name / "->")[-1];
            }
        }

        // Extract symbols from parent to build inheritance map
        // We use safe_instantiate to avoid crashes
        object parent_inst = safe_instantiate(parent_prog);
        if (parent_inst) {
            array(string) p_syms = ({});
            catch { p_syms = indices(parent_inst); };
            foreach (p_syms, string s) {
                inherited_symbols[s] = parent_name;
            }
        }
    }

    // Determine current program's file path for comparison
    string prog_file = "";
    catch {
        string prog_loc = Program.defined(prog);
        if (prog_loc) {
            // Clean up line number if present (though Program.defined usually just returns file)
            sscanf(prog_loc, "%s:%*d", prog_file);
            if (!prog_file || sizeof(prog_file) == 0) prog_file = prog_loc;
        }
    };

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
        int is_inherited = 0;
        string inherited_from = 0;

        if (functionp(value)) {
            kind = "function";
            type_info = ([ "kind": "function" ]);

            // Check for inheritance by comparing definition location
            string func_loc = 0;
            catch { func_loc = Function.defined(value); };

            if (func_loc && sizeof(prog_file) > 0) {
                 string func_file = "";
                 sscanf(func_loc, "%s:%*d", func_file);
                 // Normalize paths for comparison
                 string norm_prog = replace(prog_file, "\\", "/");
                 string norm_func = replace(func_file, "\\", "/");

                 if (norm_prog != norm_func) {
                     is_inherited = 1;
                 }
            }

            if (inherited_symbols[name]) {
                is_inherited = 1;
                inherited_from = inherited_symbols[name];
            } else if (is_inherited && !inherited_from) {
                // If we detected inheritance via location but didn't find it in immediate parents,
                // it might be deeper or from a parent that failed to instantiate.
                // Try to guess from file name.
                if (func_loc) {
                    string func_file = "";
                    sscanf(func_loc, "%s:%*d", func_file);
                    if (sizeof(func_file) > 0) {
                        array parts = replace(func_file, "\\", "/") / "/";
                        inherited_from = parts[-1];
                        if (has_suffix(inherited_from, ".pike")) inherited_from = inherited_from[..<5];
                    }
                }
            }

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

        if (kind != "function" && inherited_symbols[name]) {
             is_inherited = 1;
             inherited_from = inherited_symbols[name];
        }

        mapping symbol = ([
            "name": name,
            "type": type_info,
            "kind": kind,
            "modifiers": ({})
        ]);

        if (is_inherited) {
            symbol["inherited"] = 1;
            if (inherited_from) {
                symbol["inheritedFrom"] = inherited_from;
            }
        }

        result->symbols += ({ symbol });

        if (kind == "function") {
            result->functions += ({ symbol });
        } else if (kind == "variable") {
            result->variables += ({ symbol });
        } else if (kind == "class") {
            result->classes += ({ symbol });
        }
    }

    return result;
}

//! Introspect a singleton object directly without instantiation
//!
//! This method is used for stdlib modules that are already loaded as
//! singleton objects by Pike (e.g., Stdio, String, Array, Mapping).
//! These cannot be re-instantiated via prog() as that causes
//! "Parent lost, cannot clone program" errors.
//!
//! Instead of instantiation, we call indices() and values() directly
//! on the object to extract its symbols.
//!
//! @param obj The object to introspect (already instantiated)
//! @returns Mapping containing symbols, functions, variables, classes, inherits
mapping introspect_object(object obj) {
    mapping result = ([
        "symbols": ({}),
        "functions": ({}),
        "variables": ({}),
        "classes": ({}),
        "inherits": ({})
    ]);

    if (!obj) {
        return result;
    }

    // Get inheritance from the object's program
    program prog = object_program(obj);
    mapping(string:string) inherited_symbols = ([]);
    string prog_file = "";

    if (prog) {
        array inherit_list = ({});
        catch { inherit_list = Program.inherit_list(prog) || ({}); };

        foreach (inherit_list, program parent_prog) {
            string parent_path = "";
            catch { parent_path = Program.defined(parent_prog) || ""; };
            result->inherits += ({ ([ "path": parent_path ]) });

            // Identify parent name
            string parent_name = parent_path;
            if (sizeof(parent_name) > 0) {
                array parts = replace(parent_name, "\\", "/") / "/";
                string fname = parts[-1];
                if (has_suffix(fname, ".pike")) fname = fname[..<5];
                else if (has_suffix(fname, ".pmod")) fname = fname[..<6];
                parent_name = fname;
            } else {
                parent_name = sprintf("%O", parent_prog);
                // Cleanup /main()->Name or similar
                if (has_value(parent_name, "->")) {
                    parent_name = (parent_name / "->")[-1];
                }
            }

            // Extract symbols from parent to build inheritance map
            object parent_inst = safe_instantiate(parent_prog);
            if (parent_inst) {
                array(string) p_syms = ({});
                catch { p_syms = indices(parent_inst); };
                foreach (p_syms, string s) {
                    inherited_symbols[s] = parent_name;
                }
            }
        }

        // Determine current program's file path for comparison
        catch {
            string prog_loc = Program.defined(prog);
            if (prog_loc) {
                sscanf(prog_loc, "%s:%*d", prog_file);
                if (!prog_file || sizeof(prog_file) == 0) prog_file = prog_loc;
            }
        };
    }

    // Get symbols directly from the object - no instantiation needed
    array(string) symbol_names = ({});
    array symbol_values = ({});
    catch { symbol_names = indices(obj); };
    catch { symbol_values = values(obj); };

    // Extract each symbol
    for (int i = 0; i < sizeof(symbol_names); i++) {
        string name = symbol_names[i];
        mixed value = i < sizeof(symbol_values) ? symbol_values[i] : 0;

        string kind = "variable";
        mapping type_info = ([ "kind": "mixed" ]);
        int is_inherited = 0;
        string inherited_from = 0;

        if (functionp(value)) {
            kind = "function";
            type_info = ([ "kind": "function" ]);

            // Check for inheritance by comparing definition location
            string func_loc = 0;
            catch { func_loc = Function.defined(value); };

            if (func_loc && sizeof(prog_file) > 0) {
                 string func_file = "";
                 sscanf(func_loc, "%s:%*d", func_file);
                 // Normalize paths for comparison
                 string norm_prog = replace(prog_file, "\\", "/");
                 string norm_func = replace(func_file, "\\", "/");

                 if (norm_prog != norm_func) {
                     is_inherited = 1;
                 }
            }

            if (is_inherited && inherited_symbols[name]) {
                inherited_from = inherited_symbols[name];
            } else if (is_inherited && !inherited_from) {
                // Try to guess from file name.
                if (func_loc) {
                    string func_file = "";
                    sscanf(func_loc, "%s:%*d", func_file);
                    if (sizeof(func_file) > 0) {
                        array parts = replace(func_file, "\\", "/") / "/";
                        inherited_from = parts[-1];
                        if (has_suffix(inherited_from, ".pike")) inherited_from = inherited_from[..<5];
                    }
                }
            }

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

        if (kind != "function" && inherited_symbols[name]) {
             is_inherited = 1;
             inherited_from = inherited_symbols[name];
        }

        mapping symbol = ([
            "name": name,
            "type": type_info,
            "kind": kind,
            "modifiers": ({})
        ]);

        if (is_inherited) {
            symbol["inherited"] = 1;
            if (inherited_from) {
                symbol["inheritedFrom"] = inherited_from;
            }
        }

        result->symbols += ({ symbol });

        if (kind == "function") {
            result->functions += ({ symbol });
        } else if (kind == "variable") {
            result->variables += ({ symbol });
        } else if (kind == "class") {
            result->classes += ({ symbol });
        }
    }

    return result;
}
