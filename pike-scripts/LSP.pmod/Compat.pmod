//! Compat.pmod - Version compatibility layer for LSP.pmod
//!
//! This module provides a unified API across Pike versions 7.6, 7.8, and 8.0.x.
//! It detects the running Pike version at compile time and provides polyfills
//! for missing functions.
//!
//! @seealso
//! LSP module documentation

#if constant(__REAL_VERSION__)
// __REAL_VERSION__ is a float like 8.0, convert to string
constant PIKE_VERSION = sprintf("%1.1f", __REAL_VERSION__);
#else
// Fallback for very old Pike versions
constant PIKE_VERSION = sprintf("%1.1f", __VERSION__);
#endif

constant PIKE_VERSION_STRING = PIKE_VERSION;

//! Get the Pike version as an array: ({major, minor, patch})
//!
//! @returns
//! An array of three integers representing major, minor, and patch version.
//!
//! @example
//! array(int) ver = LSP.Compat.pike_version();
//! write("%d.%d.%d\n", ver[0], ver[1], ver[2]);
array(int) pike_version() {
    string version = PIKE_VERSION;
    // Split version string and convert to integers
    array parts = version / ".";
    // Ensure we have at least 3 parts (major.minor.patch)
    while (sizeof(parts) < 3) {
        parts += ({"0"});
    }
    // Convert first 3 parts to integers
    array(int) result = allocate(3);
    for (int i = 0; i < 3 && i < sizeof(parts); i++) {
        result[i] = (int)parts[i];
    }
    return result;
}

#if constant(String.trim_whites)
// Use native implementation on Pike 8.x
constant has_trim_whites = 1;

//! Trim leading and trailing whitespace from a string.
//!
//! @param s
//! The string to trim.
//!
//! @returns
//! The string with leading and trailing whitespace removed.
//!
//! @note
//! On Pike 8.x, this uses the native String.trim_whites() implementation.
//! On Pike 7.6/7.8, this uses a polyfill implementation.
string trim_whites(string s) {
    return String.trim_whites(s);
}

#else
// Polyfill for Pike 7.6/7.8
constant has_trim_whites = 0;

//! Trim leading and trailing whitespace from a string.
//!
//! @param s
//! The string to trim.
//!
//! @returns
//! The string with leading and trailing whitespace removed.
//!
//! @note
//! On Pike 7.6/7.8, this is a polyfill implementation.
string trim_whites(string s) {
    // Handle empty string
    if (sizeof(s) == 0) {
        return s;
    }

    // Trim leading whitespace
    // Using <s[0] for single-character comparison (Pike 7.x compatibility)
    while (sizeof(s) > 0) {
        int first = s[0];
        if (first == ' ' || first == '\t' || first == '\n' || first == '\r') {
            s = s[1..];
        } else {
            break;
        }
    }

    // Trim trailing whitespace
    while (sizeof(s) > 0) {
        int last = s[-1];
        if (last == ' ' || last == '\t' || last == '\n' || last == '\r') {
            s = s[0..<2];
        } else {
            break;
        }
    }

    return s;
}

#endif
