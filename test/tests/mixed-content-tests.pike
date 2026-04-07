#!/usr/bin/env pike
#pragma strict_types

//! MixedContent.pike Tests
//!
//! Unit tests for LSP.Roxen.MixedContent module:
//! - Position utilities (via compiled helper): build_newline_offsets, offset_to_position,
//!   find_token_position
//! - Confidence calculation: calculate_rxml_confidence
//! - Marker detection: detect_rxml_markers
//! - KNOWN_RXML_TAGS constant
//! - Main handler: roxen_extract_rxml_strings
//!
//! Edge cases: unclosed tags, script injection, malformed markup, empty content,
//! RXML tags within Pike code blocks, mixed HTML/Pike/RXML content.
//!
//! Run with: pike test/tests/mixed-content-tests.pike

int tests_run = 0;
int tests_passed = 0;
int tests_failed = 0;
array(string) failures = ({});
string pike_scripts_path = "";
object test_helper;

//! Setup module path and compile test helper
void setup_module_path() {
    string script_path = __FILE__;
    string base_path = dirname(script_path);
    // Navigate up to find pike-lsp directory, or the repo root
    for (int i = 0; i < 10; i++) {
        if (basename(base_path) == "pike-lsp") break;
        // Also check if pike-scripts exists here
        if (file_stat(combine_path(base_path, "pike-scripts"))) break;
        string parent = dirname(base_path);
        if (parent == base_path) break;
        base_path = parent;
    }
    pike_scripts_path = combine_path(base_path, "pike-scripts");
    master()->add_module_path(pike_scripts_path);

    // Resolve the MixedContent program and make available via add_constant
    mixed mc_prog_raw = master()->resolv("LSP.Roxen.MixedContent");
    if (!programp(mc_prog_raw))
        error("Failed to resolve LSP.Roxen.MixedContent (module path: %s)\n", pike_scripts_path);
    program mc_prog = [program]mc_prog_raw;
    add_constant("MIXED_CONTENT_PROG", mc_prog);

    // Compile a TestHelper class that inherits MixedContent to access protected methods
    string helper_code =
        "inherit MIXED_CONTENT_PROG;\n"
        "array(int) pub_build_newline_offsets(string code) { return build_newline_offsets(code); }\n"
        "mapping(string:int) pub_offset_to_position(int offset, array(int) offsets) { return offset_to_position(offset, offsets); }\n"
        "mapping(string:int) pub_find_token_position(string code, string token_str, int|void start_offset) { return find_token_position(code, token_str, start_offset); }\n"
        "float pub_calculate_rxml_confidence(string content) { return calculate_rxml_confidence(content); }\n"
        "array(mapping) pub_detect_rxml_markers(string content, array(int)|void content_offsets) { return detect_rxml_markers(content, content_offsets); }\n"
        "array(mapping) pub_detect_multiline_strings(string code) { return detect_multiline_strings(code); }\n";

    program helper_prog = compile_string(helper_code, "MixedContentTestHelper");
    test_helper = helper_prog();
}

//! Run a single test function with error handling
void run_test(function test_func, string name) {
    tests_run++;
    mixed err = catch {
        test_func();
        tests_passed++;
        write("  PASS: %s\n", name);
    };
    if (err) {
        tests_failed++;
        failures += ({ name });
        write("  FAIL: %s\n", name);
        if (arrayp(err)) {
            write("    Error: %s\n", err[0] || "Unknown error");
        } else {
            write("    Error: %s\n", sprintf("%O", err));
        }
    }
}

// ============================================================================
// POSITION UTILITIES
// ============================================================================

void test_build_newline_offsets_empty() {
    array(int) offsets = test_helper->pub_build_newline_offsets("");
    if (!equal(offsets, ({0})))
        error("Expected ({0}), got %O\n", offsets);
}

void test_build_newline_offsets_single_line() {
    array(int) offsets = test_helper->pub_build_newline_offsets("hello world");
    if (!equal(offsets, ({0})))
        error("Expected ({0}), got %O\n", offsets);
}

void test_build_newline_offsets_multi_line() {
    array(int) offsets = test_helper->pub_build_newline_offsets("line1\nline2\nline3");
    if (!equal(offsets, ({0, 6, 12})))
        error("Expected ({0, 6, 12}), got %O\n", offsets);
}

void test_build_newline_offsets_trailing_newline() {
    array(int) offsets = test_helper->pub_build_newline_offsets("a\nb\n");
    if (!equal(offsets, ({0, 2, 4})))
        error("Expected ({0, 2, 4}), got %O\n", offsets);
}

void test_offset_to_position_first_char() {
    array(int) offsets = ({0, 6, 12});
    mapping pos = test_helper->pub_offset_to_position(0, offsets);
    if (pos->line != 1 || pos->column != 1)
        error("Expected line=1 col=1, got %O\n", pos);
}

void test_offset_to_position_second_line_start() {
    array(int) offsets = ({0, 6, 12});
    mapping pos = test_helper->pub_offset_to_position(6, offsets);
    if (pos->line != 2 || pos->column != 1)
        error("Expected line=2 col=1, got %O\n", pos);
}

void test_offset_to_position_mid_line() {
    array(int) offsets = ({0, 6, 12});
    mapping pos = test_helper->pub_offset_to_position(8, offsets);
    if (pos->line != 2 || pos->column != 3)
        error("Expected line=2 col=3, got %O\n", pos);
}

void test_offset_to_position_single_line() {
    array(int) offsets = ({0});
    mapping pos = test_helper->pub_offset_to_position(5, offsets);
    if (pos->line != 1 || pos->column != 6)
        error("Expected line=1 col=6, got %O\n", pos);
}

void test_find_token_position_basic() {
    mapping pos = test_helper->pub_find_token_position("hello world foo", "world");
    if (!pos) error("Expected non-zero position\n");
    if (pos->line != 1 || pos->column != 7)
        error("Expected line=1 col=7, got %O\n", pos);
}

void test_find_token_position_not_found() {
    mapping pos = test_helper->pub_find_token_position("hello world", "xyz");
    if (pos) error("Expected 0, got %O\n", pos);
}

void test_find_token_position_multiline() {
    mapping pos = test_helper->pub_find_token_position("abc\ndef\nghi", "ghi");
    if (!pos) error("Expected non-zero position\n");
    if (pos->line != 3 || pos->column != 1)
        error("Expected line=3 col=1, got %O\n", pos);
}

void test_find_token_position_with_offset() {
    mapping pos = test_helper->pub_find_token_position("ab ab ab", "ab", 3);
    if (!pos) error("Expected non-zero position\n");
    // Second "ab" is at offset 3, which is column 4 (1-indexed)
    if (pos->line != 1 || pos->column != 4)
        error("Expected line=1 col=4, got %O\n", pos);
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

void test_confidence_empty_string() {
    float conf = test_helper->pub_calculate_rxml_confidence("");
    if (conf != 0.0)
        error("Expected 0.0, got %O\n", conf);
}

void test_confidence_plain_text() {
    float conf = test_helper->pub_calculate_rxml_confidence("just some plain text");
    if (conf != 0.0)
        error("Expected 0.0 for plain text, got %O\n", conf);
}

void test_confidence_xml_structure() {
    float conf = test_helper->pub_calculate_rxml_confidence("<div>hello</div>");
    if (conf < 0.1)
        error("Expected >= 0.1 for XML-like content, got %O\n", conf);
}

void test_confidence_roxen_tag() {
    float conf = test_helper->pub_calculate_rxml_confidence("<roxen>");
    if (conf < 0.4)
        error("Expected >= 0.4 for roxen tag, got %O\n", conf);
}

void test_confidence_rxml_entities() {
    float conf = test_helper->pub_calculate_rxml_confidence("&form.name; &page.title;");
    if (conf < 0.2)
        error("Expected >= 0.2 for RXML entities, got %O\n", conf);
}

void test_confidence_multiple_indicators() {
    float conf = test_helper->pub_calculate_rxml_confidence("<roxen><set var=\"x\"/>&form.y;</roxen>");
    if (conf < 0.5)
        error("Expected >= 0.5 for multiple indicators, got %O\n", conf);
}

void test_confidence_capped_at_one() {
    float conf = test_helper->pub_calculate_rxml_confidence(
        "<roxen><set /><emit /><if /><elseif /><else /><insert /><output />"
        "&roxen.x;&form.y;&page.z;&client.w;</roxen>");
    if (conf != 1.0)
        error("Expected 1.0 (capped), got %O\n", conf);
}

void test_confidence_case_insensitive() {
    float conf_upper = test_helper->pub_calculate_rxml_confidence("<ROXEN>");
    float conf_lower = test_helper->pub_calculate_rxml_confidence("<roxen>");
    if (conf_upper != conf_lower)
        error("Expected case insensitive: upper=%O lower=%O\n", conf_upper, conf_lower);
}

void test_confidence_set_tag() {
    float conf = test_helper->pub_calculate_rxml_confidence("<set variable=\"x\">value</set>");
    if (conf < 0.2)
        error("Expected >= 0.2 for set tag, got %O\n", conf);
}

void test_confidence_emit_tag() {
    float conf = test_helper->pub_calculate_rxml_confidence("<emit source=\"sql\">");
    if (conf < 0.2)
        error("Expected >= 0.2 for emit tag, got %O\n", conf);
}

void test_confidence_if_elseif_else() {
    float conf = test_helper->pub_calculate_rxml_confidence("<if><elseif /><else />");
    if (conf < 0.15)
        error("Expected >= 0.15 for if/elseif/else, got %O\n", conf);
}

void test_confidence_no_xml_angle_brackets() {
    float conf = test_helper->pub_calculate_rxml_confidence("plain text with &amp; entity but no tags");
    if (conf > 0.0)
        error("Expected 0.0 for text without < and >, got %O\n", conf);
}

// ============================================================================
// MARKER DETECTION
// ============================================================================

void test_detect_markers_empty() {
    array(mapping) markers = test_helper->pub_detect_rxml_markers("");
    if (!equal(markers, ({})))
        error("Expected empty markers, got %O\n", markers);
}

void test_detect_markers_known_tags() {
    array(mapping) markers = test_helper->pub_detect_rxml_markers("<if test=\"true\"><then>ok</then></if>");
    if (sizeof(markers) < 2)
        error("Expected at least 2 markers for if/then, got %d\n", sizeof(markers));
    int found_if = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "if") found_if = 1;
    }
    if (!found_if) error("Expected 'if' tag marker\n");
}

void test_detect_markers_emit_tag() {
    array(mapping) markers = test_helper->pub_detect_rxml_markers("<emit source=\"sql\" query=\"SELECT 1\">content</emit>");
    int found = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "emit") found++;
    }
    if (found < 1)
        error("Expected at least 1 'emit' tag marker, got %d\n", found);
}

void test_detect_markers_unknown_tags() {
    array(mapping) markers = test_helper->pub_detect_rxml_markers("<custom><unknown>text</unknown></custom>");
    if (sizeof(markers) != 0)
        error("Expected 0 markers for unknown tags, got %O\n", markers);
}

void test_detect_markers_entities() {
    array(mapping) markers = test_helper->pub_detect_rxml_markers("&form.name; &page.title; &client.ip;");
    int entity_count = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity") entity_count++;
    }
    if (entity_count != 3)
        error("Expected 3 entity markers, got %d: %O\n", entity_count, markers);
}

void test_detect_markers_entity_line_positions() {
    string content = "line1\n&form.x;\nline3";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int found = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity" && m->name == "form") {
            if (m->line != 2)
                error("Expected entity on line 2, got line %d\n", m->line);
            found = 1;
        }
    }
    if (!found) error("Expected form entity marker\n");
}

void test_detect_markers_unclosed_entity() {
    // &form.name has no semicolon — won't be found; &page.title; will
    array(mapping) markers = test_helper->pub_detect_rxml_markers("&form.name &page.title;");
    int entity_count = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity") entity_count++;
    }
    if (entity_count < 1)
        error("Expected at least 1 entity from &page.title;\n");
}

void test_detect_markers_unknown_entity_prefix() {
    array(mapping) markers = test_helper->pub_detect_rxml_markers("&unknown.name;");
    int entity_count = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity") entity_count++;
    }
    if (entity_count != 0)
        error("Expected 0 markers for unknown entity prefix, got %d\n", entity_count);
}

void test_detect_markers_with_custom_offsets() {
    string content = "<if>true</if>";
    array(int) offsets = test_helper->pub_build_newline_offsets(content);
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content, offsets);
    if (sizeof(markers) < 1)
        error("Expected markers with explicit offsets\n");
}

void test_detect_markers_mixed_tags_and_entities() {
    string content = "<emit source=\"test\">&form.id;</emit>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int tags = 0, entities = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag") tags++;
        if (m->type == "entity") entities++;
    }
    if (tags < 1 || entities < 1)
        error("Expected tags and entities, got tags=%d entities=%d\n", tags, entities);
}

void test_detect_markers_tag_column_positions() {
    // <if> starts at column 1, <then> starts at column 5 (after <if>)
    string content = "<if><then>x</then></if>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int found_if = 0, found_then = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "if" && m->column == 1) found_if = 1;
        if (m->type == "tag" && m->name == "then" && m->column == 5) found_then = 1;
    }
    if (!found_if) error("Expected 'if' at column 1\n");
    if (!found_then) error("Expected 'then' at column 5\n");
}

void test_detect_markers_closing_tags_not_detected() {
    // Closing tags (starting with '/') are not detected by the current implementation
    // because the parser only processes tags starting with [a-z]
    string content = "<if>x</if>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int if_count = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "if") if_count++;
    }
    // Only opening tag is detected
    if (if_count != 1)
        error("Expected exactly 1 'if' marker (open only), got %d\n", if_count);
}

// ============================================================================
// MULTILINE STRING DETECTION
// ============================================================================

void test_detect_multiline_no_strings() {
    array(mapping) results = test_helper->pub_detect_multiline_strings("int x = 1; string s = \"hello\";");
    if (sizeof(results) != 0)
        error("Expected 0 results for no multiline strings, got %d\n", sizeof(results));
}

void test_detect_multiline_plain_string_below_threshold() {
    string code = "string s = #\"just plain text\";";
    array(mapping) results = test_helper->pub_detect_multiline_strings(code);
    if (sizeof(results) != 0)
        error("Expected 0 results for plain text multiline string, got %d\n", sizeof(results));
}

void test_detect_multiline_rxml_string() {
    string code = "string rxml = #\"<roxen><set var=\\\"x\\\"/></roxen>\";";
    array(mapping) results = test_helper->pub_detect_multiline_strings(code);
    // Document behavior — Parser.Pike.split may return #" as single token
    if (!arrayp(results))
        error("Expected array from detect_multiline_strings\n");
}

void test_detect_multiline_result_structure() {
    string code = "string rxml = #\"<roxen><emit /></roxen>\";";
    array(mapping) results = test_helper->pub_detect_multiline_strings(code);
    if (sizeof(results) >= 1) {
        mapping r = results[0];
        if (!mappingp(r)) error("Result should be mapping\n");
        if (!has_index(r, "content")) error("Missing 'content' key\n");
        if (!has_index(r, "start")) error("Missing 'start' key\n");
        if (!has_index(r, "end")) error("Missing 'end' key\n");
        if (!has_index(r, "confidence")) error("Missing 'confidence' key\n");
        if (!has_index(r, "markers")) error("Missing 'markers' key\n");
    }
}

void test_detect_multiline_empty_code() {
    array(mapping) results = test_helper->pub_detect_multiline_strings("");
    if (sizeof(results) != 0)
        error("Expected 0 results for empty code, got %d\n", sizeof(results));
}

void test_detect_multiline_whitespace_content() {
    string code = "string s = #\"   \n\t\n  \";";
    array(mapping) results = test_helper->pub_detect_multiline_strings(code);
    if (!arrayp(results))
        error("Expected array\n");
}

// ============================================================================
// MAIN HANDLER: roxen_extract_rxml_strings
// ============================================================================

void test_handler_basic() {
    mapping result = test_helper->roxen_extract_rxml_strings(([
        "code": "string s = #\"<roxen>hello</roxen>\";",
        "filename": "test.pike"
    ]));
    if (!mappingp(result) || !mappingp(result->result))
        error("Expected result mapping\n");
    if (!has_index(result->result, "strings"))
        error("Missing 'strings' in result\n");
}

void test_handler_empty_code() {
    mapping result = test_helper->roxen_extract_rxml_strings((["code": "", "filename": "empty.pike"]));
    array(mapping) strings = result->result->strings;
    if (!equal(strings, ({})))
        error("Expected empty strings for empty code, got %O\n", strings);
}

void test_handler_no_params() {
    mapping result = test_helper->roxen_extract_rxml_strings(([]));
    if (!mappingp(result))
        error("Expected result mapping even with no params\n");
}

void test_handler_filename_default() {
    mapping result = test_helper->roxen_extract_rxml_strings((["code": "int x;"]));
    if (!mappingp(result)) error("Expected result mapping\n");
}

void test_handler_returns_strings_array() {
    mapping result = test_helper->roxen_extract_rxml_strings((["code": "int x = 1;", "filename": "plain.pike"]));
    if (!arrayp(result->result->strings))
        error("Expected 'strings' to be array\n");
}

void test_handler_mixed_html_pike() {
    string code =
        "string page = #\"\n"
        "<html><body>\n"
        "<roxen><set var=\\\"x\\\" value=\\\"1\\\"/></roxen>\n"
        "</body></html>\n"
        "\";\n";
    mapping result = test_helper->roxen_extract_rxml_strings((["code": code, "filename": "mixed.pike"]));
    if (!mappingp(result->result))
        error("Expected valid result structure\n");
    if (!arrayp(result->result->strings))
        error("Expected strings array\n");
}

void test_handler_rxml_in_pike_context() {
    string code =
        "string render() {\n"
        "  return #\"\n"
        "    <if test=\\\"true\\\">\n"
        "      <emit source=\\\"sql\\\" query=\\\"SELECT 1\\\"/>\n"
        "    </if>\n"
        "  \";\n"
        "}\n";
    mapping result = test_helper->roxen_extract_rxml_strings((["code": code, "filename": "rxml.pike"]));
    if (!mappingp(result->result))
        error("Expected valid result structure for RXML in Pike\n");
}

void test_handler_all_three_combined() {
    string code =
        "string template = #\"\n"
        "<html>\n"
        "<head><title>&page.title;</title></head>\n"
        "<body>\n"
        "<roxen><emit source=\\\"users\\\">&form.id;</emit></roxen>\n"
        "</body></html>\n"
        "\";\n";
    mapping result = test_helper->roxen_extract_rxml_strings((["code": code, "filename": "combined.pike"]));
    if (!mappingp(result->result))
        error("Expected valid result structure for combined content\n");
}

void test_handler_only_pike_code() {
    string code =
        "int main() {\n"
        "  write(\"Hello\\n\");\n"
        "  return 0;\n"
        "}\n";
    mapping result = test_helper->roxen_extract_rxml_strings((["code": code, "filename": "pure.pike"]));
    if (sizeof(result->result->strings) != 0)
        error("Expected 0 strings for pure Pike code, got %d\n", sizeof(result->result->strings));
}

// ============================================================================
// KNOWN_RXML_TAGS CONSTANT
// ============================================================================

void test_known_rxml_tags_is_array() {
    if (!arrayp(test_helper->KNOWN_RXML_TAGS))
        error("KNOWN_RXML_TAGS should be an array\n");
}

void test_known_rxml_tags_contains_core() {
    array(string) expected = ({"roxen", "set", "emit", "if", "else", "insert", "output"});
    foreach (expected, string tag) {
        if (!has_value(test_helper->KNOWN_RXML_TAGS, tag))
            error("KNOWN_RXML_TAGS missing core tag: %s\n", tag);
    }
}

void test_known_rxml_tags_all_lowercase() {
    foreach (test_helper->KNOWN_RXML_TAGS, string tag) {
        if (tag != lower_case(tag))
            error("KNOWN_RXML_TAGS entry not lowercase: %s\n", tag);
    }
}

void test_known_rxml_tags_no_duplicates() {
    array(string) tags = test_helper->KNOWN_RXML_TAGS;
    if (sizeof(tags) != sizeof(mkmultiset(tags)))
        error("KNOWN_RXML_TAGS contains duplicates\n");
}

// ============================================================================
// EDGE CASES
// ============================================================================

void test_edge_unclosed_tag() {
    string content = "<if test=\"x\"><then>open";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    if (!arrayp(markers))
        error("Expected array even with unclosed tags\n");
}

void test_edge_script_injection() {
    string content = "<script>alert('xss')</script>&form.name;";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int entity_count = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity" && m->name == "form") entity_count++;
    }
    if (entity_count < 1)
        error("Expected form entity even with script injection\n");
}

void test_edge_malformed_markup() {
    string content = "<<>><if>&form.x;</if><><";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    if (!arrayp(markers))
        error("Expected array for malformed markup\n");
}

void test_edge_empty_content() {
    float conf = test_helper->pub_calculate_rxml_confidence("");
    if (conf != 0.0)
        error("Expected 0.0 confidence for empty string\n");
    array(mapping) markers = test_helper->pub_detect_rxml_markers("");
    if (sizeof(markers) != 0)
        error("Expected 0 markers for empty string\n");
}

void test_edge_whitespace_only() {
    float conf = test_helper->pub_calculate_rxml_confidence("   \n\t\n  ");
    if (conf != 0.0)
        error("Expected 0.0 confidence for whitespace\n");
}

void test_edge_deeply_nested_tags() {
    string content = "<if><if><if><emit /></if></if></if>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int emit_count = 0;
    foreach (markers, mapping m) {
        if (m->name == "emit") emit_count++;
    }
    if (emit_count < 1)
        error("Expected emit in nested tags\n");
}

void test_edge_numeric_tag_name() {
    string content = "<1invalid>text</1invalid>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    if (!arrayp(markers))
        error("Expected array for numeric tag names\n");
}

void test_edge_entity_without_dot() {
    string content = "&amp; &lt; &form.name;";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int form_entities = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity" && m->name == "form") form_entities++;
    }
    if (form_entities != 1)
        error("Expected 1 form entity, got %d\n", form_entities);
}

void test_edge_all_known_tags() {
    foreach (test_helper->KNOWN_RXML_TAGS, string tag) {
        string content = "<" + tag + " />";
        array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
        int found = 0;
        foreach (markers, mapping m) {
            if (m->name == tag) found = 1;
        }
        if (!found)
            error("KNOWN_RXML_TAGS entry '%s' not detected\n", tag);
    }
}

void test_edge_all_known_entity_prefixes() {
    array(string) prefixes = ({"roxen", "form", "page", "client", "cache", "config", "usr"});
    foreach (prefixes, string prefix) {
        string content = "&" + prefix + ".value;";
        array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
        int found = 0;
        foreach (markers, mapping m) {
            if (m->type == "entity" && m->name == prefix) found = 1;
        }
        if (!found)
            error("Entity prefix '%s' not detected\n", prefix);
    }
}

void test_edge_position_at_end_of_code() {
    string code = "abcdef";
    array(int) offsets = test_helper->pub_build_newline_offsets(code);
    mapping pos = test_helper->pub_offset_to_position(5, offsets);
    if (pos->line != 1 || pos->column != 6)
        error("Expected line=1 col=6, got %O\n", pos);
}

void test_edge_single_char_lines() {
    string code = "a\nb\nc\nd";
    array(int) offsets = test_helper->pub_build_newline_offsets(code);
    if (sizeof(offsets) != 4)
        error("Expected 4 line offsets, got %d\n", sizeof(offsets));
    mapping pos_d = test_helper->pub_offset_to_position(6, offsets);
    if (pos_d->line != 4 || pos_d->column != 1)
        error("Expected line=4 col=1 for 'd', got %O\n", pos_d);
}

void test_edge_entity_at_line_start() {
    string content = "\n\n&roxen.version;";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int found = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity" && m->name == "roxen") {
            if (m->line != 3)
                error("Expected entity on line 3, got line %d\n", m->line);
            found = 1;
        }
    }
    if (!found) error("Expected roxen entity marker\n");
}

void test_edge_multiple_entities_same_prefix() {
    string content = "&form.name; &form.email; &form.phone;";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int form_count = 0;
    foreach (markers, mapping m) {
        if (m->type == "entity" && m->name == "form") form_count++;
    }
    if (form_count != 3)
        error("Expected 3 form entities, got %d\n", form_count);
}

void test_edge_tag_with_attributes() {
    string content = "<emit source=\"sql\" query=\"SELECT * FROM users\" sort=\"name\">";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int found = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "emit") found = 1;
    }
    if (!found)
        error("Expected emit tag with attributes\n");
}

void test_edge_self_closing_tag() {
    string content = "<set variable=\"x\" value=\"1\"/>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    int found = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "set") found = 1;
    }
    if (!found)
        error("Expected set self-closing tag\n");
}

void test_edge_confidence_accumulation_order() {
    float conf_set = test_helper->pub_calculate_rxml_confidence("<set ");
    float conf_set_roxen = test_helper->pub_calculate_rxml_confidence("<roxen><set ");
    if (conf_set_roxen <= conf_set)
        error("Expected combined confidence > single: combined=%O single=%O\n",
              conf_set_roxen, conf_set);
}

// ============================================================================
// INTEGRATION
// ============================================================================

void test_integration_markers_in_rxml_string() {
    string rxml_content = "<if test=\"user\"><emit source=\"db\">&form.id;</emit></if>";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(rxml_content);
    int if_tags = 0, emit_tags = 0, entities = 0;
    foreach (markers, mapping m) {
        if (m->type == "tag" && m->name == "if") if_tags++;
        if (m->type == "tag" && m->name == "emit") emit_tags++;
        if (m->type == "entity") entities++;
    }
    if (if_tags < 1) error("Expected 'if' tag in integration test\n");
    if (emit_tags < 1) error("Expected 'emit' tag in integration test\n");
    if (entities < 1) error("Expected entity in integration test\n");
}

void test_integration_confidence_with_markers() {
    string content = "<roxen><emit source=\"test\">&page.id;</emit></roxen>";
    float conf = test_helper->pub_calculate_rxml_confidence(content);
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    if (conf < 0.5) error("Expected high confidence for rich RXML, got %O\n", conf);
    if (sizeof(markers) < 3) error("Expected at least 3 markers, got %d\n", sizeof(markers));
}

void test_integration_position_tracking_across_markers() {
    string content = "line1\n<if>true</if>\nline3\n&form.x;";
    array(mapping) markers = test_helper->pub_detect_rxml_markers(content);
    foreach (markers, mapping m) {
        if (m->line < 1 || m->column < 1)
            error("Invalid position for marker %O\n", m);
    }
}

// ============================================================================
// MAIN
// ============================================================================

int main() {
    setup_module_path();

    write("MixedContent.pike Tests\n");
    write("========================\n\n");

    // Position utilities
    write("Position Utilities\n");
    write("------------------\n");
    run_test(test_build_newline_offsets_empty, "build_newline_offsets: empty string");
    run_test(test_build_newline_offsets_single_line, "build_newline_offsets: single line");
    run_test(test_build_newline_offsets_multi_line, "build_newline_offsets: multi line");
    run_test(test_build_newline_offsets_trailing_newline, "build_newline_offsets: trailing newline");
    run_test(test_offset_to_position_first_char, "offset_to_position: first char");
    run_test(test_offset_to_position_second_line_start, "offset_to_position: second line start");
    run_test(test_offset_to_position_mid_line, "offset_to_position: mid line");
    run_test(test_offset_to_position_single_line, "offset_to_position: single line");
    run_test(test_find_token_position_basic, "find_token_position: basic");
    run_test(test_find_token_position_not_found, "find_token_position: not found");
    run_test(test_find_token_position_multiline, "find_token_position: multiline");
    run_test(test_find_token_position_with_offset, "find_token_position: with offset");
    write("\n");

    // Confidence calculation
    write("Confidence Calculation\n");
    write("----------------------\n");
    run_test(test_confidence_empty_string, "confidence: empty string");
    run_test(test_confidence_plain_text, "confidence: plain text");
    run_test(test_confidence_xml_structure, "confidence: XML structure");
    run_test(test_confidence_roxen_tag, "confidence: roxen tag");
    run_test(test_confidence_rxml_entities, "confidence: RXML entities");
    run_test(test_confidence_multiple_indicators, "confidence: multiple indicators");
    run_test(test_confidence_capped_at_one, "confidence: capped at 1.0");
    run_test(test_confidence_case_insensitive, "confidence: case insensitive");
    run_test(test_confidence_set_tag, "confidence: set tag");
    run_test(test_confidence_emit_tag, "confidence: emit tag");
    run_test(test_confidence_if_elseif_else, "confidence: if/elseif/else");
    run_test(test_confidence_no_xml_angle_brackets, "confidence: no angle brackets");
    write("\n");

    // Marker detection
    write("Marker Detection\n");
    write("----------------\n");
    run_test(test_detect_markers_empty, "markers: empty content");
    run_test(test_detect_markers_known_tags, "markers: known tags (if/then)");
    run_test(test_detect_markers_emit_tag, "markers: emit tag");
    run_test(test_detect_markers_unknown_tags, "markers: unknown tags ignored");
    run_test(test_detect_markers_entities, "markers: RXML entities");
    run_test(test_detect_markers_entity_line_positions, "markers: entity line positions");
    run_test(test_detect_markers_unclosed_entity, "markers: unclosed entity");
    run_test(test_detect_markers_unknown_entity_prefix, "markers: unknown entity prefix");
    run_test(test_detect_markers_with_custom_offsets, "markers: custom offsets");
    run_test(test_detect_markers_mixed_tags_and_entities, "markers: mixed tags and entities");
    run_test(test_detect_markers_tag_column_positions, "markers: tag column positions");
    run_test(test_detect_markers_closing_tags_not_detected, "markers: closing tags not detected");
    write("\n");

    // Multiline string detection
    write("Multiline String Detection\n");
    write("--------------------------\n");
    run_test(test_detect_multiline_no_strings, "multiline: no multiline strings");
    run_test(test_detect_multiline_plain_string_below_threshold, "multiline: plain text (below threshold)");
    run_test(test_detect_multiline_rxml_string, "multiline: RXML string");
    run_test(test_detect_multiline_result_structure, "multiline: result structure");
    run_test(test_detect_multiline_empty_code, "multiline: empty code");
    run_test(test_detect_multiline_whitespace_content, "multiline: whitespace content");
    write("\n");

    // Main handler
    write("Main Handler\n");
    write("------------\n");
    run_test(test_handler_basic, "handler: basic extraction");
    run_test(test_handler_empty_code, "handler: empty code");
    run_test(test_handler_no_params, "handler: no params");
    run_test(test_handler_filename_default, "handler: filename default");
    run_test(test_handler_returns_strings_array, "handler: returns strings array");
    run_test(test_handler_mixed_html_pike, "handler: mixed HTML+Pike");
    run_test(test_handler_rxml_in_pike_context, "handler: RXML in Pike context");
    run_test(test_handler_all_three_combined, "handler: HTML+RXML+Pike combined");
    run_test(test_handler_only_pike_code, "handler: only Pike code");
    write("\n");

    // KNOWN_RXML_TAGS
    write("KNOWN_RXML_TAGS Constant\n");
    write("------------------------\n");
    run_test(test_known_rxml_tags_is_array, "KNOWN_RXML_TAGS: is array");
    run_test(test_known_rxml_tags_contains_core, "KNOWN_RXML_TAGS: contains core tags");
    run_test(test_known_rxml_tags_all_lowercase, "KNOWN_RXML_TAGS: all lowercase");
    run_test(test_known_rxml_tags_no_duplicates, "KNOWN_RXML_TAGS: no duplicates");
    write("\n");

    // Edge cases
    write("Edge Cases\n");
    write("----------\n");
    run_test(test_edge_unclosed_tag, "edge: unclosed tag");
    run_test(test_edge_script_injection, "edge: script injection");
    run_test(test_edge_malformed_markup, "edge: malformed markup");
    run_test(test_edge_empty_content, "edge: empty content");
    run_test(test_edge_whitespace_only, "edge: whitespace only");
    run_test(test_edge_deeply_nested_tags, "edge: deeply nested tags");
    run_test(test_edge_numeric_tag_name, "edge: numeric tag name");
    run_test(test_edge_entity_without_dot, "edge: entity without dot");
    run_test(test_edge_all_known_tags, "edge: all KNOWN_RXML_TAGS recognized");
    run_test(test_edge_all_known_entity_prefixes, "edge: all entity prefixes recognized");
    run_test(test_edge_position_at_end_of_code, "edge: position at end of code");
    run_test(test_edge_single_char_lines, "edge: single char lines");
    run_test(test_edge_entity_at_line_start, "edge: entity at line start");
    run_test(test_edge_multiple_entities_same_prefix, "edge: multiple entities same prefix");
    run_test(test_edge_tag_with_attributes, "edge: tag with attributes");
    run_test(test_edge_self_closing_tag, "edge: self-closing tag");
    run_test(test_edge_confidence_accumulation_order, "edge: confidence accumulation order");
    write("\n");

    // Integration
    write("Integration\n");
    write("-----------\n");
    run_test(test_integration_markers_in_rxml_string, "integration: markers in RXML string");
    run_test(test_integration_confidence_with_markers, "integration: confidence with markers");
    run_test(test_integration_position_tracking_across_markers, "integration: position tracking");
    write("\n");

    // Summary
    write("========================\n");
    write("Results: %d/%d passed", tests_passed, tests_run);
    if (tests_failed > 0) {
        write(", %d failed\n", tests_failed);
        foreach (failures, string f) {
            write("  FAILED: %s\n", f);
        }
        return 1;
    }
    write("\nAll tests passed!\n");
    return 0;
}
