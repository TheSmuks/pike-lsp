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

// Line 21: Function with multiple parameters
string multi_param(int x, string s, array a) {
    return sprintf("%d:%s", x, s);
}

// Line 26: Class definition for symbol/hierarchy tests
class TestClass {
    // Line 28: Class member variable
    int member_variable = 10;

    // Line 31: Class method
    void member_method() {
        // Line 33: Reference test_variable for go-to-definition
        int local = test_variable;
    }

    // Line 36: Another method with return type
    int get_value() {
        return member_variable;
    }
}

// Line 41: Inheritance test
class ChildClass : TestClass {
    void child_method() {
        // Uses inherited member
        member_variable = 20;
    }
}

// Line 48: Standalone function using stdlib
void use_stdlib() {
    // Line 50: Position for stdlib completion test
    // Test completion: Array.
    array a = ({});
    // Test completion: String.
    string s = "";
    // Test completion: Mapping.
    mapping m = ([]);
}

// Line 56: Lambda/function pointer for testing
function lambda_func = lambda() { return 1; };

// Line 59: Constant for testing
constant TEST_CONSTANT = 100;

// Line 62: Enum-like pattern
enum TestEnum {
    VALUE_ONE,
    VALUE_TWO,
    VALUE_THREE
}

// Line 69: Modifier testing
final int final_var = 5;
private int private_var = 10;
protected int protected_var = 15;

// Line 74: Reference for go-to-definition test (references test_variable at line 7)
int use_variable() {
    return test_variable;  // This should jump to definition at line 7
}

// Line 79: Reference for class go-to-definition (references TestClass at line 26)
TestClass create_instance() {
    return TestClass();  // Should jump to class definition
}

// Line 84: Reference for function go-to-definition (references test_function at line 16)
int call_function() {
    return test_function("test");  // Should jump to function definition
}
