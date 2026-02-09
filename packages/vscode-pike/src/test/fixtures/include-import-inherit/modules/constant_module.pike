//! Test fixture for import/inherit resolution
//! This module will be imported via import statement

//! Constant module for testing import/inherit
constant int _Constant_Module_ = 42;

//! Class to be inherited via inherit statement
class Something {
    int value = 100;

    void demo() {
        write("Demo from Something\n");
    }
}
