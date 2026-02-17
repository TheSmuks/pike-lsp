//! Test file for stdlib E2E tests
//! This file imports and uses real stdlib modules

import Stdio;
import Array;

void test_stdlib_functions() {
    // Test Array module functions
    array(int) arr = ({1, 2, 3});
    int sum = Array.sum(arr);

    // Test String module functions
    string trimmed = String.trim_all_whites("  hello  ");

    // Test Stdio.File
    Stdio.File file = Stdio.File();
}

class TestClass {
    int x;
    void method() { }
}
