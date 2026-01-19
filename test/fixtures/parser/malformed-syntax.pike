//! File with syntax errors for error recovery testing
class BrokenClass {
    void missing_semicolon() {
        int x = 5  // Missing semicolon here
        int y = 10;
    }

    void unclosed_brace() {
        int z = 20;
    // Missing closing brace above

//! Global variable after broken class
int after_class = 100;
