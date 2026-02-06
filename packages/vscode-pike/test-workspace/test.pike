//! Test fixture file for LSP feature E2E tests
//!
//! This file contains known Pike constructs at predictable positions
//! for testing LSP features: symbols, hover, go-to-definition, completion
//!
//! Line 7:  Variable declaration for hover/definition tests
int test_variable = 42;

// Line 10: String variable for type testing
string test_string = "hello";

// Line 13: Array variable for completion tests
array test_array = ({});

// Line 16: Function with parameters for hover/symbol tests
int test_function(string arg) {
    return sizeof(arg);
}

// Line 22: Function with multiple parameters for signature help
string multi_param(int x, string s, array a) {
    return sprintf("%d:%s", x, s);
}

// Line 27: Class definition for symbol/hierarchy tests
class TestClass {
    // Line 30: Class member variable
    int member_variable = 10;

    // Line 33: Class method
    void member_method() {
        // Line 35: Reference test_variable for go-to-definition
        int local_var = test_variable;
    }

    // Line 39: Another method with return type
    int get_value() {
        return member_variable;
    }

    // Method that calls another function - for call hierarchy tests
    void method_with_calls() {
        test_function("call from member");
        multi_param(1, "test", ({}));
    }
}

// Line 50: Class with inheritance for type hierarchy tests
class ChildClass {
    inherit TestClass;

    int child_variable = 20;

    int child_method() {
        return member_variable + child_variable;
    }
}

// Line 60: Another class for multiple inheritance testing
class OtherClass {
    int other_value = 30;

    void other_method() {
        // References test_variable - for find references tests
        int x = test_variable;
        // Calls test_function - for call hierarchy tests
        test_function("from other");
    }
}

// Line 71: Standalone function using stdlib
void use_stdlib() {
    // Line 73: Position for stdlib completion test
    // Test completion: Array.
    array a = ({});
    // Test completion: String.
    string s = "";
    // Test completion: Mapping.
    mapping m = ([]);
}

// Line 81: Lambda/function pointer for testing
function lambda_func = lambda() { return 1; };

// Line 84: Constant for testing
constant TEST_CONSTANT = 100;

// Line 87: Enum-like pattern
enum TestEnum {
    VALUE_ONE,
    VALUE_TWO,
    VALUE_THREE
}

// Line 94: Modifier testing
final int final_var = 5;
private int private_var = 10;
protected int protected_var = 15;

// Line 99: Reference for go-to-definition test (references test_variable at line 7)
int use_variable() {
    return test_variable;  // This should jump to definition at line 7
}

// Line 104: Reference for class go-to-definition (references TestClass at line 27)
TestClass create_instance() {
    return TestClass();  // Should jump to class definition
}

// Line 109: Reference for function go-to-definition (references test_function at line 16)
int call_function() {
    return test_function("test");  // Should jump to function definition
}

// Line 114: TestClass instance variable for hover test
TestClass tc = TestClass();

// Line 117: Function calling another function - for call hierarchy
void caller_function() {
    test_function("from caller");
    multi_param(42, "test", ({}));
}

// Line 123: Main function for function hover signature test
int main() {
    // Multiple references to test_variable
    int a = test_variable;
    int b = test_variable;
    int c = test_variable;

    // Call methods for hierarchy testing
    tc.member_method();
    caller_function();

    return 0;
}

/*
 * Block comment for folding range tests
 * This spans multiple lines and should be collapsible
 */

// Line 145: Nested block for formatting and folding tests
void nested_blocks() {
if (true) {
    int x = 1;
    if (x > 0) {
        int y = 2;
        for (int i = 0; i < 10; i++) {
            y += i;
        }
    }
}
}

//! Multiline doc comment
//! for folding tests
//! with three lines
void documented_function() {
    // Body here
}

// Line 165: Code with poor formatting for formatting tests
void poorly_formatted()
{
int unindented = 1;
    int misaligned = 2;
if (true)
{
int badly_nested = 3;
}
}

// Line 175: Function with complex parameters for signature help
mapping complex_function(string key, int value, array data, mapping options) {
    return ([key: value]);
}

// Line 180: Function that references many things for document highlight
int highlight_test() {
    int highlight_test = 5;  // Local variable shadows function name
    return highlight_test;
}

// Call complex_function for signature help test
void test_complex_function() {
    mapping result = complex_function("test", 42, ({}), ([]));
}
