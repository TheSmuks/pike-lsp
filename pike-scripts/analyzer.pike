#!/usr/bin/env pike
#pike __REAL_VERSION__

//! Pike LSP Analyzer Script
//!
//! Lightweight JSON-RPC router that delegates to LSP modules:
//! - Parser.pike: parse, tokenize, compile, batch_parse
//! - Intelligence.pike: introspect, resolve, resolve_stdlib, get_inherited
//! - Analysis.pike: find_occurrences, analyze_uninitialized, get_completion_context,
//!                  get_completion_context_cached (PERF-003)
//!
//! Protocol: JSON-RPC over stdin/stdout
//! Architecture: Dispatch table router with Context service container

// MAINT-004: Configuration constants
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

// PERF-005: Debug mode (disabled by default for performance)
int debug_mode = 0;

// BUILD-001: Build ID (replaced by bundle script)
constant BUILD_ID = "DEV_BUILD";

// Conditional debug logging - only outputs when debug_mode is enabled
void debug(string fmt, mixed... args) {
  if (debug_mode) {
    werror(fmt, @args);
  }
}

//! ============================================================================
//! CONTEXT SERVICE CONTAINER
//! ============================================================================
//! Context class provides dependency injection for all LSP modules.
//! Per CONTEXT.md Module Instantiation decision:
//! - Singleton pattern - modules created once at startup
//! - Explicit initialization order (caches -> parser -> intelligence -> analysis)
//! - Context passed to handlers via dispatch() function

class Context {
    // Cache module reference (LSP.Cache is a module with singleton state)
    // Handlers access cache via LSP.Cache.get/put directly
    mixed parser;
    mixed intelligence;
    mixed analysis;
    mixed compilation_cache;  // CompilationCache instance for caching compiled programs
    mixed roxen;  // Roxen module analysis
    int debug_mode;
    mapping client_capabilities;

    void create() {
        // Initialize module instances using master()->resolv pattern
        // LSP.Parser is a simple program/class
        program ParserClass = master()->resolv("LSP.Parser");
        parser = ParserClass();

        // LSP.Intelligence is now a .pmod directory; access the Intelligence class within it
        // The delegating Intelligence class forwards to specialized handlers
        program IntelligenceClass = master()->resolv("LSP.Intelligence.Intelligence");
        intelligence = IntelligenceClass();

        // LSP.Analysis is now a .pmod directory; access the Analysis class within it
        // The delegating Analysis class forwards to specialized handlers
        program AnalysisClass = master()->resolv("LSP.Analysis.Analysis");
        analysis = AnalysisClass();

        // Initialize CompilationCache for Pike-side compilation caching
        mixed CacheClass = master()->resolv("LSP.CompilationCache");
        if (CacheClass && programp(CacheClass)) {
            compilation_cache = CacheClass();
        } else {
            compilation_cache = 0;
        }

        // Initialize Roxen module for Roxen-specific analysis
        program RoxenClass = master()->resolv("LSP.Roxen.Roxen");
        if (RoxenClass && programp(RoxenClass)) {
            roxen = RoxenClass();
        } else {
            roxen = 0;
        }

        debug_mode = 0;
        client_capabilities = ([]);
    }
}

//! ============================================================================
//! DISPATCH TABLE ROUTER
//! ============================================================================
//! Per CONTEXT.md Router Design Pattern:
//! - O(1) method lookup via constant mapping
//! - Each lambda receives (params, Context) for dependency injection
//! - Handlers delegate directly to module instances via ctx->module->handler()
//! - set_debug is handled inline (modifies Context, no module needed)
//! Note: HANDLERS is initialized in main() after module path is added

mapping HANDLERS;

//! Dispatch function - routes method calls to appropriate handlers
//! Per CONTEXT.md: Single dispatch() function handles routing and error normalization
protected mapping dispatch(string method, mapping params, Context ctx) {
    object timer = System.Timer();

    // Get handler from dispatch table
    function handler = HANDLERS[method];

    if (!handler) {
        mapping resp = ([
            "error": ([
                "code": -32601,
                "message": "Method not found: " + method
            ])
        ]);
        resp->_perf = ([ "pike_total_ms": timer->peek() * 1000.0 ]);
        return resp;
    }

    // Call handler with error normalization - Context passed through
    mapping result;
    mixed err = catch {
        result = handler(params, ctx);
    };

    if (err) {
        result = ([
            "error": ([
                "code": -32000,
                "message": describe_error(err)
            ])
        ]);
    }

    if (result) {
        result->_perf = ([ "pike_total_ms": timer->peek() * 1000.0 ]);
    }

    return result;
}

//! handle_request - entry point for JSON-RPC requests
//! Delegates to dispatch() function for routing
protected mapping(string:mixed) handle_request(mapping(string:mixed) request, Context ctx) {
    string method = request->method || "";
    mapping params = request->params || ([]);
    return dispatch(method, params, ctx);
}

// PERF-011: Startup phase timing tracking
mapping startup_phases = ([]);
object startup_timer = System.Timer();

// PERF-012: Lazy Context creation - Context will be created on first request
Context ctx = 0;
int ctx_initialized = 0;

// PERF-012: Track first LSP.Compat load for timing analysis
int compat_loaded = 0;
float compat_load_time = 0.0;

int qe2_revision = 0;
mapping(string:mapping(string:mixed)) qe2_documents = ([]);
mapping(string:mixed) qe2_settings = ([]);
mapping(string:mixed) qe2_workspace = (["roots": ({}), "added": ({}), "removed": ({})]);
mapping(string:int) qe2_cancelled_requests = ([]);

int qe2_take_cancelled(string request_id) {
    if (!sizeof(request_id)) {
        return 0;
    }
    if (qe2_cancelled_requests[request_id]) {
        m_delete(qe2_cancelled_requests, request_id);
        return 1;
    }
    return 0;
}

string qe2_snapshot_id() {
    return sprintf("snp-%d", qe2_revision);
}

mapping(string:mixed) qe2_ack() {
    return ([
        "revision": qe2_revision,
        "snapshotId": qe2_snapshot_id()
    ]);
}

void qe2_bump_revision() {
    qe2_revision += 1;
}

//! get_context - Lazy initialization of Context service container
//! Creates Context only on first request, deferring Parser/Intelligence/Analysis
//! module loading until needed for startup optimization
Context get_context() {
    if (!ctx_initialized) {
        object timer = System.Timer();
        ctx = Context();
        ctx_initialized = 1;
        // Record timing if startup_phases exists
        if (startup_phases) {
            startup_phases->context_lazy = timer->peek() * 1000.0;
            startup_phases->total_with_first_request = startup_timer->peek() * 1000.0;
        }
    }
    return ctx;
}

//! get_compilation_cache - Get the CompilationCache instance
//! Initializes the cache if not already present in the Context
//! @param ctx The Context object
//! @returns The CompilationCache instance or 0 if unavailable
protected object get_compilation_cache(Context ctx) {
    if (!ctx->compilation_cache) {
        mixed CacheClass = master()->resolv("LSP.CompilationCache");
        if (CacheClass && programp(CacheClass)) {
            ctx->compilation_cache = CacheClass();
        }
    }
    return ctx->compilation_cache;
}

int main(int argc, array(string) argv) {
    // Add module path for LSP.pmod access
    // Use __FILE__ to get the directory containing this script, so it works
    // regardless of the current working directory (e.g., when bundled in extension)
    string script_dir = dirname(__FILE__);
    master()->add_module_path(script_dir);

    // PERF-011: Record path_setup phase time
    startup_phases->path_setup = startup_timer->peek() * 1000.0;

    // Log Pike version for debugging
    // PERF-012: Use __REAL_VERSION__ directly instead of loading LSP.Compat module (~10-30ms saved)
    werror("Pike LSP Analyzer running on Pike %s (Build: %s)\n", (string)__REAL_VERSION__, BUILD_ID);
    werror("Module Path: %O\n", master()->pike_module_path);
    werror("Include Path: %O\n", master()->pike_include_path);


    // PERF-011: Record version phase time
    startup_phases->version = startup_timer->peek() * 1000.0;

    // Initialize HANDLERS dispatch table after module path is set
    // Per CONTEXT.md Router Design Pattern
    HANDLERS = ([
        "parse": lambda(mapping params, object ctx) {
            // DEPRECATED: Use analyze with include: ["parse"]
            werror("[DEPRECATED] parse method - use analyze with include: ['parse']\n");

            // Call analyze with parse include
            mapping analyze_params = params + (["include":({"parse"})]);
            mapping response = ctx->analysis->handle_analyze(analyze_params);

            // Extract parse result
            if (response->result && response->result->parse) {
                return (["result": response->result->parse]);
            }

            // Check for failures
            if (response->failures && response->failures->parse) {
                mapping failure = response->failures->parse;
                return ([
                    "error": ([
                        "code": -32000,
                        "message": failure->message || "Parse failed"
                    ])
                ]);
            }

            // Fallback: try original handler if analyze returned empty
            return ctx->parser->parse_request(params);
        },
        "tokenize": lambda(mapping params, object ctx) {
            return ctx->parser->tokenize_request(params);
        },
        "compile": lambda(mapping params, object ctx) {
            return ctx->parser->compile_request(params);
        },
        "batch_parse": lambda(mapping params, object ctx) {
            return ctx->parser->batch_parse_request(params);
        },
        "parse_preprocessor_blocks": lambda(mapping params, object ctx) {
            return ctx->parser->parse_preprocessor_blocks_request(params);
        },
        "resolve": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_resolve(params);
        },
        "resolve_stdlib": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_resolve_stdlib(params);
        },
        "resolve_include": lambda(mapping params, object ctx) {
            string include_path = params->includePath || "";
            string current_file = params->currentFile || "";

            // Try to resolve the path
            string resolved_path = "";
            string current_dir = "";

            if (sizeof(current_file) > 0) {
                current_dir = dirname(current_file);
            }

            // Array of paths to try, in order
            array(string) search_paths = ({});

            // 1. Relative to current file directory
            if (sizeof(current_dir) > 0) {
                search_paths += ({ combine_path(current_dir, include_path) });
            }

            // 2. Try as-is
            search_paths += ({ include_path });

            // 3. Try in Pike's include paths from environment
            string include_env = getenv("PIKE_INCLUDE_PATH");
            if (include_env && sizeof(include_env) > 0) {
                foreach(include_env / ":", string inc_dir) {
                    if (sizeof(inc_dir) > 0) {
                        search_paths += ({ combine_path(inc_dir, include_path) });
                    }
                }
            }

            // 4. Pike's runtime include paths (e.g., /usr/local/pike/8.0.1116/lib/include)
            // NOTE: master()->pike_include_path is the correct API.
            // master()->include_path returns 0 (wrong field).
            array(string) pike_includes = master()->pike_include_path || ({});
            foreach(pike_includes, string inc_dir) {
                search_paths += ({ combine_path(inc_dir, include_path) });
            }

            // 5. Pike's runtime module paths (for .pmod resolution)
            array(string) pike_modules = master()->pike_module_path || ({});
            foreach(pike_modules, string mod_dir) {
                search_paths += ({ combine_path(mod_dir, include_path) });
            }

            // Try each path until we find an existing file
            foreach(search_paths, string candidate) {
                mixed stat = file_stat(candidate);
                if (stat) {
                    if (stat->isdir) {
                        string module_file = combine_path(candidate, "module.pmod");
                        if (file_stat(module_file)) {
                            resolved_path = module_file;
                            break;
                        }
                    } else {
                        resolved_path = candidate;
                        break;
                    }
                }
            }

            int exists = sizeof(resolved_path) > 0 ? 1 : 0;

            return ([
                "result": ([
                    "path": resolved_path,
                    "exists": exists,
                    "originalPath": include_path
                ])
            ]);
        },
        "get_inherited": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_get_inherited(params);
        },
        "evaluate_constant": lambda(mapping params, object ctx) {
            // Evaluate a constant expression and return its value
            string expr = params->expression || "";
            string filename = params->filename || "inline.pike";

            if (sizeof(expr) == 0) {
                return (["error": (["code": -32602, "message": "Missing expression parameter"])]);
            }

            // Try to compile and evaluate the expression
            program p;
            mixed err = catch {
                // Wrap expression in a lambda to get its value
                string wrapped = "mixed __eval() { return " + expr + "; }";
                p = compile_string(wrapped);
            };

            if (err) {
                return (["success": 0, "error": "Cannot evaluate expression"]);
            }

            if (!p) {
                return (["success": 0, "error": "Compilation failed"]);
            }

            // Create an instance and call the lambda
            mixed result;
            err = catch {
                object o = p();
                result = o->__eval();
            };

            if (err) {
                return (["success": 0, "error": "Evaluation failed"]);
            }

            // Determine the type
            string type = "unknown";
            if (intp(result)) type = "int";
            else if (floatp(result)) type = "float";
            else if (stringp(result)) type = "string";
            else if (arrayp(result)) type = "array";
            else if (mappingp(result)) type = "mapping";
            else if (multisetp(result)) type = "multiset";

            // Convert result to JSON-safe format
            mixed jsonResult = result;
            if (mappingp(result)) {
                // Convert mapping to object for JSON
                jsonResult = (["_mapping": result]);
            }

            return (["success": 1, "value": jsonResult, "type": type]);
        },
        "find_occurrences": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_find_occurrences(params);
        },
        "find_rename_positions": lambda(mapping params, object ctx) {
            // Load Rename module dynamically to get find_rename_positions function
            program RenameModule = master()->resolv("LSP.Rename");
            if (!RenameModule) {
                return (["error": "LSP.Rename module not available"]);
            }
            return RenameModule->find_rename_positions_request(params);
        },
        "prepare_rename": lambda(mapping params, object ctx) {
            // Load Rename module dynamically to get prepare_rename function
            program RenameModule = master()->resolv("LSP.Rename");
            if (!RenameModule) {
                return (["error": "LSP.Rename module not available"]);
            }
            return RenameModule->prepare_rename_request(params);
        },
        "analyze_uninitialized": lambda(mapping params, object ctx) {
            // DEPRECATED: Use analyze with include: ["diagnostics"]
            werror("[DEPRECATED] analyze_uninitialized method - use analyze with include: ['diagnostics']\n");

            // Call analyze with diagnostics include
            mapping analyze_params = params + (["include":({"diagnostics"}), "build_id": BUILD_ID]);
            mapping response = ctx->analysis->handle_analyze(analyze_params);

            // Extract diagnostics result
            if (response->result && response->result->diagnostics) {
                return (["result": response->result->diagnostics]);
            }

            // Check for failures
            if (response->failures && response->failures->diagnostics) {
                mapping failure = response->failures->diagnostics;
                return ([
                    "error": ([
                        "code": -32000,
                        "message": failure->message || "Diagnostics analysis failed"
                    ])
                ]);
            }

            // Fallback: try original handler if analyze returned empty
            return ctx->analysis->handle_analyze_uninitialized(params);
        },
        "get_completion_context": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_get_completion_context(params);
        },
        "get_completion_context_cached": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_get_completion_context_cached(params);
        },
        "analyze": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_analyze(params);
        },
        "set_debug": lambda(mapping params, object ctx) {
            ctx->debug_mode = params->enabled || 0;
            return ([
                "result": ([
                    "debug_mode": ctx->debug_mode,
                    "message": ctx->debug_mode ? "Debug mode enabled" : "Debug mode disabled"
                ])
            ]);
        },
        "get_version": lambda(mapping params, object ctx) {
            // PERF-012: Track first LSP.Compat load timing
            object timer = System.Timer();
            array(int) ver = master()->resolv("LSP.Compat")->pike_version();
            if (!compat_loaded) {
                compat_loaded = 1;
                compat_load_time = timer->peek() * 1000.0;
                if (startup_phases) {
                    startup_phases->first_compat_load = compat_load_time;
                }
            }
            return ([
                "result": ([
                    "version": sprintf("%d.%d.%d", ver[0], ver[1], ver[2]),
                    "major": ver[0],
                    "minor": ver[1],
                    "build": ver[2],
                    "display": __REAL_VERSION__
                ])
            ]);
        },
        "get_protocol_info": lambda(mapping params, object ctx) {
            return ([
                "result": ([
                    "protocol": "query-engine-v2",
                    "version": "2.0.0",
                    "major": 2,
                    "minor": 0,
                    "build_id": BUILD_ID,
                    "capabilities": ({
                        "snapshot",
                        "cancellation",
                        "analyze"
                    })
                ])
            ]);
        },
        "engine_open_document": lambda(mapping params, object ctx) {
            string uri = (string)(params->uri || "");
            if (!sizeof(uri)) {
                return (["error": (["code": -32602, "message": "Missing uri"]) ]);
            }

            qe2_documents[uri] = ([
                "uri": uri,
                "languageId": (string)(params->languageId || "pike"),
                "version": (int)(params->version || 0),
                "text": (string)(params->text || "")
            ]);
            qe2_bump_revision();
            return (["result": qe2_ack()]);
        },
        "engine_change_document": lambda(mapping params, object ctx) {
            string uri = (string)(params->uri || "");
            if (!sizeof(uri)) {
                return (["error": (["code": -32602, "message": "Missing uri"]) ]);
            }

            mapping(string:mixed) doc = qe2_documents[uri] || (["uri": uri, "languageId": "pike", "text": ""]);
            doc->version = (int)(params->version || (doc->version || 0));
            if (stringp(params->text)) {
                doc->text = (string)params->text;
            }
            if (arrayp(params->changes)) {
                doc->changes = params->changes;
            }
            qe2_documents[uri] = doc;
            qe2_bump_revision();
            return (["result": qe2_ack()]);
        },
        "engine_close_document": lambda(mapping params, object ctx) {
            string uri = (string)(params->uri || "");
            if (!sizeof(uri)) {
                return (["error": (["code": -32602, "message": "Missing uri"]) ]);
            }

            m_delete(qe2_documents, uri);
            qe2_bump_revision();
            return (["result": qe2_ack()]);
        },
        "engine_update_config": lambda(mapping params, object ctx) {
            qe2_settings = mappingp(params->settings) ? params->settings : ([]);
            qe2_bump_revision();
            return (["result": qe2_ack()]);
        },
        "engine_update_workspace": lambda(mapping params, object ctx) {
            qe2_workspace = ([
                "roots": arrayp(params->roots) ? params->roots : ({}),
                "added": arrayp(params->added) ? params->added : ({}),
                "removed": arrayp(params->removed) ? params->removed : ({})
            ]);
            qe2_bump_revision();
            return (["result": qe2_ack()]);
        },
        "engine_query": lambda(mapping params, object ctx) {
            object query_timer = System.Timer();
            string request_id = (string)(params->requestId || "");
            if (qe2_take_cancelled(request_id)) {
                return ([
                    "error": ([
                        "code": -32800,
                        "message": "Request cancelled"
                    ])
                ]);
            }
            mapping snapshot = mappingp(params->snapshot) ? params->snapshot : ([]);
            string snapshot_mode = (string)(snapshot->mode || "latest");
            string snapshot_used = snapshot_mode == "fixed" && stringp(snapshot->snapshotId)
                ? (string)snapshot->snapshotId
                : qe2_snapshot_id();

            mapping query_params = mappingp(params->queryParams) ? params->queryParams : ([]);
            string feature = (string)(params->feature || "unknown");

            if (feature == "diagnostics") {
                mapping analyze_params = ([
                    "code": (string)(query_params->text || ""),
                    "filename": (string)(query_params->filename || "input.pike"),
                    "include": ({ "parse", "introspect", "diagnostics", "tokenize" }),
                    "version": (int)(query_params->version || 0)
                ]);

                mapping analyze_response = ctx->analysis->handle_analyze(analyze_params);

                if (qe2_take_cancelled(request_id)) {
                    return ([
                        "error": ([
                            "code": -32800,
                            "message": "Request cancelled"
                        ])
                    ]);
                }

                return ([
                    "result": ([
                        "requestId": request_id,
                        "snapshotIdUsed": snapshot_used,
                        "result": ([
                            "feature": feature,
                            "revision": qe2_revision,
                            "analyzeResult": analyze_response
                        ]),
                        "metrics": (["durationMs": query_timer->peek() * 1000.0])
                    ])
                ]);
            }

            if (feature == "definition" || feature == "references") {
                string code = (string)(query_params->text || "");
                string target_uri = (string)(query_params->uri || "");
                mapping position = mappingp(query_params->position) ? query_params->position : ([]);
                int line_idx = (int)(position->line || 0);
                int char_idx = (int)(position->character || 0);
                string target_symbol = "";

                array(string) code_lines = code / "\n";
                if (line_idx >= 0 && line_idx < sizeof(code_lines)) {
                    string line_text = code_lines[line_idx] || "";

                    if (char_idx < 0) {
                        char_idx = 0;
                    }
                    if (char_idx > sizeof(line_text)) {
                        char_idx = sizeof(line_text);
                    }

                    int start_idx = char_idx;
                    int end_idx = char_idx;

                    while (start_idx > 0) {
                        int c = line_text[start_idx - 1];
                        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_')) {
                            break;
                        }
                        start_idx--;
                    }

                    while (end_idx < sizeof(line_text)) {
                        int c = line_text[end_idx];
                        if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_')) {
                            break;
                        }
                        end_idx++;
                    }

                    if (end_idx > start_idx) {
                        target_symbol = line_text[start_idx..end_idx - 1];
                    }
                }

                mapping occurrences_response = ctx->analysis->handle_find_occurrences(([
                    "code": code,
                ]));

                array(mapping) occurrences = ({});
                if (mappingp(occurrences_response->result) && arrayp(occurrences_response->result->occurrences)) {
                    occurrences = occurrences_response->result->occurrences;
                }

                if (qe2_take_cancelled(request_id)) {
                    return ([
                        "error": ([
                            "code": -32800,
                            "message": "Request cancelled"
                        ])
                    ]);
                }

                array(mapping) locations = ({});
                int occurrence_index = 0;
                foreach (occurrences, mapping occ) {
                    occurrence_index += 1;
                    if (occurrence_index % 64 == 0 && qe2_take_cancelled(request_id)) {
                        return ([
                            "error": ([
                                "code": -32800,
                                "message": "Request cancelled"
                            ])
                        ]);
                    }
                    string occ_text = (string)(occ->text || "");
                    if (!sizeof(occ_text)) {
                        continue;
                    }
                    if (sizeof(target_symbol) && occ_text != target_symbol) {
                        continue;
                    }

                    int occ_line = (int)(occ->line || 1);
                    int occ_char = (int)(occ->character || 0);

                    locations += ({([
                        "uri": target_uri,
                        "range": ([
                            "start": ([
                                "line": occ_line > 0 ? occ_line - 1 : 0,
                                "character": occ_char,
                            ]),
                            "end": ([
                                "line": occ_line > 0 ? occ_line - 1 : 0,
                                "character": occ_char + sizeof(occ_text),
                            ]),
                        ]),
                    ])});
                }

                if (feature == "definition" && sizeof(locations) > 1) {
                    locations = ({ locations[0] });
                }

                return ([
                    "result": ([
                        "requestId": request_id,
                        "snapshotIdUsed": snapshot_used,
                        "result": ([
                            "feature": feature,
                            "revision": qe2_revision,
                            "locations": locations,
                        ]),
                        "metrics": (["durationMs": query_timer->peek() * 1000.0])
                    ])
                ]);
            }

            if (feature == "completion") {
                string code = (string)(query_params->text || "");
                mapping occurrences_response = ctx->analysis->handle_find_occurrences(([
                    "code": code,
                ]));

                array(mapping) occurrences = ({});
                if (mappingp(occurrences_response->result) && arrayp(occurrences_response->result->occurrences)) {
                    occurrences = occurrences_response->result->occurrences;
                }

                if (qe2_take_cancelled(request_id)) {
                    return ([
                        "error": ([
                            "code": -32800,
                            "message": "Request cancelled"
                        ])
                    ]);
                }

                multiset(string) seen = (<>);
                array(mapping) items = ({});

                int completion_occurrence_index = 0;
                foreach (occurrences, mapping occ) {
                    completion_occurrence_index += 1;
                    if (completion_occurrence_index % 64 == 0 && qe2_take_cancelled(request_id)) {
                        return ([
                            "error": ([
                                "code": -32800,
                                "message": "Request cancelled"
                            ])
                        ]);
                    }
                    string label = (string)(occ->text || "");
                    if (!sizeof(label)) {
                        continue;
                    }
                    if (seen[label]) {
                        continue;
                    }
                    seen[label] = 1;
                    items += ({([
                        "label": label,
                    ])});
                }

                return ([
                    "result": ([
                        "requestId": request_id,
                        "snapshotIdUsed": snapshot_used,
                        "result": ([
                            "feature": feature,
                            "revision": qe2_revision,
                            "items": items,
                        ]),
                        "metrics": (["durationMs": query_timer->peek() * 1000.0])
                    ])
                ]);
            }

            return ([
                "result": ([
                    "requestId": request_id,
                    "snapshotIdUsed": snapshot_used,
                    "result": ([
                        "feature": feature,
                        "status": "stub",
                        "revision": qe2_revision,
                        "documentCount": sizeof(qe2_documents)
                    ]),
                    "metrics": (["durationMs": query_timer->peek() * 1000.0])
                ])
            ]);
        },
        "engine_cancel_request": lambda(mapping params, object ctx) {
            string request_id = (string)(params->requestId || "");
            if (sizeof(request_id)) {
                qe2_cancelled_requests[request_id] = 1;
            }
            return (["result": (["accepted": 1])]);
        },
        "get_startup_metrics": lambda(mapping params, object ctx) {
            // PERF-012: Include context_created flag to indicate lazy state
            mapping result = startup_phases + ([
                "context_created": ctx_initialized
            ]);
            return ([
                "result": ([
                    "startup": result
                ])
            ]);
        },
        "get_cache_stats": lambda(mapping params, object ctx) {
            // PERF-13-04: Return compilation cache statistics
            mixed CacheClass = master()->resolv("LSP.CompilationCache");
            // Note: CompilationCache is a module (object), not a class, so use objectp check
            if (CacheClass && (mappingp(CacheClass) || programp(CacheClass) || objectp(CacheClass))) {
                // LSP.CompilationCache uses module-level state
                return (["result": CacheClass->get_stats()]);
            }
            // Fallback if cache not available
            return (["result": ([
                "hits": 0,
                "misses": 0,
                "evictions": 0,
                "size": 0,
                "max_files": 500
            ])]);
        },
        "invalidate_cache": lambda(mapping params, object ctx) {
            // PERF-15-01: Invalidate cache entries for testing
            mixed CacheClass = master()->resolv("LSP.CompilationCache");
            if (CacheClass && (mappingp(CacheClass) || programp(CacheClass) || objectp(CacheClass))) {
                string path = params->path || "";
                int transitive = params->transitive || 0;

                // Note: Don't resolve to absolute path - cache stores filenames as-is
                // The invalidate method uses exact path matching with compilation_cache keys

                if (transitive) {
                    CacheClass->invalidate(path, 1);  // Transitive invalidation
                } else {
                    CacheClass->invalidate(path, 0);  // Direct invalidation
                }

                return (["result": (["status": "invalidated", "path": path])]);
            }
            return (["error": (["code": -32601, "message": "Cache not available"])]);
        },
        "extract_imports": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_extract_imports(params);
        },
        "resolve_import": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_resolve_import(params);
        },
        "check_circular": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_check_circular(params);
        },
        "get_waterfall_symbols": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_get_waterfall_symbols(params);
        },
        "roxen_detect": lambda(mapping params, object ctx) {
            if (!ctx->roxen) {
                return (["error": (["code": -32601, "message": "Roxen module not available"])]);
            }
            return ctx->roxen->detect_module(params);
        },
        "roxen_parse_tags": lambda(mapping params, object ctx) {
            if (!ctx->roxen) {
                return (["error": (["code": -32601, "message": "Roxen module not available"])]);
            }
            return ctx->roxen->parse_tags(params);
        },
        "roxen_parse_vars": lambda(mapping params, object ctx) {
            if (!ctx->roxen) {
                return (["error": (["code": -32601, "message": "Roxen module not available"])]);
            }
            return ctx->roxen->parse_vars(params);
        },
        "roxen_get_callbacks": lambda(mapping params, object ctx) {
            if (!ctx->roxen) {
                return (["error": (["code": -32601, "message": "Roxen module not available"])]);
            }
            return ctx->roxen->get_callbacks(params);
        },
        "roxen_validate": lambda(mapping params, object ctx) {
            if (!ctx->roxen) {
                return (["error": (["code": -32601, "message": "Roxen module not available"])]);
            }
            return ctx->roxen->validate_api(params);
        },
        "roxen_generate_skeleton": lambda(mapping params, object ctx) {
            string module_type = params->moduleType || "MODULE_TAG";
            string module_name = params->moduleName || "MyModule";
            int include_defvar = params->includeDefvar || 1;
            int include_comments = params->includeComments || 1;

            string code = "";

            if (include_comments) {
                code += "// " + module_name + " - Generated by Pike LSP\n";
                code += "// Module type: " + module_type + "\n\n";
            }

            code += "inherit \"module\";\n\n";
            code += "constant module_type = " + module_type + ";\n";
            code += "constant module_name = \"" + module_name + "\";\n";
            code += "constant module_version = \"1.0\";\n\n";

            if (module_type == "MODULE_LOCATION") {
                code += "mapping(string:mixed) find_file(string f, RequestID id);\n\n";
            }

            if (include_defvar) {
                code += "defvar(\"enabled\", 1, TYPE_FLAG, \"Enable this module\");\n";
                code += "defvar(\"mountpoint\", \"/\", TYPE_STRING, \"Mount point\");\n";
                if (module_type == "MODULE_LOCATION") {
                    code += "defvar(\"extensions\", ({ \"html\", \"htm\" }), TYPE_STRING_LIST, \"File extensions\");\n";
                }
            }

            code += "\nvoid create() {}\n\n";
            code += "int start() { return 1; }\n\n";
            code += "void stop() {}\n";

            return ([
                "result": ([
                    "code": code,
                    "moduleType": module_type,
                    "moduleName": module_name
                ])
            ]);
        },
        "roxenExtractRXMLStrings": lambda(mapping params, object ctx) {
            if (!ctx->roxen) {
                return (["error": (["code": -32601, "message": "Roxen module not available"])]);
            }
            // Load MixedContent module on first use
            program MixedContentClass = master()->resolv("LSP.Roxen.MixedContent");
            if (!MixedContentClass) {
                return (["error": (["code": -32601, "message": "Roxen MixedContent module not available"])]);
            }
            mixed mc = MixedContentClass();
            return mc->roxen_extract_rxml_strings(params);
        },
        "get_pike_paths": lambda(mapping params, object ctx) {
            // Return Pike's include and module paths for include/import resolution
            // NOTE: master()->pike_include_path and pike_module_path are the correct APIs.
            // master()->include_path and module_path return 0 (wrong fields).
            array(string) include_paths = master()->pike_include_path || ({});
            array(string) module_paths = master()->pike_module_path || ({});

            return ([
                "result": ([
                    "include_paths": include_paths,
                    "module_paths": module_paths,
                ])
            ]);
        },
        "get_type_at_position": lambda(mapping params, object ctx) {
            // Get scope-aware type of a variable at a specific position
            string code = params->code || "";
            string filename = params->filename || "inline.pike";
            int line = params->line || 0;  // 1-indexed
            string variable_name = params->variableName || "";

            if (sizeof(code) == 0 || sizeof(variable_name) == 0 || line == 0) {
                return ([
                    "error": ([
                        "code": -32602,
                        "message": "Missing required parameters: code, filename, line, variableName"
                    ])
                ]);
            }

            // Load ScopeResolver module
            program ScopeResolverClass = master()->resolv("LSP.Analysis.ScopeResolver");
            if (!ScopeResolverClass) {
                return ([
                    "error": ([
                        "code": -32601,
                        "message": "ScopeResolver module not available"
                    ])
                ]);
            }

            mixed resolver = ScopeResolverClass();
            mixed result = resolver->resolve_variable_type(code, filename, line, variable_name);

            if (!result) {
                return ([
                    "result": ([
                        "found": 0
                    ])
                ]);
            }

            return ([
                "result": ([
                    "found": 1,
                    "type": result->type,
                    "scopeDepth": result->scope_depth,
                    "declLine": result->decl_line
                ])
            ]);
        },
    ]);

    // PERF-011: Record handlers phase time
    startup_phases->handlers = startup_timer->peek() * 1000.0;

    // PERF-012: Server is ready to accept requests (Context not created yet)
    startup_phases->ready = startup_timer->peek() * 1000.0;

    // PERF-011: Record total startup time (excludes Context which is lazy)
    startup_phases->total = startup_timer->peek() * 1000.0;

    // Interactive JSON-RPC mode: read requests from stdin, write responses to stdout
    // CRITICAL: Must use line-by-line reading (gets) NOT read() which waits for EOF
    string line;
    while ((line = Stdio.stdin.gets())) {
        if (sizeof(String.trim_all_whites(line)) == 0) continue;

        mixed err = catch {
            mapping request = Standards.JSON.decode(line);
            // PERF-012: Lazy Context initialization on first request
            Context current_ctx = get_context();
            mapping response = handle_request(request, current_ctx);
            response->jsonrpc = "2.0";
            response->id = request->id;
            write("%s\n", Standards.JSON.encode(response));
        };

        if (err) {
            write("%s\n", Standards.JSON.encode(([
                "jsonrpc": "2.0",
                "error": ([
                    "code": -32700,
                    "message": "Parse error: " + describe_error(err)
                ])
            ])));
        }
    }

    return 0;
}
