//! Simple class fixture for intelligence tests
//! This fixture provides basic class structure for introspection testing

class SimpleClass {
    //! A simple method
    void simple_method() {
        // Do something
    }

    //! Method with parameters
    string greet(string name) {
        return "Hello, " + name;
    }

    //! Method with return type and parameters
    int add(int a, int b) {
        return a + b;
    }

    protected int internal_value = 42;

    constant VERSION = "1.0.0";
}

//! Top-level function
void top_function() {
    // Do something
}

//! Top-level variable
string global_var = "test";
