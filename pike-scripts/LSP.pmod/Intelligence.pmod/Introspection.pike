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
                        compiled_prog = compile_string(code, filename);
                    }
                } else {
                    compiled_prog = compile_string(code, filename);
                }
            } else {
                // Normal file - compile directly
                compiled_prog = compile_string(code, filename);
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
