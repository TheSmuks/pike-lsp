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
    werror("Module Path: %O\n", master()->module_path);
    werror("Include Path: %O\n", master()->include_path);


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

            // 4. Try Pike's default lib directory
            string pike_lib = "/usr/local/pike/8.0.1116/lib";
            if (file_stat(pike_lib)) {
                search_paths += ({ combine_path(pike_lib, "include", include_path) });
                search_paths += ({ combine_path(pike_lib, include_path) });
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
        "find_occurrences": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_find_occurrences(params);
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
