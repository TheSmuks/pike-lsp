//! Analysis.pike - Delegating analysis class for Pike LSP
//!
//! This class forwards requests to specialized handlers in the Analysis module:
//! - Diagnostics.pike: Uninitialized variable analysis
//! - Completions.pike: Completion context analysis
//! - Variables.pike: Find identifier occurrences
//!
//! It also handles request consolidation (analyze with include=["..."])

class Analysis {
    //! Private handler instances (created on first use)
    private object diagnostics_handler;
    private object completions_handler;
    private object variables_handler;

    //! Create a new Analysis instance
    void create() {
        // Handlers are created lazily when first needed
    }

    //! Get or create the diagnostics handler
    protected object get_diagnostics_handler() {
        if (!diagnostics_handler) {
            mixed diag_class = master()->resolv("LSP.Analysis.Diagnostics");
            if (diag_class && programp(diag_class)) {
                diagnostics_handler = diag_class(0);
            }
        }
        return diagnostics_handler;
    }

    //! Get or create the completions handler
    protected object get_completions_handler() {
        if (!completions_handler) {
            mixed comp_class = master()->resolv("LSP.Analysis.Completions");
            if (comp_class && programp(comp_class)) {
                completions_handler = comp_class(0);
            }
        }
        return completions_handler;
    }

    //! Get or create the variables handler
    protected object get_variables_handler() {
        if (!variables_handler) {
            mixed var_class = master()->resolv("LSP.Analysis.Variables");
            if (var_class && programp(var_class)) {
                variables_handler = var_class(0);
            }
        }
        return variables_handler;
    }

    //! Analyze code for potentially uninitialized variable usage
    //! Delegates to Diagnostics class in Analysis.pmod/
    mapping handle_analyze_uninitialized(mapping params) {
        object handler = get_diagnostics_handler();
        if (handler) {
            return handler->handle_analyze_uninitialized(params);
        }
        return (["result": (["diagnostics": ({})])]);
    }

    //! Get completion context at a specific position
    //! Delegates to Completions class in Analysis.pmod/
    mapping handle_get_completion_context(mapping params) {
        object handler = get_completions_handler();
        if (handler) {
            return handler->handle_get_completion_context(params);
        }
        return (["result": (["context": "none", "objectName": "", "prefix": "", "operator": ""])]);
    }

    //! Find all identifier occurrences
    //! Delegates to Variables class in Analysis.pmod/
    mapping handle_find_occurrences(mapping params) {
        object handler = get_variables_handler();
        if (handler) {
            return handler->handle_find_occurrences(params);
        }
        return (["error": (["code": -32000, "message": "Variables handler not available"])]);
    }

    //! Get CompilationCache from module-level singleton
    protected object get_compilation_cache() {
        mixed CacheClass = master()->resolv("LSP.CompilationCache");
        if (CacheClass && (mappingp(CacheClass) || programp(CacheClass) || objectp(CacheClass))) {
            return CacheClass;
        }
        return 0;
    }

    //! Unified analyze handler
    mapping handle_analyze(mapping params) {
        string code = params->code || "";
        string filename = params->filename || "input.pike";
        array(string) include = params->include || ({});
        int|string lsp_version = params->version;
        string build_id = params->build_id;

        // Valid include types
        multiset(string) VALID_INCLUDE_TYPES = (<
            "parse", "introspect", "diagnostics", "tokenize"
        >);

        // Validate include types
        array(string) valid_include = ({});
        foreach (include, string type) {
            if (VALID_INCLUDE_TYPES[type]) {
                valid_include += ({ type });
            }
        }

        if (sizeof(valid_include) == 0) {
            return ([
                "result": ([]),
                "failures": ([])
            ]);
        }

        // Shared data structures
        array tokens = ({});
        program compiled_prog = 0;
        array(string) split_tokens = ({});
        mapping(string:mixed) result = ([]);
        mapping(string:mixed) failures = ([]);
        array(mapping) compilation_errors = ({});

        // Step 1: Tokenization
        int needs_tokenization = has_value(valid_include, "parse") ||
                                 has_value(valid_include, "diagnostics") ||
                                 has_value(valid_include, "tokenize");

        if (needs_tokenization) {
            mixed tok_err = catch {
                split_tokens = Parser.Pike.split(code);
                tokens = Parser.Pike.tokenize(split_tokens);
            };

            if (tok_err) {
                string error_msg = describe_error(tok_err);
                if (has_value(valid_include, "tokenize")) failures->tokenize = (["message": error_msg, "kind": "ParseError"]);
                if (has_value(valid_include, "parse")) failures->parse = (["message": error_msg, "kind": "ParseError"]);
                if (has_value(valid_include, "diagnostics")) failures->diagnostics = (["message": error_msg, "kind": "ParseError"]);
            } else {
                if (has_value(valid_include, "tokenize")) {
                    array tokenize_result = ({});
                    foreach (tokens, mixed t) {
                        tokenize_result += ({ (["text": t->text, "line": t->line, "file": t->file || filename]) });
                    }
                    result->tokenize = ([ "tokens": tokenize_result ]);
                }
            }
        }

        // Step 2: Compilation
        int needs_compilation = has_value(valid_include, "introspect") ||
                                has_value(valid_include, "diagnostics");

        if (needs_compilation) {
            object cache = get_compilation_cache();
            string cache_key = 0;
            if (cache) cache_key = cache->make_cache_key(filename, lsp_version);

            object cached_result = 0;
            if (cache && cache_key) {
                cached_result = cache->get(filename, cache_key);
                if (cached_result && cached_result->compiled_program) {
                    compiled_prog = cached_result->compiled_program;
                }
            }

            if (!compiled_prog) {
                // Use DependencyTrackingCompiler
                mixed CompilerClass = master()->resolv("LSP.CompilationCache.DependencyTrackingCompiler");
                mixed compile_err;

                if (CompilerClass && programp(CompilerClass)) {
                    object compiler = CompilerClass();
                    compile_err = catch {
                        compiled_prog = compiler->compile_with_tracking(code, filename);
                    };
                    compilation_errors = compiler->get_diagnostics();

                    if (!compile_err && compiled_prog && cache && cache_key) {
                        array(string) deps = compiler->get_dependencies();
                        mixed ResultClass = master()->resolv("LSP.CompilationCache.CompilationResult");
                        if (ResultClass) {
                            object res = ResultClass(compiled_prog, ({}), deps);
                            cache->put(filename, cache_key, res);
                        }
                    }
                } else {
                    // Fallback
                    void capture_compile_error(string file, int line, string msg) {
                        compilation_errors += ({ (["message": msg, "severity": "error", "position": (["file": file, "line": line])]) });
                    };
                    mixed old_eh = master()->get_inhibit_compile_errors();
                    master()->set_inhibit_compile_errors(capture_compile_error);
                    compile_err = catch { compiled_prog = compile_string(code, filename); };
                    master()->set_inhibit_compile_errors(old_eh);
                }

                if ((compile_err || !compiled_prog) && has_value(valid_include, "introspect")) {
                    failures->introspect = (["message": describe_error(compile_err || "Compilation failed"), "kind": "CompilationError"]);
                }
            }
        }

        // Step 3: Process results

        // Parse
        if (has_value(valid_include, "parse") && !failures->parse) {
            mixed parse_err = catch {
                program ParserClass = master()->resolv("LSP.Parser");
                object parser = ParserClass();
                mapping parse_response = parser->parse_request((["code": code, "filename": filename, "line": 1]));
                if (parse_response && parse_response->result) result->parse = parse_response->result;
                else failures->parse = (["message": "Parse returned no result", "kind": "InternalError"]);
            };
            if (parse_err) failures->parse = (["message": describe_error(parse_err), "kind": "ParseError"]);
        }

        // Introspect
        if (has_value(valid_include, "introspect") && !failures->introspect) {
            mixed introspect_err = catch {
                program IntelligenceClass = master()->resolv("LSP.Intelligence.Intelligence");
                object intelligence = IntelligenceClass();
                mapping introspect_result = intelligence->introspect_program(compiled_prog);
                introspect_result->success = 1;
                introspect_result->diagnostics = ({});
                result->introspect = introspect_result;
            };
            if (introspect_err) failures->introspect = (["message": describe_error(introspect_err), "kind": "ResolutionError"]);
        }

        // Diagnostics
        if (has_value(valid_include, "diagnostics") && !failures->diagnostics) {
            array all_diagnostics = compilation_errors + ({});

            // Add Build/Env Info Diagnostic
            if (build_id) {
                // Add as an Information diagnostic at the top of the file
                // We do this only if requested (build_id present) and usually always useful
                // to verify which version is running.
                string env_info = sprintf("Pike LSP Build: %s | Pike: %s",
                    build_id, (string)__REAL_VERSION__);

                // Add paths only if verbose or if there are errors?
                // Let's add them always for now as requested.
                env_info += sprintf("\nInclude: %O", master()->include_path);
                env_info += sprintf("\nModule: %O", master()->module_path);

                all_diagnostics += ({
                    ([
                        "message": env_info,
                        "severity": "information",
                        "position": ([
                            "file": filename,
                            "line": 1,
                            "character": 0
                        ]),
                        "source": "pike-lsp-info"
                    ])
                });
            }

            mixed diag_err = catch {
                object diag_handler = get_diagnostics_handler();
                if (diag_handler) {
                    mapping diag_response = diag_handler->handle_analyze_uninitialized((["code": code, "filename": filename]));
                    if (diag_response && diag_response->result && diag_response->result->diagnostics) {
                        all_diagnostics += diag_response->result->diagnostics;
                    }
                }
            };

            result->diagnostics = ([ "diagnostics": all_diagnostics ]);
        }

        return ([
            "result": result,
            "failures": failures
        ]);
    }
}
