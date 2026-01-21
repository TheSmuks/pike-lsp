//! Stdlib test fixture for intelligence tests
//! Tests stdlib module resolution

//! Test using Array module
void test_array_sort() {
    array(int) arr = ({3, 1, 2});
    arr = sort(arr);
}

//! Test using String module
void test_string_operations() {
    string s = "hello world";
    string upper = String.capitalize(s);
}

//! Test using Stdio module
void test_stdio_write() {
    Stdio.write("Output\n");
}

//! Test using mapping type
mapping(string:int) get_counts() {
    return (["one": 1, "two": 2]);
}

//! Test using ADT.Sequence
void test_sequence() {
    object seq = ADT.Sequence();
}
