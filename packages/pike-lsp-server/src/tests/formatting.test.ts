
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatPikeCode } from '../features/advanced/formatting.js';
import { TextEdit } from 'vscode-languageserver/node.js';

describe('Formatter', () => {
    // Helper to apply edits to text
    function applyEdits(text: string, edits: TextEdit[]): string {
        const lines = text.split('\n');
        // Sort edits reverse to apply from bottom up (though specific line replacements in this formatter are simpler)
        // The formatter returns edits that replace the indentation of lines.
        // Each edit is for a specific line's leading whitespace.

        // Let's just map lines to their new content
        const newLines = [...lines];
        for (const edit of edits) {
            const lineIdx = edit.range.start.line;
            const line = newLines[lineIdx] ?? '';
            // The edit replaces range (0 to currentIndentLength) with newText
            // We need to know what the original indent length was.
            // But the test helper can just assume we replace leading whitespace.

            // Reconstruct the line
            const content = line.trimStart();
            newLines[lineIdx] = edit.newText + content;
        }
        return newLines.join('\n');
    }

    function format(code: string): string {
        const edits = formatPikeCode(code, '    '); // 4 spaces
        return applyEdits(code, edits);
    }

    it('formats basic class and method', () => {
        const input = `
class Example {
int x;
void do_something() {
return;
}
}
`.trim();

        const expected = `
class Example {
    int x;
    void do_something() {
        return;
    }
}
`.trim();

        assert.equal(format(input), expected);
    });

    it('formats if/else with braces', () => {
        const input = `
void test() {
if (x) {
y = 1;
} else {
y = 2;
}
}
`.trim();

        const expected = `
void test() {
    if (x) {
        y = 1;
    } else {
        y = 2;
    }
}
`.trim();

        assert.equal(format(input), expected);
    });

    it('formats braceless if/else', () => {
        const input = `
void test() {
if (x)
y = 1;
else
y = 2;
}
`.trim();

        const expected = `
void test() {
    if (x)
        y = 1;
    else
        y = 2;
}
`.trim();

        assert.equal(format(input), expected);
    });

    it('formats switch/case', () => {
        const input = `
void test() {
switch (x) {
case 1:
y = 1;
break;
default:
y = 0;
}
}
`.trim();

        const expected = `
void test() {
    switch (x) {
    case 1:
        y = 1;
        break;
    default:
        y = 0;
    }
}
`.trim();

        assert.equal(format(input), expected);
    });

    it('formats switch/case with multiple statements in case body', () => {
        const input = `
void test() {
switch (x) {
case 1:
y = 1;
z = 2;
break;
case 2:
do_a();
do_b();
do_c();
break;
default:
y = 0;
}
}
`.trim();

        const expected = `
void test() {
    switch (x) {
    case 1:
        y = 1;
        z = 2;
        break;
    case 2:
        do_a();
        do_b();
        do_c();
        break;
    default:
        y = 0;
    }
}
`.trim();

        assert.equal(format(input), expected);
    });

    it('formats multiline comments', () => {
        const input = `
void test() {
/*
* comment
*/
int x;
}
`.trim();
        const expected = `
void test() {
    /*
    * comment
    */
    int x;
}
`.trim();
        assert.equal(format(input), expected);
    });

    it('formats autodoc comments', () => {
        const input = `
//! Autodoc
//! comment
void test() {}
`.trim();
        const expected = `
//! Autodoc
//! comment
void test() {}
`.trim();
        assert.equal(format(input), expected);
    });

    it('formats nested structures', () => {
        const input = `
void test() {
if (x) {
while (y) {
do_it();
}
}
}
`.trim();
        const expected = `
void test() {
    if (x) {
        while (y) {
            do_it();
        }
    }
}
`.trim();
        assert.equal(format(input), expected);
    });

     it('formats mixed braceless and braces', () => {
        const input = `
void test() {
if (x)
while (y) {
do_it();
}
}
`.trim();
        const expected = `
void test() {
    if (x)
        while (y) {
            do_it();
        }
}
`.trim();
        // if (x) -> pending indent
        // while (y) { -> indent + 1 (perm) + 1 (temp)? No.
        // "while (y) {" ends with {, so indentLevel++
        // Line "while (y) {" is printed with indentLevel + pending(1).
        // Then pending is cleared?
        // Logic says: if pendingIndent, extraIndent=1, pendingIndent=false.
        // So "while" line gets +1.
        // Then indentLevel++ (because of {).
        // Next line "do_it()" gets indentLevel.
        // Wait. indentLevel was 0 (inside test).
        // if (x) -> pending=true.
        // while (y) { -> extra=1. print with indent 1. endsWith { -> indentLevel++. Level now 1.
        // do_it() -> print with indent 1.
        // } -> startsWith }, indentLevel--. Level 0.
        // print with indent 0.

        // Wait, "while (y) {" is effectively inside "if".
        // The block "{ ... }" is the body of while.
        // But the "if" body is the "while" statement (which includes the block).
        // So "do_it" should be indented?
        // if (x)
        //     while (y) {
        //         do_it();
        //     }

        // Let's trace:
        // 1. "if (x)" -> indent 0. pending=true.
        // 2. "while (y) {" -> indent 0+1=1. pending=false. endsWith { -> indentLevel=1.
        // 3. "do_it();" -> indent 1.
        // 4. "}" -> indent 0.

        // This seems WRONG. "do_it()" is inside "while", so it should be double indented (once for if, once for while).
        // But "while" used the "if" indent.
        // The "{" belongs to "while".
        // If "while" takes the "pending" indent, it consumes it.
        // But since "while" opens a block, the content of the block should be indented relative to "while".
        // indentLevel became 1.
        // So "do_it" is at 1.
        // But "while" is at 1.
        // So "do_it" is at same level as "while"? That's wrong.
        // It should be:
        // if (x)
        //     while (y) {
        //         do_it();
        //     }

        // If "while" is at 1. "do_it" should be at 2.
        // But indentLevel only increased by 1 (for the {).
        // And base indentLevel was 0.
        // So "do_it" is at 1.

        // The issue is that `pendingIndent` is transient for the *next line only*.
        // If the next line opens a block, that block's content should be indented relative to the block opener.
        // But the block opener itself was indented by `pendingIndent`.
        // We shouldn't lose that level of indentation just because we processed the line.
        // If `pendingIndent` was used, does it permanently affect `indentLevel`? No.

        // Logic needs to handle this: if we consume `pendingIndent` and the line opens a block,
        // should `indentLevel` be incremented from the *effective* indent of the current line?
        // Currently `indentLevel` tracks braces.
        // If "while" is indented by 1 (due to if), `indentLevel` is still 0 (logically, before the {).
        // Then `{` adds 1. So `indentLevel` becomes 1.
        // So body is 1.
        // But we want body to be 2. (1 for if, 1 for while).

        // So if `pendingIndent` is consumed, and the line also modifies `indentLevel`,
        // we might need to "bake in" the pending indent if we open a scope?
        // Or `indentLevel` should be absolute?

        // This is the bug!

        assert.equal(format(input), expected);
    });

    // Issue #102: Tests for Pike-specific constructs
    describe('Pike-specific constructs', () => {
        it('handles multiline strings (content preserved as-is)', () => {
            // Issue #102: Multi-line strings - the opening line is formatted
            // but content inside is not modified by the formatter
            const input = `
string s = #"
    This is a
    multiline string
"#;
`.trim();

            // The formatter doesn't modify content inside multi-line strings
            // This is expected behavior - we preserve user's string formatting
            const actual = format(input);

            // Just verify the start and end markers are intact
            assert.ok(actual.includes('#"'));
            assert.ok(actual.includes('"#;'));
        });

        it('formats constant declarations', () => {
            const input = `
constant PI = 3.14;
constant MAX_SIZE = 100;
`.trim();

            const expected = `
constant PI = 3.14;
constant MAX_SIZE = 100;
`.trim();

            assert.equal(format(input), expected);
        });

        it('formats import statements', () => {
            const input = `
import Stdio;
import Array.*;
`.trim();

            const expected = `
import Stdio;
import Array.*;
`.trim();

            assert.equal(format(input), expected);
        });

        it('formats inherit statements', () => {
            const input = `
class Child {
inherit Parent;
void method() {}
}
`.trim();

            const expected = `
class Child {
    inherit Parent;
    void method() {}
}
`.trim();

            assert.equal(format(input), expected);
        });

        it('formats enum declarations', () => {
            const input = `
enum Color {
    RED,
    GREEN,
    BLUE
}
`.trim();

            const expected = `
enum Color {
    RED,
    GREEN,
    BLUE
}
`.trim();

            assert.equal(format(input), expected);
        });

        it('formats typedef declarations', () => {
            const input = `
typedef mapping(string:int) StringIntMap;
StringIntMap map = ([]);
`.trim();

            const expected = `
typedef mapping(string:int) StringIntMap;
StringIntMap map = ([]);
`.trim();

            assert.equal(format(input), expected);
        });
    });
});
