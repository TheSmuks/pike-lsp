//! Resolution.pike - Module name resolution and stdlib introspection handlers
//!
//! This file provides handlers for resolving module paths to file locations,
//! introspecting stdlib modules with documentation, and managing stdlib caching.
//!
//! Design pattern:
//! - create(object ctx) constructor for context injection
//! - Handlers wrap errors in catch blocks with LSPError responses
//! - Uses LSP.Cache for stdlib data caching
//! - Uses LSP.Compat.trim_whites() for string operations
//! - Uses helper functions from module.pmod (extract_autodoc_comments, extract_symbol_name)

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

//! Track modules currently being resolved to prevent circular dependency.
//! When a module is being resolved, it's added to this set. If the same
//! module is requested again during resolution, we return early to prevent
//! infinite recursion (30-second timeout).
private mapping(string:int) resolving_modules = ([]);

//! Create a new Resolution instance
//! @param ctx Optional context object (reserved for future use)
void create(object ctx) {
    context = ctx;
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
        return LSP.module.LSPError(-32000, describe_error(err))->to_response();
    }
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
//!
//! Bootstrap modules guard: For modules used internally by the resolver
//! (Stdio, String, Array, Mapping), we use reflection-only introspection
//! to avoid circular dependency. These modules are already loaded by Pike
//! before our code runs, so master()->resolv() succeeds, but we must avoid
//! using their methods (like Stdio.read_file()) during resolution.
mapping handle_resolve_stdlib(mapping params) {
    mixed err = catch {
        string module_path = params->module || "";

        if (sizeof(module_path) == 0) {
            return ([ "result": ([ "found": 0, "error": "No module path" ]) ]);
        }

        // Guard against bootstrap modules that cause circular dependency
        // These modules are used internally by the resolver itself.
        // Trying to resolve them triggers infinite recursion (30-second timeout).
        if (BOOTSTRAP_MODULES[module_path]) {
            return ([
                "result": ([
                    "found": 1,
                    "bootstrap": 1,
                    "module": module_path,
                    "message": "Bootstrap module - cannot be introspected"
                ])
            ]);
        }

        // Circular dependency guard - check if we're already resolving this module
        if (resolving_modules[module_path]) {
            return ([
                "result": ([
                    "found": 1,
                    "circular": 1,
                    "module": module_path,
                    "message": "Circular dependency detected - already resolving"
                ])
            ]);
        }

        // Mark this module as being resolved
        resolving_modules[module_path] = 1;

        // Check cache first - flat module name key per CONTEXT.md decision
        mapping cached = Cache.get("stdlib_cache", module_path);
        if (cached) {
            // Cleanup: remove from resolving set (cached, not actually resolved)
            m_delete(resolving_modules, module_path);
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

        // Introspect - call sibling Introspection class
        mapping introspection = ([]);
        mixed intro_err = catch {
            program IntroClass = master()->resolv("LSP.Intelligence.Introspection");
            if (IntroClass) {
                object intro_instance = IntroClass(context);
                introspection = intro_instance->introspect_program(prog);
            }
        };
        if (intro_err) {
            // Fallback: basic introspection if Introspection class unavailable
            introspection = ([
                "symbols": ({}),
                "functions": ({}),
                "variables": ({}),
                "classes": ({}),
                "inherits": ({})
            ]);
        }

        // Parse source file to get all exported symbols (not just introspected ones)
        if (sizeof(source_path) > 0) {
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

            // Use safe file reading helper that avoids circular dependency
            string code = read_source_file(clean_path);

            if (code && sizeof(code) > 0) {
                // Parse the file to get all symbols using Parser class
                program ParserClass = master()->resolv("LSP.Parser");
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
        Cache.put("stdlib_cache", module_path, result);

        // Cleanup: remove from resolving set
        m_delete(resolving_modules, module_path);

        return ([ "result": result ]);
    };

    if (err) {
        // Cleanup: remove from resolving set on error
        // Note: We can't access module_path here as it's in catch scope
        // Clear all to avoid stale entries (safe fallback)
        resolving_modules = ([]);
        return LSP.module.LSPError(-32000, describe_error(err))->to_response();
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

//! Safely read a source file without triggering module resolution recursion.
//!
//! IMPORTANT: Must use Stdio.FILE()->read() NOT Stdio.read_file().
//! Stdio.read_file() triggers module resolution via master()->resolv(),
//! causing infinite recursion when resolving Stdio itself.
//!
//! @param path The file path to read
//! @param max_bytes Maximum bytes to read (default 1MB)
//! @returns File contents or empty string on error
protected string read_source_file(string path, void|int max_bytes) {
    // Early return for bootstrap module paths to avoid circular dependency
    // Checking the path is safer than checking the module name at this level
    if (sizeof(path) > 0) {
        string normalized = replace(path, "\\", "/");
        array parts = normalized / "/";
        // Get the last component (filename without extension)
        if (sizeof(parts) > 0) {
            string filename = parts[-1];
            // Remove .pike or .pmod extension
            if (has_suffix(filename, ".pike")) {
                filename = filename[..<5];
            } else if (has_suffix(filename, ".pmod")) {
                filename = filename[..<6];
            }
            // Check if this is a bootstrap module
            if (BOOTSTRAP_MODULES[filename]) {
                return "";  // Don't try to read bootstrap module files
            }
        }
    }

    int max_size = max_bytes || 1000000;
    mixed err = catch {
        object f = Stdio.FILE();
        string data = f->read(path, max_size);
        destruct(f);
        return data || "";
    };
    return "";  // Return empty on any error
}

//! Parse stdlib source file for autodoc documentation
//! Returns mapping of symbol name -> documentation mapping
//!
//! @param source_path Path to the stdlib source file (may have line number suffix)
//! @returns Mapping of symbol name to parsed documentation
//!
//! Uses extract_autodoc_comments and extract_symbol_name helpers from module.pmod.
protected mapping parse_stdlib_documentation(string source_path) {
    // Get helper functions from module.pmod
    program module_program = master()->resolv("LSP.Intelligence.module");
    if (!module_program) {
        return ([]);
    }

    function extract_autodoc_comments = module_program->extract_autodoc_comments;
    function extract_symbol_name = module_program->extract_symbol_name;

    if (!extract_autodoc_comments || !extract_symbol_name) {
        return ([]);
    }

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

    // Use safe file reading helper that avoids circular dependency
    string code = read_source_file(clean_path);

    if (!code || sizeof(code) == 0) {
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
                    // Get parse_autodoc from sibling TypeAnalysis class
                    program TypeAnalysisClass = master()->resolv("LSP.Intelligence.TypeAnalysis");
                    if (TypeAnalysisClass) {
                        object type_analyzer = TypeAnalysisClass(context);
                        docs[name] = type_analyzer->parse_autodoc(current_doc);
                    } else {
                        // Fallback: store raw doc
                        docs[name] = ([ "text": current_doc ]);
                    }
                }
                current_doc = "";
            }
        }
    };

    return docs;
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
