//! Test fixture for Waterfall Loading E2E tests
//!
//! This file validates the NEW module resolution system with ModuleContext:
//!   - Completion shows symbols from included files (#include)
//!   - Completion shows symbols from imported modules (import)
//!   - Waterfall loading: transitive dependencies are included
//!
//! CRITICAL: This test validates that ModuleContext.getWaterfallSymbolsForDocument()
//! is actually wired into completion and provides symbols from imports.

//! A symbol that should be available via ModuleContext waterfall loading
//! This tests that the current file's own symbols appear in completion
constant WATERFALL_TEST_CONSTANT = "test_value";

//! Another test symbol
int waterfall_test_value = 100;

//! Function that tests completion shows own symbols
void test_waterfall_completion() {
    // E2E: Typing after "waterfall_" should show WATERFALL_TEST_CONSTANT
    // This validates basic completion is working
    int x = waterfall_test_value;

    // E2E: Typing in empty line should show both constants
    string s = WATERFALL_TEST_CONSTANT;
}

// -------------------------------------------------------------------
// Test class definitions appear in completion
// -------------------------------------------------------------------

class WaterfallTestClass {
    int class_field = 1;
    void class_method() {}
}

void test_class_completion() {
    // E2E: Typing "Waterfall" should show WaterfallTestClass
    WaterfallTestClass obj = WaterfallTestClass();
}

// -------------------------------------------------------------------
// Test import module waterfall
// -------------------------------------------------------------------

import Stdio;

void test_stdlib_import_waterfall() {
    // E2E: After "import Stdio;", completion should show Stdio members
    // This validates that import resolution contributes to context
    File f;
    write("test");
    stdin->read();
}

// -------------------------------------------------------------------
// Test symbols appear in general completion
// -------------------------------------------------------------------

void test_general_completion() {
    // E2E: General completion should show functions defined in this file
    test_waterfall_completion();
    test_stdlib_import_waterfall();
}
