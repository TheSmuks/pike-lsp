#!/usr/bin/env pike
//! LSP Module Loading Tests
//!
//! Smoke tests to verify all LSP modules load correctly on the installed Pike version.
//! This provides fail-fast CI verification that the refactored modular codebase
//! can be loaded, catching syntax errors, missing dependencies, circular imports,
//! and compat shim failures before running slower integration tests.
//!
//! Run with: pike test/tests/module-load-tests.pike

int tests_run = 0;
int tests_passed = 0;
int tests_failed = 0;
array(string) failures = ({});
array(string) module_errors = ({});

//! Setup module path for LSP.pmod imports
void setup_module_path() {
    string script_path = __FILE__;
    string base_path = dirname(script_path);
    // Navigate up to find pike-lsp directory
    for (int i = 0; i < 10; i++) {
        if (basename(base_path) == "pike-lsp") {
            break;
        }
        string parent = dirname(base_path);
        if (parent == base_path) break;  // Reached root
        base_path = parent;
    }
    string pike_scripts_path = combine_path(base_path, "pike-scripts");
    master()->add_module_path(pike_scripts_path);
}

//! Run a single test function with error handling
//!
//! @param test_func The test function to execute
//! @param name Descriptive name for the test
void run_test(function test_func, string name) {
    tests_run++;
    mixed err = catch {
        test_func();
        tests_passed++;
        write("  PASS: %s\n", name);
    };
    if (err) {
        tests_failed++;
        failures += ({ name });
        write("  FAIL: %s\n", name);
        // Describe the error - handle both array and string error formats
        if (arrayp(err)) {
            write("    Error: %s\n", err[0] || "Unknown error");
        } else {
            write("    Error: %s\n", sprintf("%O", err));
        }
    }
}

//! Main test runner
//!
//! Registers and executes all test functions
int main() {
    // Setup module path before any LSP imports
    setup_module_path();

    write("LSP Module Loading Tests\n");
    write("========================\n\n");

    // Run version logging first (for CI debugging)
    run_test(test_version_logging, "Version logging");

    // Module loading tests
    run_test(test_module_loading, "Module loading");
    run_test(test_critical_exports, "Critical exports");
    run_test(test_modular_intelligence_structure, "Modular Intelligence structure");
    run_test(test_modular_analysis_structure, "Modular Analysis structure");

    write("\n");
    write("Results: %d run, %d passed, %d failed\n", tests_run, tests_passed, tests_failed);

    if (tests_failed > 0) {
        write("\nFailed tests:\n");
        foreach (failures, string name) {
            write("  - %s\n", name);
        }
        if (sizeof(module_errors) > 0) {
            write("\nModule errors:\n");
            foreach (module_errors, string err) {
                write("  %s\n", err);
            }
        }
        return 1;
    }
    return 0;
}

// =============================================================================
// Module Loading Tests
// =============================================================================

//! Test: Log Pike version for CI debugging
void test_version_logging() {
    mixed compat = master()->resolv("LSP.Compat");
    if (!compat) {
        error("LSP.Compat module not found\n");
    }

    // Get version array
    array version = compat->pike_version();
    if (sizeof(version) < 3) {
        error("Version array too small: %O\n", version);
    }

    // Get version string
    string version_str = compat->PIKE_VERSION_STRING;
    if (!stringp(version_str)) {
        error("PIKE_VERSION_STRING invalid: %O\n", version_str);
    }

    write("    Pike version: %s (%d.%d.%d)\n",
          version_str, version[0], version[1], version[2]);
}

//! Test: All LSP modules load without errors
void test_module_loading() {
    array(string) modules = ({
        "LSP.module",        // Constants, LSPError, JSON helpers
        "LSP.Compat",        // Version detection, trim_whites
        "LSP.Cache",         // LRU caching
        "LSP.Parser",        // Parser class
        "LSP.Intelligence",  // Intelligence class
        "LSP.Analysis"       // Analysis class
    });

    foreach (modules, string module_name) {
        mixed err = catch {
            mixed module = master()->resolv(module_name);
            if (!module) {
                module_errors += ({ sprintf("%s: resolved to undefined", module_name) });
                error("Module %s not found\n", module_name);
            }
        };

        if (err) {
            module_errors += ({
                sprintf("%s: %s", module_name,
                        arrayp(err) ? err[0] || "Unknown error" : sprintf("%O", err))
            });
            error("Failed to load %s\n", module_name);
        }
    }
}

//! Test: Each module has at least one expected export
void test_critical_exports() {
    // Test LSP.module exports
    {
        mixed module = master()->resolv("LSP.module");
        if (!module) error("LSP.module not loaded\n");

        // Check LSPError class (using programp for cross-version compatibility)
        if (!module->LSPError) {
            error("LSP.module.LSPError not found\n");
        }
        if (!programp(module->LSPError)) {
            error("LSP.module.LSPError is not a class\n");
        }

        // Check MAX_TOP_LEVEL_ITERATIONS constant
        if (!intp(module->MAX_TOP_LEVEL_ITERATIONS)) {
            error("LSP.module.MAX_TOP_LEVEL_ITERATIONS not found or not int\n");
        }
    }

    // Test LSP.Compat exports
    {
        mixed module = master()->resolv("LSP.Compat");
        if (!module) error("LSP.Compat not loaded\n");

        // Check pike_version function
        if (!functionp(module->pike_version)) {
            error("LSP.Compat.pike_version not found or not function\n");
        }

        // Check trim_whites function
        if (!functionp(module->trim_whites)) {
            error("LSP.Compat.trim_whites not found or not function\n");
        }

        // Check PIKE_VERSION_STRING constant
        if (!stringp(module->PIKE_VERSION_STRING)) {
            error("LSP.Compat.PIKE_VERSION_STRING not found or not string\n");
        }
    }

    // Test LSP.Cache exports
    {
        mixed module = master()->resolv("LSP.Cache");
        if (!module) error("LSP.Cache not loaded\n");

        // Check get function
        if (!functionp(module->get)) {
            error("LSP.Cache.get not found or not function\n");
        }

        // Check put function
        if (!functionp(module->put)) {
            error("LSP.Cache.put not found or not function\n");
        }

        // Check clear function
        if (!functionp(module->clear)) {
            error("LSP.Cache.clear not found or not function\n");
        }
    }

    // Test LSP.Parser exports
    {
        mixed module = master()->resolv("LSP.Parser");
        if (!module) error("LSP.Parser not loaded\n");

        // Parser.pike is a class module - the file itself is the class
        // Check that it's a program (class)
        if (!programp(module)) {
            error("LSP.Parser is not a class (program)\n");
        }
    }

    // Test LSP.Intelligence exports
    {
        mixed module = master()->resolv("LSP.Intelligence");
        if (!module) error("LSP.Intelligence not loaded\n");

        // The delegating Intelligence class is in module.pmod
        // Access via LSP.Intelligence.module->Intelligence
        mixed modmod = master()->resolv("LSP.Intelligence.module");
        if (!modmod) error("LSP.Intelligence.module not found\n");

        // Check Intelligence class (using programp for cross-version compatibility)
        if (!modmod->Intelligence) {
            error("LSP.Intelligence.module.Intelligence not found\n");
        }
        if (!programp(modmod->Intelligence)) {
            error("LSP.Intelligence.module.Intelligence is not a class\n");
        }
    }

    // Test LSP.Analysis exports
    {
        mixed module = master()->resolv("LSP.Analysis");
        if (!module) error("LSP.Analysis not loaded\n");

        // The delegating Analysis class is in module.pmod
        // Access via LSP.Analysis.module->Analysis
        mixed modmod = master()->resolv("LSP.Analysis.module");
        if (!modmod) error("LSP.Analysis.module not found\n");

        // Check Analysis class (using programp for cross-version compatibility)
        if (!modmod->Analysis) {
            error("LSP.Analysis.module.Analysis not found\n");
        }
        if (!programp(modmod->Analysis)) {
            error("LSP.Analysis.module.Analysis is not a class\n");
        }
    }

    // Test LSP.Intelligence.Intelligence specialized classes
    {
        mixed module = master()->resolv("LSP.Intelligence");
        if (!module) error("LSP.Intelligence not loaded\n");

        // Intelligence.pmod is a module directory - check it has indices
        // (module indices are available via indices() function)
        array idx = indices(module);
        if (sizeof(idx) == 0) {
            error("LSP.Intelligence module has no exports\n");
        }
    }

    // Test LSP.Intelligence specialized classes exist via resolv
    {
        array(string) intelligence_classes = ({
            "LSP.Intelligence.Introspection.Introspection",
            "LSP.Intelligence.Resolution.Resolution",
            "LSP.Intelligence.TypeAnalysis.TypeAnalysis",
        });

        foreach (intelligence_classes, string class_path) {
            mixed cls = master()->resolv(class_path);
            if (!cls) {
                error("Class %s not found\n", class_path);
            }
            if (!programp(cls)) {
                error("Class %s is not a program\n", class_path);
            }
        }
    }

    // Test LSP.Analysis specialized classes exist via resolv
    {
        array(string) analysis_classes = ({
            "LSP.Analysis.Diagnostics.Diagnostics",
            "LSP.Analysis.Completions.Completions",
            "LSP.Analysis.Variables.Variables",
        });

        foreach (analysis_classes, string class_path) {
            mixed cls = master()->resolv(class_path);
            if (!cls) {
                error("Class %s not found\n", class_path);
            }
            if (!programp(cls)) {
                error("Class %s is not a program\n", class_path);
            }
        }
    }
}

//! Test: Verify modular Intelligence structure loads correctly
void test_modular_intelligence_structure() {
    // Verify LSP.Intelligence module loads
    mixed mod = master()->resolv("LSP.Intelligence");
    if (!mod) {
        error("LSP.Intelligence module not found\n");
    }

    // Check that the module has indices (is a valid module)
    array idx = indices(mod);
    if (sizeof(idx) == 0) {
        error("LSP.Intelligence module has no exports\n");
    }

    // Verify specialized classes exist in Intelligence.pmod
    array(string) classes = ({
        "Introspection", "Resolution", "TypeAnalysis"
    });

    foreach (classes, string cls_name) {
        // Access via submodule pattern: LSP.Intelligence.ClassName.ClassName
        string full_path = "LSP.Intelligence." + cls_name + "." + cls_name;
        mixed cls = master()->resolv(full_path);
        if (!cls) {
            error("LSP.Intelligence.%s not found at path %s\n", cls_name, full_path);
        }
        if (!programp(cls)) {
            error("LSP.Intelligence.%s is not a class\n", cls_name);
        }
    }

    // Verify backward-compatible delegating Intelligence class exists
    // The class is in module.pmod, so access via module submodule
    mixed modmod = master()->resolv("LSP.Intelligence.module");
    if (!modmod) {
        error("LSP.Intelligence.module not found\n");
    }
    mixed delegating = modmod->Intelligence;
    if (!delegating) {
        error("LSP.Intelligence.module.Intelligence delegating class not found\n");
    }
    if (!programp(delegating)) {
        error("LSP.Intelligence.module.Intelligence is not a class\n");
    }
}

//! Test: Verify modular Analysis structure loads correctly
void test_modular_analysis_structure() {
    // Verify LSP.Analysis module loads
    mixed mod = master()->resolv("LSP.Analysis");
    if (!mod) {
        error("LSP.Analysis module not found\n");
    }

    // Check that the module has indices (is a valid module)
    array idx = indices(mod);
    if (sizeof(idx) == 0) {
        error("LSP.Analysis module has no exports\n");
    }

    // Verify specialized classes exist in Analysis.pmod
    array(string) classes = ({
        "Diagnostics", "Completions", "Variables"
    });

    foreach (classes, string cls_name) {
        // Access via submodule pattern: LSP.Analysis.ClassName.ClassName
        string full_path = "LSP.Analysis." + cls_name + "." + cls_name;
        mixed cls = master()->resolv(full_path);
        if (!cls) {
            error("LSP.Analysis.%s not found at path %s\n", cls_name, full_path);
        }
        if (!programp(cls)) {
            error("LSP.Analysis.%s is not a class\n", cls_name);
        }
    }

    // Verify backward-compatible delegating Analysis class exists
    // The class is in module.pmod, so access via module submodule
    mixed modmod = master()->resolv("LSP.Analysis.module");
    if (!modmod) {
        error("LSP.Analysis.module not found\n");
    }
    mixed delegating = modmod->Analysis;
    if (!delegating) {
        error("LSP.Analysis.module.Analysis delegating class not found\n");
    }
    if (!programp(delegating)) {
        error("LSP.Analysis.module.Analysis is not a class\n");
    }
}
