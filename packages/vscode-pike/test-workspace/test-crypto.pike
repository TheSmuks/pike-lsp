//! Test file for Crypto.pmod/PGP.pmod module loading

// This should resolve via the module path configuration
// import Crypto.PGP;

int main() {
    // If PGP module is available, we can use it
    // For now, just verify the file can be analyzed
    write("Crypto module test file loaded\n");
    return 0;
}
