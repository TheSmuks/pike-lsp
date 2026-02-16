// Test file for RXML mixed content patterns
// This file tests RXML tags inside Pike strings

inherit "module";
constant module_type = MODULE_TAG;
constant module_name = "RXML Test Module";

void create() {
    defvar("template", "default", TYPE_STRING, "Template name");
}

// Example of RXML in string literals - the analyzer should handle these
string get_page_template() {
    return #"
<!DOCTYPE html>
<html>
<head><title>&var.title;</title></head>
<body>
    <ul>
        &emit.list-items:
        <li>&item.value;</li>
        &/emit;
    </ul>
    &if cond='&var.enabled;':
    <p>Content is enabled</p>
    &else:
    <p>Content is disabled</p>
    &/if;
</body>
</html>
"#;
}

// RXML in SQL queries
string get_sql_query() {
    return "SELECT * FROM users WHERE active = 1 AND role = '&var.role;'";
}

// Multiple RXML tags on single line
string complex_rxml() {
    return "&var.header; - &var.title; - &var.footer;";
}

// Required callbacks
string query_name() { return module_name; }
array(string) query_type() { return ({ "Dynamic", "Pages" }); }
