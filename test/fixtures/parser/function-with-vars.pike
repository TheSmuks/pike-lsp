//! Function with local variables for parser testing
//!
//! This function demonstrates local variable declarations
//! within a function body.
void process_data(string input) {
    // Trim the input
    string trimmed = String.trim_whites(input);

    // Split into parts
    array parts = trimmed / " ";

    // Create result mapping
    mapping result = ([]);

    // Process each part
    foreach (parts, string part) {
        result[part] = sizeof(part);
    }

    // Return nothing (void function)
}

//! Another function with mixed types
mixed calculate(int x, int|void y) {
    if (!y) y = 0;
    return x + y;
}
