/**
 * Scenario tests for: Comprehensive Formatting
 *
 * Proves that formatting works correctly for ALL Pike constructs.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { formatPikeCode } from '../../features/advanced/formatting.js';

function applyEdits(code: string, edits: ReturnType<typeof formatPikeCode>): string {
  const lines = code.split('\n');
  const sortedEdits = [...edits].sort((a, b) => b.range.start.line - a.range.start.line);

  for (const edit of sortedEdits) {
    const line = edit.range.start.line;
    if (line >= 0 && line < lines.length) {
      const originalLine = lines[line] ?? '';
      const currentIndent = originalLine.match(/^(\s*)/)?.[1] ?? '';
      lines[line] = edit.newText + originalLine.slice(currentIndent.length);
    }
  }

  return lines.join('\n');
}

function getLineIndent(line: string): string {
  return line.match(/^(\s*)/)?.[1] ?? '';
}

function countIndentSpaces(indent: string): number {
  return indent.length / 4;
}

describe('Scenario: Comprehensive Pike Formatting', () => {
  describe('Functions', () => {
    it('should format simple function', () => {
      const code = `void foo() {
return;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(getLineIndent(lines[0]), '');
      assert.strictEqual(getLineIndent(lines[1]), '        ');
      assert.strictEqual(getLineIndent(lines[2]), '');
    });

    it('should format function with parameters', () => {
      const code = `int add(int a, int b) {
return a + b;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(getLineIndent(lines[0]), '');
      assert.strictEqual(getLineIndent(lines[1]), '        ');
    });

    it('should format function with return type', () => {
      const code = `string|int getValue() {
return "hello";
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(getLineIndent(lines[0]), '');
      assert.strictEqual(getLineIndent(lines[1]), '        ');
    });

    it('should format nested functions', () => {
      const code = `void outer() {
void inner() {
int x = 1;
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 0);
    });
  });

  describe('Classes', () => {
    it('should format simple class', () => {
      const code = `class Foo {
int x;
void bar() {
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 0);
    });

    it('should format class with inheritance', () => {
      const code = `class Bar {
inherit Foo;
void method() {
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 0);
    });

    it('should format class with methods and variables', () => {
      const code = `class MyClass {
int value;
string name;
void create() {
}
int getValue() {
return value;
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[7])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[8])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[9])), 0);
    });

    it('should format nested classes', () => {
      const code = `class Outer {
class Inner {
void method() {
}
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
    });
  });

  describe('Control Flow', () => {
    it('should format if/else if/else', () => {
      const code = `if (x) {
int a = 1;
}
else if (y) {
int b = 2;
}
else {
int c = 3;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[7])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[8])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[9])), 0);
    });

    it('should format while loop', () => {
      const code = `while (x) {
int y = 1;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
    });

    it('should format for loop', () => {
      const code = `for (int i = 0; i < 10; i++) {
int x = i;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
    });

    it('should format foreach loop', () => {
      const code = `foreach (arr; int i; var) {
int x = var;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
    });

    it('should format do-while', () => {
      const code = `do {
int x = 1;
}
while (x);`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
    });
  });

  describe('Switch/Case', () => {
    it('should format simple switch', () => {
      const code = `switch (x) {
case 1:
break;
default:
break;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 0);
    });

    it('should format nested switches', () => {
      const code = `switch (a) {
case 1:
switch (b) {
case 2:
break;
}
break;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 4);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[7])), 0);
    });

    it('should format case with braces', () => {
      const code = `switch (x) {
case 1: {
int y = 1;
break;
}
default:
break;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[7])), 0);
    });

    it('should format case with statement on same line', () => {
      const code = `switch (x) {
case 1: return 1;
case 2: return 2;
default: return 0;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 0);
    });
  });

  describe('Try/Catch', () => {
    it('should format try/catch', () => {
      const code = `try {
int x = 1;
}
catch (object e) {
int y = 2;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
    });

    it('should format try/catch/finally', () => {
      const code = `try {
int x = 1;
}
catch (object e) {
int y = 2;
}
finally {
int z = 3;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[7])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[8])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[9])), 0);
    });

    it('should format nested try/catch', () => {
      const code = `try {
try {
int x = 1;
}
catch (object e) {
int y = 2;
}
}
catch (object e) {
int z = 3;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[7])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[8])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[9])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[10])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[11])), 0);
    });
  });

  describe('Lambdas/Anonymous Functions', () => {
    it('should format simple lambda', () => {
      const code = `function f = lambda() {
int x = 1;
};`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 0);
    });

    it('should format multi-line lambda', () => {
      const code = `function f = lambda(int x) {
int y = x + 1;
return y;
};`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 0);
    });

    it('should format nested lambdas', () => {
      const code = `function f = lambda() {
function g = lambda() {
int x = 1;
};
};`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
    });
  });

  describe('Arrays/Mappings', () => {
    it('should format array literals', () => {
      const code = `array(int) arr = ({
1,
2,
3,
});`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 0);
    });

    it('should format mapping literals', () => {
      const code = `mapping m = ([
"a": 1,
"b": 2,
]);`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 0);
    });

    it('should format multi-line arrays', () => {
      const code = `array(array(int)) matrix = ({
({1, 2}),
({3, 4}),
});`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
    });

    it('should format nested structures', () => {
      const code = `mapping m = ([
"outer": ([
"inner": 1,
]),
]);`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[0])), 0);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[1])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[2])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[3])), 3);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[4])), 2);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[5])), 1);
      assert.strictEqual(countIndentSpaces(getLineIndent(lines[6])), 0);
    });
  });

  describe('Imports/Inherits', () => {
    it('should format import statements', () => {
      const code = `import Stdio;
import Tools;`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(getLineIndent(lines[0]), '');
      assert.strictEqual(getLineIndent(lines[1]), '');
    });

    it('should format inherit statements', () => {
      const code = `inherit Stdio.File;
inherit "/foo.pike";`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(getLineIndent(lines[0]), '');
      assert.strictEqual(getLineIndent(lines[1]), '');
    });

    it('should format #include directives', () => {
      const code = `#include "foo.h"
#include "bar.h"`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      const lines = formatted.split('\n');
      assert.strictEqual(getLineIndent(lines[0]), '');
      assert.strictEqual(getLineIndent(lines[1]), '');
    });
  });
});
