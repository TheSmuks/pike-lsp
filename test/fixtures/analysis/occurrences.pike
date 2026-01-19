//! Test fixture for find_occurrences

int myVariable = 5;
string myVariable2 = "test";

void function() {
    int x = myVariable + myVariable2;
    // Should find: myVariable, myVariable2, x, function
    // Should NOT find: int, string, void
}

class MyClass {
    int value;

    void method() {
        // Local variables in method scope
        int local = value;
    }
}

// Test that keywords are filtered
void test_keywords() {
    if (true) {
        for (int i = 0; i < 10; i++) {
            // Should find: i, test_keywords
            // Should NOT find: if, for, int, true, void
        }
    }
}

// Complex identifiers
void test_complex_identifiers() {
    array(string) names = ({"a", "b", "c"});
    mapping(string:int) lookup = ([]);
    // Should find: names, lookup, test_complex_identifiers
    // Should NOT find: array, string, mapping, int, void
}
