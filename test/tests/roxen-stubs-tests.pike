#!/usr/bin/env pike
#pragma strict_types

//! LSP RoxenStubs Tests
//!
//! Unit tests for LSP.RoxenStubs module tree:
//! - module.pike: exports Roxen and RXML classes
//! - Roxen.pike: RequestID, module class, constants (MODULE_*, TYPE_*, VAR_*)
//! - RXML.pike: Tag, TagSet, PXml, FLAG_* constants
//!
//! Modules: RoxenStubs, RoxenStubs.Roxen, RoxenStubs.RXML
//! Run with: pike test/tests/roxen-stubs-tests.pike

int test_count = 0;
int pass_count = 0;
int fail_count = 0;
array(string) failure_messages = ({});

void setup_module_path() {
    string script_path = __FILE__;
    string base_path = dirname(script_path);
    for (int i = 0; i < 10; i++) {
        if (basename(base_path) == "pike-lsp") { break; }
        string parent = dirname(base_path);
        if (parent == base_path) break;
        base_path = parent;
    }
    string pike_scripts_path = combine_path(base_path, "pike-scripts");
    master()->add_module_path(pike_scripts_path);
}

void run_test(function test_func, string name) {
    test_count++;
    mixed err = catch {
        test_func();
        pass_count++;
        write("\033[32m[PASS]\033[0m %s\n", name);
    };
    if (err) {
        fail_count++;
        failure_messages += ({ name });
        write("\033[31m[FAIL]\033[0m %s\n", name);
        if (arrayp(err)) { write("    Error: %s\n", err[0] || "Unknown error"); }
        else { write("    Error: %s\n", sprintf("%O", err)); }
    }
}

int main() {
    setup_module_path();
    write("LSP RoxenStubs Tests\n");
    write("=====================\n\n");

    // Module loading
    run_test(test_module_loads, "RoxenStubs module loads");
    run_test(test_roxen_module_loads, "RoxenStubs.Roxen module loads");
    run_test(test_rxml_module_loads, "RoxenStubs.RXML module loads");

    // Exports
    run_test(test_module_exports_roxen, "module.pike exports Roxen");
    run_test(test_module_exports_rxml, "module.pike exports RXML");

    // Roxen.pike constants
    run_test(test_roxen_module_constants, "Roxen: MODULE_* constants defined");
    run_test(test_roxen_type_constants, "Roxen: TYPE_* constants defined");
    run_test(test_roxen_var_flag_constants, "Roxen: VAR_* constants defined");

    // Roxen RequestID
    run_test(test_roxen_request_id_create, "Roxen: RequestID create");
    run_test(test_roxen_request_id_methods, "Roxen: RequestID methods");

    // Roxen module stub
    run_test(test_roxen_module_stub_create, "Roxen: module stub create");
    run_test(test_roxen_module_stub_defvar, "Roxen: module defvar");

    // RXML constants
    run_test(test_rxml_flag_constants, "RXML: FLAG_* constants defined");

    // RXML Tag
    run_test(test_rxml_tag_create, "RXML: Tag create with name");
    run_test(test_rxml_tag_with_args, "RXML: Tag create with args");
    run_test(test_rxml_tag_fields, "RXML: Tag has name and flags fields");

    // RXML TagSet
    run_test(test_rxml_tagset_create, "RXML: TagSet create");
    run_test(test_rxml_tagset_add_tag, "RXML: TagSet add_tag / get_tag");
    run_test(test_rxml_tagset_remove_tag, "RXML: TagSet remove_tag");
    run_test(test_rxml_tagset_register_tag, "RXML: TagSet register_tag");

    // RXML PXml
    run_test(test_rxml_pxml_create, "RXML: PXml create");
    run_test(test_rxml_pxml_get_xml, "RXML: PXml get_xml");

    write("\n");
    write("Results: %d run, %d passed, %d failed\n", test_count, pass_count, fail_count);
    if (fail_count > 0) {
        write("\nFailed tests:\n");
        foreach (failure_messages, string name) { write("  - %s\n", name); }
        return 1;
    }
    return 0;
}

// =============================================================================
// Module Loading
// =============================================================================

void test_module_loads() {
    mixed mod = master()->resolv("LSP.RoxenStubs");
    if (!mod) error("LSP.RoxenStubs returned 0\n");
}

void test_roxen_module_loads() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    if (!mod) error("LSP.RoxenStubs.Roxen returned 0\n");
}

void test_rxml_module_loads() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    if (!mod) error("LSP.RoxenStubs.RXML returned 0\n");
}

void test_module_exports_roxen() {
    mixed mod = master()->resolv("LSP.RoxenStubs");
    if (!mod->Roxen) error("RoxenStubs should export Roxen\n");
}

void test_module_exports_rxml() {
    mixed mod = master()->resolv("LSP.RoxenStubs");
    if (!mod->RXML) error("RoxenStubs should export RXML\n");
}

// =============================================================================
// Roxen Constants
// =============================================================================

void test_roxen_module_constants() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    // Check a representative set of MODULE_* constants
    if (!intp(mod->MODULE_ZERO)) error("MODULE_ZERO not defined\n");
    if (!intp(mod->MODULE_EXTENSION)) error("MODULE_EXTENSION not defined\n");
    if (!intp(mod->MODULE_LOCATION)) error("MODULE_LOCATION not defined\n");
    if (!intp(mod->MODULE_TAG)) error("MODULE_TAG not defined\n");
    if (!intp(mod->MODULE_PROVIDER)) error("MODULE_PROVIDER not defined\n");
}

void test_roxen_type_constants() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    if (!intp(mod->TYPE_STRING)) error("TYPE_STRING not defined\n");
    if (!intp(mod->TYPE_INT)) error("TYPE_INT not defined\n");
    if (!intp(mod->TYPE_FLAG)) error("TYPE_FLAG not defined\n");
}

void test_roxen_var_flag_constants() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    if (!intp(mod->VAR_EXPERT)) error("VAR_EXPERT not defined\n");
    if (!intp(mod->VAR_MORE)) error("VAR_MORE not defined\n");
    if (!intp(mod->VAR_DEVELOPER)) error("VAR_DEVELOPER not defined\n");
}

// =============================================================================
// Roxen RequestID
// =============================================================================

void test_roxen_request_id_create() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    mixed req = mod->RequestID();
    if (!req) error("RequestID returned 0\n");
}

void test_roxen_request_id_methods() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    mixed req = mod->RequestID();
    // Verify methods exist and return expected types
    mixed vars = req->get_variables();
    if (!mappingp(vars) && vars != 0) error("get_variables should return mapping or 0\n");

    mixed query = req->get_query();
    if (!stringp(query) && query != 0) error("get_query should return string or 0\n");

    mixed method = req->get_method();
    if (!stringp(method) && method != 0) error("get_method should return string or 0\n");

    mixed protocol = req->get_protocol();
    if (!stringp(protocol) && protocol != 0) error("get_protocol should return string or 0\n");
}

// =============================================================================
// Roxen module stub
// =============================================================================

void test_roxen_module_stub_create() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    mixed m = mod->module();
    if (!m) error("module() returned 0\n");
}

void test_roxen_module_stub_defvar() {
    mixed mod = master()->resolv("LSP.RoxenStubs.Roxen");
    mixed m = mod->module();
    // defvar should not throw
    m->defvar("myvar", "default", "My Variable", mod->TYPE_STRING, "A test variable");
}

// =============================================================================
// RXML Constants
// =============================================================================

void test_rxml_flag_constants() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    if (!intp(mod->FLAG_EMPTY_ELEMENT)) error("FLAG_EMPTY_ELEMENT not defined\n");
    if (!intp(mod->FLAG_STREAM_CONTENT)) error("FLAG_STREAM_CONTENT not defined\n");
    if (!intp(mod->FLAG_DONT_REPORT_RESULT)) error("FLAG_DONT_REPORT_RESULT not defined\n");
}

// =============================================================================
// RXML Tag
// =============================================================================

void test_rxml_tag_create() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed tag = mod->Tag("test-tag");
    if (!tag) error("Tag returned 0\n");
    if (tag->name != "test-tag") error("Tag name should be 'test-tag', got %O\n", tag->name);
}

void test_rxml_tag_with_args() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed tag = mod->Tag("my-tag", (["href": "http://example.com"]));
    if (!tag) error("Tag returned 0\n");
    if (!mappingp(tag->args)) error("Tag args should be mapping\n");
    if (tag->args->href != "http://example.com") error("Tag args href mismatch\n");
}

void test_rxml_tag_fields() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed tag = mod->Tag("field-test");
    if (!stringp(tag->name)) error("Tag name should be string\n");
    // flags field should exist
    if (!intp(tag->flags)) error("Tag flags should be int\n");
}

// =============================================================================
// RXML TagSet
// =============================================================================

void test_rxml_tagset_create() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed ts = mod->TagSet("test-set");
    if (!ts) error("TagSet returned 0\n");
}

void test_rxml_tagset_add_tag() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed ts = mod->TagSet("test-set");
    mixed tag = mod->Tag("mytag");
    ts->add_tag(tag);
    mixed found = ts->get_tag("mytag");
    if (!found) error("get_tag should return the added tag\n");
}

void test_rxml_tagset_remove_tag() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed ts = mod->TagSet("test-set");
    mixed tag = mod->Tag("removeme");
    ts->add_tag(tag);
    ts->remove_tag("removeme");
    mixed found = ts->get_tag("removeme");
    if (found) error("get_tag should return 0 after remove_tag\n");
}

void test_rxml_tagset_register_tag() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed ts = mod->TagSet("test-set");
    mixed tag = mod->Tag("registered");
    // register_tag should not throw
    ts->register_tag(tag);
}

// =============================================================================
// RXML PXml
// =============================================================================

void test_rxml_pxml_create() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed px = mod->PXml("<test/>");
    if (!px) error("PXml returned 0\n");
}

void test_rxml_pxml_get_xml() {
    mixed mod = master()->resolv("LSP.RoxenStubs.RXML");
    mixed px = mod->PXml("<test>content</test>");
    mixed xml = px->get_xml();
    if (!stringp(xml) && xml != 0) error("get_xml should return string or 0, got %O\n", xml);
}
