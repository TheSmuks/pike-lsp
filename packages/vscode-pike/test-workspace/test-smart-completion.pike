//! Test fixture for Smart IntelliSense E2E tests
//!
//! This file exercises context-aware completion scenarios:
//!   - Stdlib member access (Array., Stdio., String.)
//!   - Type-based variable completion (obj->)
//!   - Inherited member completion (inherit Parent; this->)
//!   - Include/import symbol completion
//!   - Scope operator completion (this_program::, ParentClass::)
//!   - Constructor snippet completion
//!   - Context-aware prioritization (type vs expression)

// -------------------------------------------------------------------
// Stdlib usage for member access completion
// -------------------------------------------------------------------

//! Function using stdlib modules for completion tests
void use_stdlib_modules() {
    // E2E: Completion after "Array." should show sort, filter, etc.
    array result = Array.sort(({ 3, 1, 2 }));

    // UNIQUE_PATTERN_ARRAY_COMPLETION: Array. should show members like sort
    array a1 = ({1, 2});

    // UNIQUE_PATTERN_STRING_COMPLETION: String. should show members like trim_all_whites
    string s1 = "test";

    // UNIQUE_PATTERN_STDIO_COMPLETION: Stdio. should show members like File
    object o1 = Stdio.File();
}

// -------------------------------------------------------------------
// Class hierarchy for type-based and inherited completion
// -------------------------------------------------------------------

class BaseWidget {
    int widget_id = 0;
    string widget_name = "base";

    void set_name(string name) {
        widget_name = name;
    }

    int get_id() {
        return widget_id;
    }

    //! @deprecated Use set_name instead
    void rename(string n) {
        widget_name = n;
    }
}

class Button {
    inherit BaseWidget;

    string label = "Click";
    int pressed_count = 0;

    void press() {
        pressed_count++;
    }

    string get_label() {
        return label;
    }
}

// -------------------------------------------------------------------
// Typed variable completion scenarios
// -------------------------------------------------------------------

//! Function testing type-based member access
void type_based_completion() {
    // E2E: "btn->" should show press, get_label, set_name, get_id (inherited)
    Button btn = Button();
    btn->press();

    // E2E: "f->" should show read, write, close (from Stdio.File)
    Stdio.File f = Stdio.File("/dev/null", "r");
    f->close();

    // E2E: "bw->" should show set_name, get_id, widget_id, widget_name
    BaseWidget bw = BaseWidget();
    bw->set_name("test");
}

// -------------------------------------------------------------------
// Scope operator completion scenarios
// -------------------------------------------------------------------

class ScopeTester {
    inherit BaseWidget;

    int local_value = 42;

    void test_this_program() {
        // E2E: "this_program::" should show local_value, test_this_program,
        //       AND inherited: widget_id, set_name, get_id, rename
        this_program::local_value;
    }

    void test_scope_access() {
        // E2E: "BaseWidget::" should show set_name, get_id, widget_id, rename
        BaseWidget::get_id();
    }
}

// -------------------------------------------------------------------
// Constructor completion scenario
// -------------------------------------------------------------------

class Connection {
    string host;
    int port;

    //! Create a new connection
    //! @param host Hostname to connect to
    //! @param port Port number
    void create(string host, int port) {
        this_program::host = host;
        this_program::port = port;
    }

    void connect() {}
    void disconnect() {}
}

//! Function testing constructor snippet completion
void constructor_completion() {
    // E2E: "Connection(" should generate snippet with host and port placeholders
    Connection c = Connection("localhost", 8080);
}

// -------------------------------------------------------------------
// Context-aware prioritization scenarios
// -------------------------------------------------------------------

class TypeContext {
    int value;
}

//! Tests that types are prioritized in type position
void context_priority_test() {
    // E2E: At start of line, classes like TypeContext, Connection, Button
    //       should rank higher than variables/functions
    TypeContext tc = TypeContext();

    // E2E: After "=", variables and functions should rank higher
    int x = tc->value;
}

// -------------------------------------------------------------------
// Expression context (after =, return, arguments)
// -------------------------------------------------------------------

int global_counter = 0;
constant MAX_VALUE = 100;

int expression_context_test() {
    // E2E: After "return ", variables (global_counter) and constants (MAX_VALUE)
    //       should rank higher than type keywords
    return global_counter;
}

// -------------------------------------------------------------------
// Comment and string suppression
// -------------------------------------------------------------------

void suppression_test() {
    // E2E: Inside this comment, no code completions should appear
    // global_counter should NOT be suggested here

    string s = "No completions inside this string either";
}
