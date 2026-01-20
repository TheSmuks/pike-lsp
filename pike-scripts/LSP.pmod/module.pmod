//! LSP.pmod - Main module entry point for Pike LSP
//!
//! This module provides shared constants, error classes, JSON helper functions,
//! and debug logging infrastructure used by all LSP components.
//!
//! FND-03: Base error class for LSP errors
//! FND-04: JSON helper functions wrapping Standards.JSON
//! FND-11: Debug logging with mode flag

// MAINT-004: Configuration constants
// Maximum iterations to prevent infinite loops during parsing
constant MAX_TOP_LEVEL_ITERATIONS = 10000;
constant MAX_BLOCK_ITERATIONS = 500;

// PERF-005: Debug mode flag (disabled by default for performance)
// Can be set at runtime to enable debug output
int debug_mode = 0;

// Setter for debug mode (needed for module-level variable modification)
//! Set the debug mode flag
//! @param enable 1 to enable debug output, 0 to disable
void set_debug_mode(int enable) {
    debug_mode = enable;
}

// Getter for debug mode
//! Get the current debug mode flag
//! @returns 1 if debug mode is enabled, 0 otherwise
int get_debug_mode() {
    return debug_mode;
}

// FND-03: LSPError base class for LSP protocol errors
class LSPError {
    mixed error_code;
    string error_message;

    //! Create a new LSPError
    //! @param code The error code (typically LSP error code number)
    //! @param message The error message string
    void create(mixed code, string message) {
        error_code = code;
        error_message = message;
    }

    //! Create a JSON-RPC error response from this error
    //! @returns A mapping suitable for JSON-RPC error response
    mapping to_response() {
        return ([
            "error": ([
                "code": error_code,
                "message": error_message
            ])
        ]);
    }
}

// FND-04: JSON decode helper
//! Decode JSON string into Pike data structure
//! @param data JSON string to decode
//! @returns Decoded Pike data structure
mixed json_decode(string data) {
    return Standards.JSON.decode(data);
}

// FND-04: JSON encode helper
//! Encode Pike data structure into JSON string
//! @param data Pike data structure to encode
//! @param flags Optional encoding flags (passed to Standards.JSON.encode)
//! @returns JSON string
string json_encode(mixed data, void|int flags) {
    return Standards.JSON.encode(data, flags);
}

// FND-11: Conditional debug logging
//! Only outputs when debug_mode is enabled (PERF-005)
//! @param format Printf-style format string
//! @param args Variable arguments for format string
void debug(string format, mixed... args) {
    if (debug_mode) {
        werror(format, @args);
    }
}

//! Create a flat error dictionary for JSON-RPC error responses
//! @param kind The error kind (e.g., "SYNTAX", "COMPILE", "RUNTIME")
//! @param msg The error message
//! @param line Optional line number where error occurred
//! @returns A mapping with error, kind, msg, line fields
mapping make_error(string kind, string msg, int|void line) {
    return ([
        "error": 1,
        "kind": kind,
        "msg": msg,
        "line": line
    ]);
}
