#!/usr/bin/env pike
#pike __REAL_VERSION__

//! Pike LSP Analyzer Script
//!
//! Lightweight JSON-RPC router that delegates to LSP modules:
//! - Parser.pike: parse, tokenize, compile, batch_parse
//! - Intelligence.pike: introspect, resolve, resolve_stdlib, get_inherited
//! - Analysis.pike: find_occurrences, analyze_uninitialized, get_completion_context
//!
//! Protocol: JSON-RPC over stdin/stdout
//! Architecture: Dispatch table router with Context service container

// MAINT-004: Configuration constants
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

// PERF-005: Debug mode (disabled by default for performance)
int debug_mode = 0;

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
    int debug_mode;
    mapping client_capabilities;

    void create() {
        // Initialize module instances using master()->resolv pattern
        // LSP.Parser, LSP.Intelligence, LSP.Analysis are programs/classes
        program ParserClass = master()->resolv("LSP.Parser");
        parser = ParserClass();

        program IntelligenceClass = master()->resolv("LSP.Intelligence");
        intelligence = IntelligenceClass();

        program AnalysisClass = master()->resolv("LSP.Analysis");
        analysis = AnalysisClass();

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
    // Get handler from dispatch table
    function handler = HANDLERS[method];

    if (!handler) {
        return ([
            "error": ([
                "code": -32601,
                "message": "Method not found: " + method
            ])
        ]);
    }

    // Call handler with error normalization - Context passed through
    mixed err = catch {
        return handler(params, ctx);
    };

    return ([
        "error": ([
            "code": -32000,
            "message": describe_error(err)
        ])
    ]);
}

//! handle_request - entry point for JSON-RPC requests
//! Delegates to dispatch() function for routing
protected mapping(string:mixed) handle_request(mapping(string:mixed) request, Context ctx) {
    string method = request->method || "";
    mapping params = request->params || ([]);
    return dispatch(method, params, ctx);
}

int main(int argc, array(string) argv) {
    // Add module path for LSP.pmod access
    // Use __FILE__ to get the directory containing this script, so it works
    // regardless of the current working directory (e.g., when bundled in extension)
    string script_dir = dirname(__FILE__);
    master()->add_module_path(script_dir);

    // Log Pike version for debugging
    array(int) version = master()->resolv("LSP.Compat")->pike_version();
    werror("Pike LSP Analyzer running on Pike %d.%d.%d\n",
           version[0], version[1], version[2]);

    // Initialize HANDLERS dispatch table after module path is set
    // Per CONTEXT.md Router Design Pattern
    HANDLERS = ([
        "parse": lambda(mapping params, object ctx) {
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
        "introspect": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_introspect(params);
        },
        "resolve": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_resolve(params);
        },
        "resolve_stdlib": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_resolve_stdlib(params);
        },
        "get_inherited": lambda(mapping params, object ctx) {
            return ctx->intelligence->handle_get_inherited(params);
        },
        "find_occurrences": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_find_occurrences(params);
        },
        "analyze_uninitialized": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_analyze_uninitialized(params);
        },
        "get_completion_context": lambda(mapping params, object ctx) {
            return ctx->analysis->handle_get_completion_context(params);
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
    ]);

    // Create Context instance (service container with all modules)
    Context ctx = Context();

    // Interactive JSON-RPC mode: read requests from stdin, write responses to stdout
    // CRITICAL: Must use line-by-line reading (gets) NOT read() which waits for EOF
    string line;
    while ((line = Stdio.stdin.gets())) {
        if (sizeof(String.trim_all_whites(line)) == 0) continue;

        mixed err = catch {
            mapping request = Standards.JSON.decode(line);
            mapping response = handle_request(request, ctx);
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
