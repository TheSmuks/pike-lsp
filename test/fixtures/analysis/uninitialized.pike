//! Test fixture for uninitialized variable analysis

// This should warn: s used before initialization
void test_uninitialized_string() {
    string s;
    write("%s\n", s);  // Warning: s may be uninitialized
}

// This should NOT warn: int auto-initializes
void test_initialized_int() {
    int i;
    write("%d\n", i);  // OK: int defaults to 0
}

// This should NOT warn: initialized before use
void test_initialized_string() {
    string s = "hello";
    write("%s\n", s);  // OK: s is initialized
}

// Branch analysis test
void test_branch_init() {
    string s;
    if (random(2) > 0) {
        s = "initialized";
    }
    write("%s\n", s);  // Warning: s may be uninitialized
}

// Array initialization test
void test_array_init() {
    array(int) arr;
    write("%d\n", sizeof(arr));  // Warning: arr may be uninitialized
}

// Mapping initialization test
void test_mapping_init() {
    mapping(string:int) m;
    write("%d\n", sizeof(m));  // Warning: m may be uninitialized
}

// Function parameters are pre-initialized
void test_params(string param) {
    write("%s\n", param);  // OK: param is initialized
}
