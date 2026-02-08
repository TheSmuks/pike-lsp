//! Roxen tag parsing tests - TDD RED phase
//! These tests MUST fail before implementing the fixes

// Load the module directly
string module_dir = combine_path(__FILE__, "../..");
program RoxenProg = compile_file(module_dir + "/Roxen.pike");

//! Test 1: simpletag_hello(...) -> name="hello", type="simple"
void test_simpletag_detection(program Roxen) {
    werror("TEST: test_simpletag_detection\n");

    string code = "string simpletag_hello(mapping args, RequestID id) {\n" +
    "    return \"world\";\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_tags(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) tags = result->result->tags || ({});

    if (sizeof(tags) != 1) {
        werror("FAIL: Should have 1 tag, got %d\n", sizeof(tags));
        exit(1);
    }

    mapping tag = tags[0];

    if (tag->name != "hello") {
        werror("FAIL: Tag name should be 'hello', got '%s'\n", tag->name);
        exit(1);
    }

    if (tag->type != "simple") {
        werror("FAIL: Tag type should be 'simple', got '%s'\n", tag->type);
        exit(1);
    }

    werror("PASS: test_simpletag_detection\n");
}

//! Test 2: container_box(...) -> name="box", type="container"
void test_container_detection(program Roxen) {
    werror("TEST: test_container_detection\n");

    string code = "string container_box(string contents, mapping args, RequestID id) {\n" +
    "    return \"<parsed>\" + contents + \"</parsed>\";\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_tags(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) tags = result->result->tags || ({});

    if (sizeof(tags) != 1) {
        werror("FAIL: Should have 1 tag, got %d\n", sizeof(tags));
        exit(1);
    }

    mapping tag = tags[0];

    if (tag->name != "box") {
        werror("FAIL: Tag name should be 'box', got '%s'\n", tag->name);
        exit(1);
    }

    if (tag->type != "container") {
        werror("FAIL: Tag type should be 'container', got '%s'\n", tag->type);
        exit(1);
    }

    werror("PASS: test_container_detection\n");
}

//! Test 3: class TagFoo { inherit RXML.Tag; constant name = "foo"; } -> detected
void test_rxml_tag_class_detection(program Roxen) {
    werror("TEST: test_rxml_tag_class_detection\n");

    string code = "class TagFoo {\n" +
    "    inherit RXML.Tag;\n" +
    "    constant name = \"foo\";\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_tags(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) tags = result->result->tags || ({});

    // Should detect RXML.Tag class (bug: currently only detects simpletag_/container_)
    if (sizeof(tags) != 1) {
        werror("FAIL: Should detect RXML.Tag class, got %d tags\n", sizeof(tags));
        exit(1);
    }

    mapping tag = tags[0];

    if (tag->name != "foo") {
        werror("FAIL: Tag name should be 'foo', got '%s'\n", tag->name);
        exit(1);
    }

    // RXML.Tag with FLAG_EMPTY_ELEMENT is "simple", with Frame subclass is "container"
    if (tag->type != "simple" && tag->type != "container") {
        werror("FAIL: Tag type should be 'simple' or 'container', got '%s'\n", tag->type);
        exit(1);
    }

    werror("PASS: test_rxml_tag_class_detection\n");
}

//! Test 4: Position is actual line number (not 1,1)
void test_tag_position_tracking(program Roxen) {
    werror("TEST: test_tag_position_tracking\n");

    string code = "// Line 1\n" +
    "// Line 2\n" +
    "string simpletag_test(mapping args, RequestID id) {\n" +
    "    return \"result\";\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_tags(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) tags = result->result->tags || ({});

    if (sizeof(tags) != 1) {
        werror("FAIL: Should have 1 tag, got %d\n", sizeof(tags));
        exit(1);
    }

    mapping pos = tags[0]->position;

    // Position should be actual line 3 (bug: currently returns 1,1)
    if (pos->line == 1) {
        werror("FAIL: Position should be actual line number (3), not 1\n");
        exit(1);
    }

    if (pos->line != 3) {
        werror("FAIL: Position line should be 3, got %d\n", pos->line);
        exit(1);
    }

    werror("PASS: test_tag_position_tracking\n");
}

//! Test 5: RXML.Tag class with Frame subclass -> type="container"
void test_rxml_tag_frame_detection(program Roxen) {
    werror("TEST: test_rxml_tag_frame_detection\n");

    string code = "class TagBox {\n" +
    "    inherit RXML.Tag;\n" +
    "    constant name = \"box\";\n" +
    "    class Frame {\n" +
    "        // Frame implementation means container tag\n" +
    "    }\n" +
    "}\n";

    object roxen = Roxen();
    mapping result = roxen->parse_tags(([
        "code": code,
        "filename": "test.pike"
    ]));

    array(mapping) tags = result->result->tags || ({});

    if (sizeof(tags) != 1) {
        werror("FAIL: Should detect RXML.Tag with Frame, got %d tags\n", sizeof(tags));
        exit(1);
    }

    mapping tag = tags[0];

    if (tag->type != "container") {
        werror("FAIL: Tag with Frame should be 'container', got '%s'\n", tag->type);
        exit(1);
    }

    werror("PASS: test_rxml_tag_frame_detection\n");
}

//! Main test runner
int main(int argc, array(string) argv) {
    werror("=== Roxen Tag Parsing Tests (RED phase) ===\n\n");

    test_simpletag_detection(RoxenProg);
    test_container_detection(RoxenProg);
    test_rxml_tag_class_detection(RoxenProg);
    test_tag_position_tracking(RoxenProg);
    test_rxml_tag_frame_detection(RoxenProg);

    werror("\n=== ALL TESTS PASSED (but they should FAIL - this is RED phase) ===\n");
    return 0;
}
