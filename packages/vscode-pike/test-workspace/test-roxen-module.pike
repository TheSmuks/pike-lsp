// Test file for Roxen module detection and features
// This file tests Roxen module patterns

inherit "module";
constant module_type = MODULE_TAG;
constant module_name = "Test Roxen Module";
constant module_doc = "Test module for LSP features";

// Define configuration variables using defvar
void create() {
    // Required for module to be valid
    defvar("title", "Default Title", TYPE_STRING, "Page title");
    defvar("enabled", 1, TYPE_FLAG, "Enable this module");
    defvar("max_items", 10, TYPE_INT, "Maximum number of items");
    defvar("styles", ({ "default.css" }), TYPE_ARRAY, "CSS files");
}

// RXML tag handlers - these appear as symbols
string simpletag_hello(string tag_args) {
    return "Hello, World!";
}

string simpletag_greeting(mapping args) {
    return "Hello, " + (args["name"] || "anonymous");
}

string simpletag_iframe(string tag_args) {
    // Example: <emit source="roxentime"> produces the emit tag
    return "<iframe></iframe>";
}

// Required Roxen callbacks
string query_name() { return module_name; }
string query_doc() { return module_doc; }
array(string) query_type() { return ({ "Dynamic", "Pages" }); }
