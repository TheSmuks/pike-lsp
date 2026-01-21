//! Simple test class for parser testing
class TestClass {
    //! A test method that does nothing
    void test_method() {
        int local_var = 5;
    }

    //! Another method that returns a string
    string get_value() {
        return "test";
    }

    //! Private method
    protected void private_method() {
        // Do nothing
    }
}

//! Global constant for testing
constant GLOBAL_CONST = 42;

//! Global variable for testing
string global_var = "hello";

//! Typedef for testing
typedef mapping(string:string) StringMap;

//! Enum for testing
enum Status {
    ACTIVE,
    INACTIVE,
    PENDING
};
