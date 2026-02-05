//! ModuleResolution.pike - Import/include/inherit/require directive handling
//!
//! This file provides handlers for parsing and resolving Pike module imports
//! and dependencies with waterfall symbol loading and circular dependency detection.
//!
//! Design pattern:
//! - create(object ctx) constructor for context injection
//! - Handlers wrap errors in catch blocks with LSPError responses
//! - Uses trim_whites() for string operations
//! - Uses Parser.Pike.split() for tokenization (NOT regex)

//! @module ModuleResolution
//! @summary Module resolution API for Pike LSP analyzer
//!
//! This module provides functionality for:
//! - Parsing import/include/inherit/require directives from Pike code
//! - Resolving directive targets to file paths
//! - Detecting circular dependencies in import graphs
//! - Waterfall symbol loading across dependencies

//! @const string INCLUDE - Preprocessor include directive type
constant INCLUDE = "include";

//! @const string IMPORT - Import statement directive type
constant IMPORT = "import";

//! @const string INHERIT - Inheritance statement directive type
constant INHERIT = "inherit";

//! @const string REQUIRE - Preprocessor require directive type
constant REQUIRE = "require";

private object context;

//! Create a new ModuleResolution instance
//! @param ctx Context object with parser, intelligence, analysis references
void create(object ctx) {
    context = ctx;
}

//! Trim leading and trailing whitespace from a string
//! @param s The string to trim
//! @returns Trimmed string
protected string trim_whites(string s) {
    if (sizeof(s) == 0) return s;
    while (sizeof(s) > 0) {
        int first = s[0];
        if (first == ' ' || first == '\t' || first == '\n' || first == '\r') s = s[1..];
        else break;
    }
    while (sizeof(s) > 0) {
        int last = s[-1];
        if (last == ' ' || last == '\t' || last == '\n' || last == '\r') s = s[0..<1];
        else break;
    }
    return s;
}

//! Check if a file exists (Pike 8.0 compatible)
//! @param path The file path to check
//! @returns 1 if file exists and is a regular file, 0 otherwise
protected int is_file(string path) {
    mixed stat = file_stat(path);
    return stat && stat->isreg;
}

//! Parse a #require directive using limited subset approach.
//!
//! Supported patterns:
//! - String literals: #require "module.pike";
//! - Constant identifiers: #require constant(ModuleName);
//! - Complex expressions: Marked as skip
//!
//! @param line
//!   The line containing the #require directive
//! @param line_num
//!   Line number for error reporting (unused but reserved for future)
//! @returns
//!   Mapping with type, path, resolution_type, identifier (for constant), skip (for complex)
//!
//! @example
//! @code
//! mapping result = parse_require_directive("#require \"my_module.pike\";", 1);
//! // result: ([
//! //   "type": "require",
//! //   "path": "my_module.pike",
//! //   "resolution_type": "string_literal",
//! //   "skip": 0
//! // ])
//!
//! mapping result2 = parse_require_directive("#require constant(MyModule);", 2);
//! // result2: ([
//! //   "type": "require",
//! //   "path": "MyModule",
//! //   "resolution_type": "constant_identifier",
//! //   "identifier": "MyModule",
//! //   "skip": 0
//! // ])
//!
//! mapping result3 = parse_require_directive("#require some_func() + \".pike\";", 3);
//! // result3: ([
//! //   "type": "require",
//! //   "path": "some_func() + \".pike\";",
//! //   "resolution_type": "complex_require",
//! //   "skip": 1
//! // ])
//! @endcode
private mapping parse_require_directive(string line, int line_num) {
    string rest = line[sizeof("#require")..];
    rest = trim_whites(rest);

    // Pattern 1: String literal - #require "module.pike";
    if (sizeof(rest) > 0 && rest[0] == '"') {
        int end = search(rest, "\"", 1);
        if (end > 0) {
            string path = rest[1..end-1];
            return ([
                "type": REQUIRE,
                "path": path,
                "resolution_type": "string_literal",
                "skip": 0
            ]);
        }
    }

    // Pattern 2: Constant identifier - #require constant(ModuleName);
    if (has_prefix(rest, "constant(")) {
        string inner = rest[sizeof("constant(")..];
        inner = trim_whites(inner);

        // Find closing parenthesis
        int end = search(inner, ")");
        if (end > 0) {
            string identifier = inner[0..end-1];
            identifier = trim_whites(identifier);
            return ([
                "type": REQUIRE,
                "path": identifier,
                "resolution_type": "constant_identifier",
                "identifier": identifier,
                "skip": 0
            ]);
        }
    }

    // Pattern 3: Complex expression - mark as skip
    // Examples: #require some_func() + ".pike"; #require expr1 ? "a.pike" : "b.pike";
    return ([
        "type": REQUIRE,
        "path": rest,
        "resolution_type": "complex_require",
        "skip": 1
    ]);
}

//! Extract import/include/inherit/require directives from Pike code
//!
//! Parses a Pike source code string and extracts all import-related directives.
//! Supports both preprocessor directives (#include, #require) and keyword-based
//! statements (import, inherit).
//!
//! @param params Mapping with "code" key (Pike source code string)
//! @returns Mapping with "result" containing array of import_entry mappings
//! @returns_mapping result
//! @returns_array result.imports Array of import_entry structures
//!
//! @example
//! @code
//! mapping params = ([
//!     "code": "import Stdio;\\n#include <unistd.h>\\ninherit Thread.Thread;"
//! ]);
//! mapping result = handle_extract_imports(params);
//! // result->result->imports contains:
//! // ({ (["type": "import", "target": "Stdio", "raw": "import Stdio"]),
//! //   (["type": "include", "target": "unistd.h", "raw": "#include <unistd.h>"]),
//! //   (["type": "inherit", "target": "Thread.Thread", "raw": "inherit Thread.Thread"]) })
//! @endcode
mapping handle_extract_imports(mapping params) {
    mixed err = catch {
        string code = params->code || "";

        if (sizeof(code) == 0) {
            return ([ "result": ([ "imports": ({}), "dependencies": ({}) ]) ]);
        }

        array(mapping) imports = ({});
        array(string) dependencies = ({});

        // Use Pike's native parser for tokenization
        array tokens = Parser.Pike.split(code);

        // Track current line number (1-indexed)
        int current_line = 1;

        for (int i = 0; i < sizeof(tokens); i++) {
            string token = tokens[i];
            string trimmed = trim_whites(token);

            // Track line numbers through newline tokens
            if (sizeof(trimmed) > 0) {
                for (int j = 0; j < sizeof(trimmed); j++) {
                    if (trimmed[j] == '\n') current_line++;
                }
            }

            // Check for preprocessor directives (#include, #require)
            if (sizeof(trimmed) > 0 && trimmed[0] == '#') {
                // Get line number before consuming the directive
                int line_num = current_line;

                if (has_prefix(trimmed, "#include")) {
                    string target = trimmed[sizeof("#include")..];
                    target = trim_whites(target);
                    string path = target;

                    // Extract path
                    if (sizeof(target) > 0) {
                        if (target[0] == '"' || target[0] == '<') {
                            target = target[1..];
                        }
                        if (sizeof(target) > 0 && (target[-1] == '"' || target[-1] == '>')) {
                            target = target[0..sizeof(target)-2];
                        }
                        path = target;
                    }

                    imports += ({ ([
                        "type": INCLUDE,
                        "path": path,
                        "line": line_num
                    ]) });

                    // Add to dependencies (will be resolved later)
                    if (sizeof(path) > 0) {
                        dependencies += ({ path });
                    }

                } else if (has_prefix(trimmed, "#require")) {
                    // Use parse_require_directive() for proper handling
                    mapping require_info = parse_require_directive(trimmed, line_num);
                    string path = require_info->path || "";

                    // Build import entry with all metadata
                    mapping entry = ([
                        "type": REQUIRE,
                        "path": path,
                        "line": line_num
                    ]);

                    // Add resolution metadata if present
                    if (require_info->resolution_type) {
                        entry->resolution_type = require_info->resolution_type;
                    }
                    if (require_info->identifier) {
                        entry->identifier = require_info->identifier;
                    }
                    if (require_info->skip) {
                        entry->skip = require_info->skip;
                    }

                    imports += ({ entry });

                    // Add to dependencies (will be resolved later)
                    if (sizeof(path) > 0 && !require_info->skip) {
                        dependencies += ({ path });
                    }
                }
            }

            // Check for keyword-based imports (import, inherit)
            else if (trimmed == "import" || trimmed == "inherit") {
                string type = trimmed;
                string path = "";
                int line_num = current_line;

                // Look ahead to get the target module/class
                int j = i + 1;
                while (j < sizeof(tokens)) {
                    string next = tokens[j];

                    // Stop at semicolon or newline
                    if (sizeof(next) > 0 && (next[0] == ';' || next[0] == '\n')) {
                        break;
                    }

                    // Track line numbers while looking ahead
                    for (int k = 0; k < sizeof(next); k++) {
                        if (next[k] == '\n') current_line++;
                    }

                    string trimmed_next = trim_whites(next);
                    if (sizeof(trimmed_next) > 0 && trimmed_next != ";") {
                        if (sizeof(path) > 0) path += " ";
                        path += trimmed_next;
                    }
                    j++;
                }

                // Clean up path (remove trailing semicolon, etc.)
                path = trim_whites(path);
                if (sizeof(path) > 0 && path[-1] == ';') {
                    path = path[0..sizeof(path)-2];
                }
                path = trim_whites(path);

                if (sizeof(path) > 0) {
                    imports += ({ ([
                        "type": type == "import" ? IMPORT : INHERIT,
                        "path": path,
                        "line": line_num
                    ]) });

                    // Add to dependencies (will be resolved later)
                    dependencies += ({ path });
                }

                i = j - 1; // Skip ahead
            }
        }

        return ([
            "result": ([
                "imports": imports,
                "dependencies": dependencies
            ])
        ]);
    };

    if (err) {
        mixed LSPError = master()->resolv("LSP.module.LSPError");
        if (LSPError) {
            return LSPError(-32000, describe_error(err))->to_response();
        }
        return ([
            "error": ([
                "code": -32000,
                "message": describe_error(err)
            ])
        ]);
    }
}

//! Resolve an import/include/inherit/require directive to its file path
//!
//! Given an import directive type and target, attempts to resolve it to a file path.
//! Resolution logic varies by import type:
//! - INCLUDE: Resolves "local.h" relative to current file, <system.h> via include paths
//! - IMPORT: Uses master()->resolv() to find the program, then Program.defined()
//! - INHERIT: Multi-strategy resolution (introspection, qualified names, workspace search, stdlib)
//! - REQUIRE: Tries as module via master()->resolv(), then as file path
//!
//! @param params Mapping with "import_type" key (type constant), "target" key (module/path name),
//!               and optional "current_file" key (file path for relative resolution)
//! @returns_mapping result
//! @returns_string result.path Resolved absolute file path (empty if not found)
//! @returns_int result.exists 1 if file exists, 0 otherwise
//! @returns_string result.type Import type (include/import/inherit/require)
//! @returns_int result.mtime File modification time (0 if not found)
//! @returns_string result.error Error message if resolution failed (empty string if success)
//!
//! @example
//! @code
//! mapping params = (["import_type": "import", "target": "Stdio"]);
//! mapping result = handle_resolve_import(params);
//! // result->result->path: "/usr/local/pike/lib/modules/Stdio.so"
//! // result->result->exists: 1
//! // result->result->type: "import"
//!
//! mapping params2 = ([
//!     "import_type": "inherit",
//!     "target": "Thread.Thread",
//!     "current_file": "/path/to/current.pike"
//! ]);
//! mapping result2 = handle_resolve_import(params2);
//! // Multi-strategy resolution: introspection → qualified → workspace → stdlib
//! @endcode
mapping handle_resolve_import(mapping params) {
    mixed err = catch {
        string import_type = params->import_type || "";
        string target = params->target || "";
        string current_file = params->current_file || "";

        if (sizeof(import_type) == 0 || sizeof(target) == 0) {
            return ([
                "result": ([
                    "path": "",
                    "exists": 0,
                    "type": import_type,
                    "mtime": 0,
                    "error": "Missing import_type or target parameter"
                ])
            ]);
        }

        // Resolution result structure
        string resolved_path = 0;
        int file_exists = 0;
        int mtime = 0;
        string error_msg = 0;

        switch (import_type) {
            case INCLUDE:
                // #include "local.h" - relative to current file
                // #include <system.h> - search include paths
                resolved_path = resolve_include(target, current_file);
                if (resolved_path && is_file(resolved_path)) {
                    file_exists = 1;
                    mixed stat = file_stat(resolved_path);
                    if (stat) mtime = stat->mtime;
                } else {
                    error_msg = sprintf("Include file not found: %s", target);
                }
                break;

            case IMPORT:
                // import Module.Name - resolve via master()->resolv()
                resolved_path = resolve_import_module(target);
                if (resolved_path && is_file(resolved_path)) {
                    file_exists = 1;
                    mixed stat = file_stat(resolved_path);
                    if (stat) mtime = stat->mtime;
                } else {
                    error_msg = sprintf("Module not found: %s", target);
                }
                break;

            case REQUIRE:
                // #require - limited subset (string literal or identifier)
                resolved_path = resolve_require(target, current_file);
                if (resolved_path && is_file(resolved_path)) {
                    file_exists = 1;
                    mixed stat = file_stat(resolved_path);
                    if (stat) mtime = stat->mtime;
                } else {
                    error_msg = sprintf("Required module/file not found: %s", target);
                    if (resolved_path) {
                        error_msg += sprintf(" (resolved to non-existent path: %s)", resolved_path);
                    }
                }
                break;

            case INHERIT:
                // inherit ClassName - multi-strategy class search
                // Strategy 1: Check introspection data (cached.inherits)
                // Strategy 2: Try import-qualified names (ModuleName.ClassName)
                // Strategy 3: Direct workspace search
                // Strategy 4: Stdlib fallback via master()->resolv()
                resolved_path = resolve_inherit(target, current_file);

                if (resolved_path && is_file(resolved_path)) {
                    file_exists = 1;
                    mixed stat = file_stat(resolved_path);
                    if (stat) mtime = stat->mtime;
                } else {
                    error_msg = sprintf("Inherited class not found: %s", target);
                    if (resolved_path) {
                        error_msg += sprintf(" (resolved to non-existent path: %s)", resolved_path);
                    }
                }
                break;

            default:
                error_msg = sprintf("Unknown import type: %s", import_type);
                break;
        }

        return ([
            "result": ([
                "path": resolved_path || "",
                "exists": file_exists,
                "type": import_type,
                "mtime": mtime,
                "error": error_msg || ""
            ])
        ]);
    };

    if (err) {
        mixed LSPError = master()->resolv("LSP.module.LSPError");
        if (LSPError) {
            return LSPError(-32000, describe_error(err))->to_response();
        }
        return ([
            "error": ([
                "code": -32000,
                "message": describe_error(err)
            ])
        ]);
    }
}

//! Resolve #include directive to file path
//! @param target Include target (with or without quotes/angle brackets)
//! @param current_file Current file path for relative includes
//! @returns Resolved file path or 0
protected string resolve_include(string target, string current_file) {
    array(string) include_paths = ({});

    // Check if local include (quotes) or system include (angle brackets)
    int is_local = has_prefix(target, "\"") || has_suffix(target, "\"");

    // Clean target (remove quotes/angle brackets)
    string clean_target = target;
    if (sizeof(clean_target) > 0 && (clean_target[0] == '"' || clean_target[0] == '<')) {
        clean_target = clean_target[1..];
    }
    if (sizeof(clean_target) > 0 && (clean_target[-1] == '"' || clean_target[-1] == '>')) {
        clean_target = clean_target[0..<2];
    }

    if (is_local) {
        // Local include - relative to current file
        if (sizeof(current_file) > 0) {
            string current_dir = get_dirname(current_file);
            include_paths = ({ current_dir });
        } else {
            include_paths = ({ "./" });
        }
    } else {
        // System include - search standard paths
        include_paths = ({
            "/usr/local/pike/lib/master.pike.includedir/",
            "/usr/local/pike/lib/modules/",
            "."
        });
    }

    // Search include paths
    foreach (include_paths, string inc_path) {
        string candidate = combine_path(inc_path, clean_target);
        if (is_file(candidate)) {
            return candidate;
        }
    }

    return 0;
}

//! Resolve import Module.Name via master()->resolv()
//! @param target Module name to resolve
//! @returns Resolved file path or 0
protected string resolve_import_module(string target) {
    mixed resolved = master()->resolv(target);
    if (resolved) {
        // Try to get file path from program
        if (programp(resolved)) {
            string path = 0;
            catch { path = Program.defined(resolved); };
            if (path) return path;
        } else if (objectp(resolved)) {
            program prog = object_program(resolved);
            if (prog) {
                string path = 0;
                catch { path = Program.defined(prog); };
                if (path) return path;
            }
        }
    }
    return 0;
}

//! Resolve #require directive to file path
//! @param target Require target (string literal or identifier)
//! @param current_file Current file path for relative paths
//! @returns Resolved file path or 0
protected string resolve_require(string target, string current_file) {
    // Try as module first
    string resolved = resolve_import_module(target);
    if (resolved) return resolved;

    // If not resolved as module, try as file path
    if (sizeof(current_file) > 0) {
        string current_dir = get_dirname(current_file);
        string candidate = combine_path(current_dir, target);
        if (is_file(candidate)) {
            return candidate;
        }
    }

    return 0;
}

//! Resolve inherit ClassName using multi-strategy approach
//! @param class_name Name of class to resolve
//! @param current_file Current file path for workspace search context
//! @returns Resolved file path or 0
protected string resolve_inherit(string class_name, string current_file) {
    string resolved = 0;

    // Strategy 1: Check introspection data (cached.inherits)
    resolved = resolve_inherit_strategy_introspection(class_name);
    if (resolved) return resolved;

    // Strategy 2: Try import-qualified names (ModuleName.ClassName)
    resolved = resolve_inherit_strategy_qualified(class_name);
    if (resolved) return resolved;

    // Strategy 3: Direct workspace search
    resolved = resolve_inherit_strategy_workspace(class_name, current_file);
    if (resolved) return resolved;

    // Strategy 4: Stdlib fallback via master()->resolv()
    resolved = resolve_inherit_strategy_stdlib(class_name);
    if (resolved) return resolved;

    return 0;
}

//! Strategy 1: Resolve inherit via introspection data
//! @param class_name Name of class to resolve
//! @returns Resolved file path or 0
protected string resolve_inherit_strategy_introspection(string class_name) {
    // Check if we have cached introspection data
    if (!context || !context->cached) {
        return 0;
    }

    mapping cached = context->cached;
    if (!cached->inherits || !mappingp(cached->inherits)) {
        return 0;
    }

    // Look for class in inherit cache
    array inherit_entries = cached->inherits[class_name] || ({});
    foreach (inherit_entries, mapping entry) {
        if (entry && mappingp(entry) && entry->file) {
            string file = entry->file;
            if (is_file(file)) {
                return file;
            }
        }
    }

    return 0;
}

//! Strategy 2: Resolve inherit via qualified module names
//! @param class_name Name of class to resolve
//! @returns Resolved file path or 0
protected string resolve_inherit_strategy_qualified(string class_name) {
    // Try common module prefixes
    array(string) prefixes = ({
        "Protocols",
        "Tools",
        "Stdio",
        "Parser",
        "Sql",
        "Web",
        "Thread",
        "Gz",
        "Crypto"
    });

    foreach (prefixes, string prefix) {
        string qualified = prefix + "." + class_name;
        mixed resolved = master()->resolv(qualified);
        if (resolved) {
            if (programp(resolved)) {
                string path = 0;
                catch { path = Program.defined(resolved); };
                if (path && is_file(path)) {
                    return path;
                }
            }
        }
    }

    return 0;
}

//! Strategy 3: Resolve inherit via direct workspace search
//! @param class_name Name of class to resolve
//! @param current_file Current file path for context
//! @returns Resolved file path or 0
protected string resolve_inherit_strategy_workspace(string class_name, string current_file) {
    if (sizeof(current_file) == 0) {
        return 0;
    }

    // Search in current directory first, then parent directories
    string search_dir = get_dirname(current_file);

    for (int i = 0; i < 5; i++) { // Limit search depth
        // Search for .pike files with matching class name
        array(string) files = get_dir(search_dir) || ({});
        foreach (files, string file) {
            if (has_suffix(file, ".pike")) {
                string full_path = combine_path(search_dir, file);

                // Quick check: does file contain the class name?
                string content = Stdio.read_file(full_path);
                if (content && sizeof(content) > 0) {
                    // Simple pattern match for "class ClassName"
                    string pattern = "class " + class_name;
                    if (has_value(content, pattern)) {
                        return full_path;
                    }
                }
            }
        }

        // Move to parent directory
        string parent = get_dirname(search_dir);
        if (parent == search_dir) {
            break; // Reached root
        }
        search_dir = parent;
    }

    return 0;
}

//! Strategy 4: Resolve inherit via stdlib master()->resolv()
//! @param class_name Name of class to resolve
//! @returns Resolved file path or 0
protected string resolve_inherit_strategy_stdlib(string class_name) {
    mixed resolved = master()->resolv(class_name);
    if (resolved && programp(resolved)) {
        string path = 0;
        catch { path = Program.defined(resolved); };
        if (path && is_file(path)) {
            return path;
        }
    }

    return 0;
}

//! Get directory name from file path
//! @param path File path
//! @returns Directory path
protected string get_dirname(string path) {
    array parts = path / "/";
    if (sizeof(parts) > 1) {
        return parts[0..<2] * "/";
    }
    return ".";
}

//! Check for circular dependencies in a dependency graph
//!
//! Performs cycle detection on a dependency graph structure using depth-first search.
//! Uses three-color DFS (white=unvisited, gray=visiting, black=visited).
//!
//! @param params Mapping with optional "graph" key (pre-built dependency graph)
//!                    or "file" key to build graph from a file
//! @returns_mapping result
//! @returns_int result.has_circular 1 if cycles detected, 0 otherwise
//! @returns_array result.cycle Array of file paths forming a cycle (if found)
//! @returns_array result.dependencies All dependencies found
//!
//! @example
//! @code
//! // Check imports from code
//! mapping params = ([
//!     "code": "import A; import B;",
//!     "filename": "test.pike"
//! ]);
//! mapping result = handle_check_circular(params);
//! @endcode
mapping handle_check_circular(mapping params) {
    mixed err = catch {
        // Get or build dependency graph
        mapping graph = params->graph;

        // If no graph provided, build from code
        if (!graph && params->code) {
            string filename = params->filename || "unknown";
            graph = build_dependency_graph_from_code(params->code, filename);
        }

        if (!graph || sizeof(graph) == 0) {
            return ([
                "result": ([
                    "has_circular": 0,
                    "cycle": ({}),
                    "dependencies": ({})
                ])
            ]);
        }

        // Detect cycles using DFS
        array(string) cycle = detect_cycles_in_graph(graph);

        // Flatten dependencies list
        array(string) all_deps = ({});
        foreach (graph; string file; array(string) deps) {
            all_deps += deps;
        }

        return ([
            "result": ([
                "has_circular": sizeof(cycle) > 0 ? 1 : 0,
                "cycle": cycle,
                "dependencies": all_deps
            ])
        ]);
    };

    if (err) {
        mixed LSPError = master()->resolv("LSP.module.LSPError");
        if (LSPError) {
            return LSPError(-32000, describe_error(err))->to_response();
        }
        return ([
            "error": ([
                "code": -32000,
                "message": describe_error(err)
            ])
        ]);
    }
}

//! Build dependency graph from source code
//! @param code Pike source code
//! @param filename Filename for the code
//! @returns Graph mapping (file -> array of dependencies)
private mapping build_dependency_graph_from_code(string code, string filename) {
    mapping(string:array(string)) graph = ([]);

    // Extract imports from the code
    mapping extract_params = (["code": code]);
    mapping extract_result = handle_extract_imports(extract_params);

    if (extract_result->result && extract_result->result->imports) {
        array(mapping) imports = extract_result->result->imports;
        array(string) deps = ({});

        foreach (imports, mapping imp) {
            if (imp->path && sizeof(imp->path) > 0) {
                deps += ({ imp->path });
            }
        }

        graph[filename] = deps;
    }

    return graph;
}

//! Detect cycles in dependency graph using DFS
//! @param graph Dependency graph (file -> array of dependencies)
//! @returns Array of file paths forming a cycle, or empty array if no cycle
private array(string) detect_cycles_in_graph(mapping graph) {
    // Three-color DFS: white=unvisited, gray=visiting, black=visited
    mapping(string:int) color = ([]);
    array(string) path = ({});

    foreach (graph; string start; array(string) deps) {
        if (color[start] == 0) {  // white/unvisited
            array(string) cycle = dfs_detect_cycle(start, graph, color, path);
            if (sizeof(cycle) > 0) {
                return cycle;
            }
        }
    }

    return ({});
}

//! DFS helper for cycle detection
//! @param node Current node being visited
//! @param graph Dependency graph
//! @param color Color mapping (0=white, 1=gray, 2=black)
//! @param path Current DFS path
//! @returns Cycle path if found, empty array otherwise
private array(string) dfs_detect_cycle(string node, mapping graph, mapping(string:int) color, array(string) path) {
    color[node] = 1;  // mark as gray (visiting)
    path += ({ node });

    array(string) deps = graph[node] || ({});
    foreach (deps, string dep) {
        if (!stringp(dep)) continue;  // Skip non-string dependencies

        if (color[dep] == 0) {  // white - recurse
            array(string) result = dfs_detect_cycle(dep, graph, color, path);
            if (sizeof(result) > 0) {
                return result;
            }
        } else if (color[dep] == 1) {  // gray - cycle found!
            // Extract cycle from current path
            int cycle_start = search(path, dep);
            if (cycle_start >= 0) {
                return path[cycle_start..] + ({ dep });
            }
        }
    }

    color[node] = 2;  // mark as black (visited)
    return ({});
}

//! Get symbols with waterfall loading (transitive dependency resolution)
//!
//! Performs transitive symbol loading by recursively resolving all dependencies
//! of the specified file. Implements waterfall pattern where symbols from
//! dependencies are loaded with depth tracking for proper prioritization.
//!
//! @param params Mapping with "code" key (Pike source code) and optional
//!               "filename" key (for resolution context), "max_depth" (default: 5)
//! @returns_mapping result
//! @returns_array result.symbols All symbols from file and transitive dependencies
//! @returns_array result.imports Direct imports from the file
//! @returns_array result.transitive Transitive imports (waterfall)
//! @returns_mapping result.provenance Provenance information for each symbol
//!
//! @example
//! @code
//! mapping params = ([
//!     "code": "import Stdio;\n#include \"header.h\";",
//!     "filename": "test.pike",
//!     "max_depth": 3
//! ]);
//! mapping result = handle_get_waterfall_symbols(params);
//! @endcode
mapping handle_get_waterfall_symbols(mapping params) {
    mixed err = catch {
        string code = params->code || "";
        string filename = params->filename || "unknown";
        int max_depth = params->max_depth || 5;

        // Result structure
        array symbols = ({});
        array imports = ({});
        array transitive = ({});
        mapping(string:mapping) provenance = ([]);

        // Track visited files to prevent cycles
        mapping(string:int) visited = ([]);
        array(string) visit_order = ({});

        // Step 1: Extract imports from current file
        mapping extract_params = (["code": code]);
        mapping extract_result = handle_extract_imports(extract_params);

        if (extract_result->result && extract_result->result->imports) {
            // Add depth: 0 to direct imports
            foreach (extract_result->result->imports, mapping imp) {
                mapping imp_with_depth = copy_value(imp);
                imp_with_depth->depth = 0;
                imports += ({ imp_with_depth });
            }
        }

        // Step 2: Load symbols from each import (waterfall)
        // Start with current file at depth -1
        load_waterfall_symbols(filename, 0, max_depth, visited, visit_order, symbols, transitive, provenance);

        return ([
            "result": ([
                "symbols": symbols,
                "imports": imports,
                "transitive": transitive,
                "provenance": provenance
            ])
        ]);
    };

    if (err) {
        mixed LSPError = master()->resolv("LSP.module.LSPError");
        if (LSPError) {
            return LSPError(-32000, describe_error(err))->to_response();
        }
        return ([
            "error": ([
                "code": -32000,
                "message": describe_error(err)
            ])
        ]);
    }
}

//! Load symbols from a file and its transitive dependencies (waterfall)
//! @param file File path or identifier
//! @param depth Current depth (0 for direct imports, incremented for transitive)
//! @param max_depth Maximum depth to traverse
//! @param visited Mapping of visited files (to prevent cycles)
//! @param visit_order Array tracking visit order
//! @param symbols Array to accumulate symbols
//! @param transitive Array to accumulate transitive imports
//! @param provenance Mapping of provenance information
private void load_waterfall_symbols(string file, int depth, int max_depth,
                                     mapping(string:int) visited, array(string) visit_order,
                                     array symbols, array transitive, mapping provenance) {
    // Check for cycles or max depth
    if (visited[file] || depth > max_depth) {
        if (visited[file]) {
            // Mark as circular
            foreach (symbols, mapping sym) {
                if (sym->provenance_file == file) {
                    sym->is_circular = 1;
                }
            }
        }
        return;
    }

    // Mark as visited
    visited[file] = 1;
    visit_order += ({ file });

    // Check if file exists and is readable
    string file_content = "";
    if (is_file(file)) {
        file_content = Stdio.read_file(file);
    } else {
        // Not a workspace file - could be a stdlib module reference
        // Try to resolve it via master()->resolv() for stdlib modules
        mixed resolved = master()->resolv(file);
        if (resolved && programp(resolved)) {
            string program_path = 0;
            catch { program_path = Program.defined(resolved); };
            if (program_path && is_file(program_path)) {
                file_content = Stdio.read_file(program_path);
            }
        }
    }

    // Extract symbols from the file if we have content
    if (sizeof(file_content) > 0 && context && context->parser) {
        mapping parse_params = ([
            "code": file_content,
            "filename": file,
            "line": 1
        ]);

        mixed parse_result = context->parser->parse_request(parse_params);

        if (parse_result && parse_result->result && parse_result->result->symbols) {
            // Add extracted symbols with provenance tracking
            foreach (parse_result->result->symbols, mapping sym) {
                mapping sym_with_provenance = copy_value(sym);
                sym_with_provenance->provenance_depth = depth;
                sym_with_provenance->provenance_file = file;
                symbols += ({ sym_with_provenance });
            }
        }
    }

    // Extract imports from this file for recursive waterfall loading
    if (sizeof(file_content) > 0 && context && context->parser) {
        mapping extract_params = (["code": file_content]);
        mapping extract_result = handle_extract_imports(extract_params);

        if (extract_result->result && extract_result->result->imports) {
            // Recursively load symbols from imports
            foreach (extract_result->result->imports, mapping imp) {
                string import_path = imp->path || "";
                string resolved_path = imp->resolved_path || import_path;

                // Skip if no path or if it's the current file
                if (sizeof(resolved_path) == 0 || resolved_path == file) {
                    continue;
                }

                // Recursively load symbols from this import
                load_waterfall_symbols(resolved_path, depth + 1, max_depth, visited, visit_order, symbols, transitive, provenance);
            }
        }
    }
}

//! Merge symbols with "most specific wins" precedence
//!
//! Prioritizes symbols based on their depth:
//! - Current file symbols (depth -1) have highest priority
//! - Direct imports (depth 0) have medium priority
//! - Transitive imports (depth 1+) have lowest priority
//!
//! @param symbols_by_file Array of [symbols, file, depth] entries
//! @returns Merged symbol array with precedence applied
//!
//! @example
//! @code
//! array result = merge_symbols_with_precedence(({ 
//!     ({ current_file_syms, "main.pike", -1 }),
//!     ({ import_syms, "Stdio", 0 }),
//!     ({ transitive_syms, "header.h", 1 })
//! }));
//! @endcode
private array merge_symbols_with_precedence(array(array) symbols_by_file) {
    mapping(string:mapping) merged = ([]);
    mapping(string:int) best_depth = ([]);

    // Process files in order
    foreach (symbols_by_file, array entry) {
        string file = entry[0];
        array syms = entry[1];
        int depth = entry[2];

        foreach (syms, mapping symbol) {
            string name = symbol->name || "";

            // Current file symbols always win
            if (depth == -1) {
                merged[name] = symbol;
                best_depth[name] = -1;
                continue;
            }

            // Check if we should add this symbol
            if (!merged[name] || depth < best_depth[name]) {
                merged[name] = symbol;
                if (symbol->provenance_depth == 0) {
                    symbol->provenance_depth = depth;
                    symbol->provenance_file = file;
                }
                best_depth[name] = depth;
            }
        }
    }

    return values(merged);
}
