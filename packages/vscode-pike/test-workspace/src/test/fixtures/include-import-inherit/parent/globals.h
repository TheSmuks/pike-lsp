//! Global definitions file
//! This file is included by main.pike via relative path "../parent/globals.h"

const int global_constant = 42;

void helper_function() {
    write("Helper function called\n");
}

//! @decl string global_function()
//! @description
//!   A global function that returns a test string
string global_function() {
    return "Hello from globals.h";
}
