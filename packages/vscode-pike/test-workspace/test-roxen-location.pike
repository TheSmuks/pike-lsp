// Test file for Roxen MODULE_LOCATION
// This file tests MODULE_LOCATION pattern and query_location callback

inherit "module";
constant module_type = MODULE_LOCATION;
constant module_name = "Test Location Module";
constant module_doc = "Test location module for LSP features";

string base_path = "/test/";

// Required for MODULE_LOCATION - must have find_file or query_location
string find_file(string filename, object id) {
    if (filename == "/") {
        return "index.html";
    }
    return filename;
}

// Alternative to find_file - query_location style
mapping(string:string) query_location() {
    return ([
        "": "root.html",
        "about": "about.html",
        "contact": "contact.html",
    ]);
}

// Configuration variables
void create() {
    defvar("root", "/var/www/html", TYPE_STRING, "Document root");
    defvar("index_file", "index.html", TYPE_STRING, "Index file name");
}

// Required callbacks
string query_name() { return module_name; }
string query_doc() { return module_doc; }
array(string) query_type() { return ({ "Location", "Filesystem" }); }
