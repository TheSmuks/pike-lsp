//! Roxen.pike - Stub module for Roxen framework LSP support
//!
//! This provides minimal stub implementations of Roxen framework classes
//! to allow Pike code using Roxen APIs to compile during LSP analysis.
//!
//! These stubs are NOT functional at runtime - they only exist to prevent
//! compilation errors during LSP analysis. The real Roxen framework provides
//! the actual implementations at runtime in the Roxen environment.

//! RequestID stub - represents a Roxen HTTP request object
//! In the real Roxen framework, this provides access to request data
class RequestID {
    //! Stub properties - commonly used RequestID members
    mapping variables = ([]);
    mapping config = ([]);
    string remoteaddr = "";
    string query_string = "";
    string method = "GET";
    string protocol = "HTTP/1.1";
    string raw_url = "";
    string not_query = "";
    string virtfile = "";
    string rest_of_query = "";

    //! Additional commonly used RequestID properties
    int time = 0;
    int hrtime = 0;
    string query = "";
    string host = "";
    string realfile = "";
    string prot = "";
    string clientprot = "";
    string rawauth = "";
    int since = 0;
    string extra_extension = "";
    mixed data = 0;
    string leftovers = "";
    mapping misc = ([]);
    mapping connection_misc = ([]);
    mapping real_cookies = ([]);
    int do_not_disconnect = 0;

    //! Stub methods - RequestID commonly used methods
    mapping(string:mixed) get_variables() { return variables; }
    string get_query() { return query_string; }
    string get_method() { return method; }
    string get_protocol() { return protocol; }
    void set_max_cache(int seconds) { }
    int get_max_cache() { return 3600; }
    void lower_max_cache(int seconds) { }
    void raise_max_cache(int seconds) { }
    string url_base() { return ""; }
    string client_scheme() { return "http"; }
}

//! Common Roxen module type constants
//! These match the bit-shifted values from Roxen 6.1 module.h
constant MODULE_ZERO = 0;
constant MODULE_EXTENSION = 1 << 0;        // 1 - File extension module
constant MODULE_LOCATION = 1 << 1;         // 2 - Location module
constant MODULE_URL = 1 << 2;              // 4 - URL module
constant MODULE_FILE_EXTENSION = 1 << 3;   // 8 - File extension handler
constant MODULE_TAG = 1 << 4;              // 16 - Tag module
constant MODULE_PARSER = 1 << 4;           // 16 - Alias for MODULE_TAG
constant MODULE_LAST = 1 << 5;             // 32 - Last module
constant MODULE_FIRST = 1 << 6;            // 64 - First module
constant MODULE_AUTH = 1 << 7;             // 128 - Authentication module
constant MODULE_MAIN_PARSER = 1 << 8;      // 256 - Main parser
constant MODULE_TYPES = 1 << 9;            // 512 - Types module
constant MODULE_DIRECTORIES = 1 << 10;     // 1024 - Directories module
constant MODULE_PROXY = 1 << 11;           // 2048 - Proxy module
constant MODULE_LOGGER = 1 << 12;          // 4096 - Logger module
constant MODULE_FILTER = 1 << 13;          // 8192 - Filter module
constant MODULE_PROVIDER = 1 << 15;        // 32768 - Provider module
constant MODULE_USERDB = 1 << 16;          // 65536 - User database module
constant MODULE_DEPRECATED = 1 << 27;      // Deprecated module flag
constant MODULE_PROTOCOL = 1 << 28;        // Protocol module
constant MODULE_CONFIG = 1 << 29;          // Config module
constant MODULE_SECURITY = 1 << 30;        // Security module
constant MODULE_EXPERIMENTAL = 1 << 31;    // Experimental module
constant MODULE_TYPE_MASK = (1 << 27) - 1; // Lower 27 bits for module type

//! Common Roxen type constants (matching Roxen 6.1 module.h)
constant TYPE_STRING = 1;            // String variable
constant TYPE_FILE = 2;              // File path variable
constant TYPE_INT = 3;               // Integer variable
constant TYPE_DIR = 4;               // Directory path variable
constant TYPE_STRING_LIST = 5;       // String array variable
constant TYPE_MULTIPLE_STRING = 5;   // Alias for TYPE_STRING_LIST
constant TYPE_INT_LIST = 6;          // Integer array variable
constant TYPE_MULTIPLE_INT = 6;      // Alias for TYPE_INT_LIST
constant TYPE_FLAG = 7;              // Boolean flag variable
constant TYPE_TOGGLE = 7;            // Alias for TYPE_FLAG
constant TYPE_DIR_LIST = 9;          // Directory array variable
constant TYPE_FILE_LIST = 10;        // File array variable
constant TYPE_LOCATION = 11;         // Location specifier
constant TYPE_TEXT_FIELD = 13;       // Text field (multiline)
constant TYPE_TEXT = 13;             // Alias for TYPE_TEXT_FIELD
constant TYPE_PASSWORD = 14;         // Password field
constant TYPE_FLOAT = 15;            // Floating point number
constant TYPE_MODULE = 17;           // Module reference
constant TYPE_FONT = 19;             // Font selector
constant TYPE_CUSTOM = 20;           // Custom type
constant TYPE_URL = 21;              // URL variable
constant TYPE_URL_LIST = 22;         // URL array variable

//! Additional types for compatibility with older code
constant TYPE_ERROR = 6;             // Error type (legacy)
constant TYPE_VAR = 7;               // Variable type (legacy)
constant TYPE_LIST = 9;              // Generic list (legacy)
constant TYPE_COLOR = 12;            // Color type (legacy)
constant TYPE_MODULE_OLD = 8;        // Module reference (old value, deprecated)

//! Common Roxen variable flags
//! These match the bit-shifted values from Roxen 6.1 module.h
constant VAR_EXPERT = 1 << 8;         // Expert-only variable
constant VAR_MORE = 1 << 9;           // "More" section variable
constant VAR_DEVELOPER = 1 << 10;     // Developer-only variable
constant VAR_INITIAL = 1 << 11;       // Initial configuration variable
constant VAR_NOT_CFIF = 1 << 12;      // Not in CFIF
constant VAR_INVISIBLE = 1 << 13;     // Invisible variable
constant VAR_PUBLIC = 1 << 14;        // Public variable
constant VAR_NO_DEFAULT = 1 << 15;    // No default value
