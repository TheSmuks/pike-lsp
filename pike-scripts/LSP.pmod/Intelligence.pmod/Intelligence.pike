//! Intelligence.pike - Backward-compatible delegating class
//!
//! This class forwards all handler calls to the appropriate specialized class
//! in the Intelligence.pmod/ namespace.
//!
//! Usage in analyzer.pike:
//!   program IntelligenceClass = master()->resolv("LSP.Intelligence.Intelligence");
//!   intelligence = IntelligenceClass();

//! Private handler instances (created on first use)
private object introspection_handler;
private object resolution_handler;
private object type_analysis_handler;
private object module_resolution_handler;

//! Create a new Intelligence instance
void create() {
    // Handlers are created lazily when first needed
}

//! Helper to create an LSP Error response without static dependency
protected mapping make_error_response(int code, string message) {
    mixed lsp_error_class = master()->resolv("LSP.module.LSPError");
    if (lsp_error_class) {
        return lsp_error_class(code, message)->to_response();
    }
    // Fallback if LSP module not loaded
    return ([
        "error": ([
            "code": code,
            "message": message
        ])
    ]);
}

//! Get or create the introspection handler
protected object get_introspection_handler() {
    if (!introspection_handler) {
        mixed intro_class = master()->resolv("LSP.Intelligence.Introspection");
        if (intro_class && programp(intro_class)) {
            introspection_handler = intro_class(0);
        }
    }
    return introspection_handler;
}

//! Get or create the resolution handler
protected object get_resolution_handler() {
    if (!resolution_handler) {
        mixed res_class = master()->resolv("LSP.Intelligence.Resolution");
        if (res_class && programp(res_class)) {
            resolution_handler = res_class(0);
        }
    }
    return resolution_handler;
}

//! Get or create the type analysis handler
protected object get_type_analysis_handler() {
    if (!type_analysis_handler) {
        mixed type_class = master()->resolv("LSP.Intelligence.TypeAnalysis");
        if (type_class && programp(type_class)) {
            type_analysis_handler = type_class(0);
        }
    }
    return type_analysis_handler;
}

//! Get or create the module resolution handler
protected object get_module_resolution_handler() {
    if (!module_resolution_handler) {
        mixed mod_class = master()->resolv("LSP.Intelligence.ModuleResolution");
        if (mod_class && programp(mod_class)) {
            module_resolution_handler = mod_class(0);
        }
    }
    return module_resolution_handler;
}

//! Introspect Pike code by compiling it and extracting symbol information
//! Delegates to Introspection class in Intelligence.pmod/
mapping handle_introspect(mapping params) {
    object handler = get_introspection_handler();
    if (handler) {
        return handler->handle_introspect(params);
    }
    return make_error_response(-32000, "Introspection handler not available");
}

//! Resolve module path to file system location
//! Delegates to Resolution class in Intelligence.pmod/
mapping handle_resolve(mapping params) {
    object handler = get_resolution_handler();
    if (handler) {
        return handler->handle_resolve(params);
    }
    return make_error_response(-32000, "Resolution handler not available");
}

//! Resolve stdlib module and extract symbols with documentation
//! Delegates to Resolution class in Intelligence.pmod/
mapping handle_resolve_stdlib(mapping params) {
    object handler = get_resolution_handler();
    if (handler) {
        return handler->handle_resolve_stdlib(params);
    }
    return make_error_response(-32000, "Resolution handler not available");
}

//! Get inherited members from a class
//! Delegates to TypeAnalysis class in Intelligence.pmod/
mapping handle_get_inherited(mapping params) {
    object handler = get_type_analysis_handler();
    if (handler) {
        return handler->handle_get_inherited(params);
    }
    return make_error_response(-32000, "TypeAnalysis handler not available");
}

//! Introspect a compiled program to extract symbols
//! Delegates to Introspection class in Intelligence.pmod/
//!
//! This is a public method for use by handle_analyze in Analysis.pike
//! for request consolidation (Phase 12).
//!
//! @param prog The compiled program to introspect
//! @returns Mapping containing symbols, functions, variables, classes, inherits
mapping introspect_program(program prog) {
    object handler = get_introspection_handler();
    if (handler) {
        return handler->introspect_program(prog);
    }
    return make_error_response(-32000, "Introspection handler not available");
}

//! Extract import/include/inherit/require directives from Pike code
//! Delegates to ModuleResolution class in Intelligence.pmod/
mapping handle_extract_imports(mapping params) {
    // DEBUG: Force resolution to avoid caching issues
    if (!module_resolution_handler) {
        werror("DEBUG: Attempting to resolve LSP.Intelligence.ModuleResolution\n");
        mixed mod_class = master()->resolv("LSP.Intelligence.ModuleResolution");
        werror("DEBUG: mod_class = %O\n", mod_class);
        werror("DEBUG: programp(mod_class) = %d\n", programp(mod_class));

        if (mod_class && programp(mod_class)) {
            werror("DEBUG: Creating ModuleResolution instance\n");
            module_resolution_handler = mod_class(0);
            werror("DEBUG: module_resolution_handler = %O\n", module_resolution_handler);
        } else {
            werror("DEBUG: Failed to resolve or not a program\n");
        }
    }

    if (module_resolution_handler) {
        werror("DEBUG: Calling handler->handle_extract_imports\n");
        return module_resolution_handler->handle_extract_imports(params);
    }
    werror("DEBUG: Handler is NULL, returning error\n");
    return make_error_response(-32000, "ModuleResolution handler not available");
}

//! Resolve an import/include/inherit/require directive to its file path
//! Delegates to ModuleResolution class in Intelligence.pmod/
mapping handle_resolve_import(mapping params) {
    object handler = get_module_resolution_handler();
    if (handler) {
        return handler->handle_resolve_import(params);
    }
    return make_error_response(-32000, "ModuleResolution handler not available");
}

//! Check for circular dependencies in a dependency graph
//! Delegates to ModuleResolution class in Intelligence.pmod/
mapping handle_check_circular(mapping params) {
    object handler = get_module_resolution_handler();
    if (handler) {
        return handler->handle_check_circular(params);
    }
    return make_error_response(-32000, "ModuleResolution handler not available");
}

//! Get symbols with waterfall loading (transitive dependency resolution)
//! Delegates to ModuleResolution class in Intelligence.pmod/
mapping handle_get_waterfall_symbols(mapping params) {
    object handler = get_module_resolution_handler();
    if (handler) {
        return handler->handle_get_waterfall_symbols(params);
    }
    return make_error_response(-32000, "ModuleResolution handler not available");
}
