//! Test tokenizer behavior with "Module." pattern
//! This documents the EXPECTED output format for cursor detection
int main() {
    // Test case 1: "Array." - cursor after dot
    array tokens1 = Parser.Pike.tokenize(Parser.Pike.split("Array."));
    werror("Test 1: 'Array.' tokens:\n");
    foreach(tokens1, object tok) {
        werror("  '%s' line=%d char=%d\n", tok->text, tok->line, tok->character);
    }
    // EXPECTED: Two tokens - "Array" (line=1, char=0) and "." (line=1, char=5)

    // Test case 2: "Array.so" - cursor in partial identifier
    array tokens2 = Parser.Pike.tokenize(Parser.Pike.split("Array.so"));
    werror("\nTest 2: 'Array.so' tokens:\n");
    foreach(tokens2, object tok) {
        werror("  '%s' line=%d char=%d\n", tok->text, tok->line, tok->character);
    }
    // EXPECTED: Three tokens - "Array" (line=1, char=0), "." (line=1, char=5), "so" (line=1, char=6)

    // Test case 3: "String.  " with trailing whitespace
    array tokens3 = Parser.Pike.tokenize(Parser.Pike.split("String.  "));
    werror("\nTest 3: 'String.  ' tokens:\n");
    foreach(tokens3, object tok) {
        werror("  '%s' line=%d char=%d\n", tok->text, tok->line, tok->character);
    }
    // EXPECTED: Two tokens - "String" and ".", whitespace is NOT tokenized

    return 0;
}
