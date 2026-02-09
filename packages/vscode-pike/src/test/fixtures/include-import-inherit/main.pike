//! Main test file for include navigation
//! Tests #include with relative path "../parent/globals.h"

#include "../parent/globals.h"

void main() {
    // Using global_constant from the included file
    int value = global_constant;
    write("Value: %d\n", value);

    // Calling function from included file
    helper_function();
}
