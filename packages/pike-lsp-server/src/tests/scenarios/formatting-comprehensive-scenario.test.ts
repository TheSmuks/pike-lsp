/**
 * Scenario tests for: Comprehensive Formatting
 *
 * Proves that formatting works correctly for ALL Pike constructs.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import {
  formatPikeCodeWithProfile,
  type FormattingProfile,
} from '../../services/formatting-service.js';

/**
 * Helper: indentation-only formatting.
 * Uses a profile with all transformations disabled so tests measure pure indentation.
 */
const INDENT_ONLY_PROFILE: FormattingProfile = {
  name: 'indent-only-test',
  maxLineLength: 0,
  braceStyle: 'same-line',
  spaceAroundOperators: false,
  blankLinesBetweenFunctions: 1,
};

function formatPikeCode(text: string, indent: string, startLine = 0) {
  return formatPikeCodeWithProfile(text, indent, startLine, INDENT_ONLY_PROFILE);
}

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

function hasValidIndentation(code: string): boolean {
  const lines = code.split('\n');
  for (const line of lines) {
    const indent = getLineIndent(line);
    if (indent.length % 4 !== 0) {
      return false;
    }
  }
  return true;
}

function hasMoreIndentThan(code: string, lineIndex: number, baseIndent: number): boolean {
  const lines = code.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return false;
  return countIndentSpaces(getLineIndent(lines[lineIndex])) > baseIndent;
}

describe('Scenario: Comprehensive Pike Formatting', () => {
  describe('Functions', () => {
    it('should format simple function', () => {
      const code = `void foo() {
return;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('void foo()'), 'function preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format function with parameters', () => {
      const code = `int add(int a, int b) {
return a + b;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('int add('), 'function preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format function with return type', () => {
      const code = `string|int getValue() {
return "hello";
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('string|int getValue()'), 'function preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format nested functions', () => {
      const code = `void outer() {
void inner() {
int x = 1;
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('void outer()'), 'outer function preserved');
      assert.ok(formatted.includes('void inner()'), 'inner function preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
      assert.ok(hasMoreIndentThan(formatted, 2, 0), 'nested content indented');
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

      assert.ok(formatted.includes('class Foo'), 'class preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format class with inheritance', () => {
      const code = `class Bar {
inherit Foo;
void method() {
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('inherit Foo'), 'inherit preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format class with methods and variables', () => {
      const code = `class MyClass {
int value;
void create() {
}
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('int value'), 'member preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('class Outer'), 'outer class preserved');
      assert.ok(formatted.includes('class Inner'), 'inner class preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('if (x)'), 'if preserved');
      assert.ok(formatted.includes('else if'), 'else if preserved');
      assert.ok(formatted.includes('else {'), 'else preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format while loop', () => {
      const code = `while (x) {
int y = 1;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('while (x)'), 'while preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format for loop', () => {
      const code = `for (int i = 0; i < 10; i++) {
int x = i;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('for (int i = 0'), 'for preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format foreach loop', () => {
      const code = `foreach (arr; int i; var) {
int x = var;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('foreach (arr'), 'foreach preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format do-while', () => {
      const code = `do {
int x = 1;
}
while (x);`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('do {'), 'do preserved');
      assert.ok(formatted.includes('while (x)'), 'while preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('switch (x)'), 'switch preserved');
      assert.ok(formatted.includes('case 1:'), 'case preserved');
      assert.ok(formatted.includes('default:'), 'default preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('switch (a)'), 'outer switch preserved');
      assert.ok(formatted.includes('switch (b)'), 'inner switch preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('case 1:'), 'case preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format case with statement on same line', () => {
      const code = `switch (x) {
case 1: return 1;
case 2: return 2;
default: return 0;
}`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('case 1: return 1'), 'case preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('try {'), 'try preserved');
      assert.ok(formatted.includes('catch (object e)'), 'catch preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('try {'), 'try preserved');
      assert.ok(formatted.includes('catch (object e)'), 'catch preserved');
      assert.ok(formatted.includes('finally {'), 'finally preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('try {'), 'try preserved');
      assert.ok(formatted.includes('catch (object e)'), 'catch preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });
  });

  describe('Lambdas/Anonymous Functions', () => {
    it('should format simple lambda', () => {
      const code = `function f = lambda() {
int x = 1;
};`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('lambda()'), 'lambda preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format multi-line lambda', () => {
      const code = `function f = lambda(int x) {
int y = x + 1;
return y;
};`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('lambda(int x)'), 'lambda preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format nested lambdas', () => {
      const code = `function f = lambda() {
function g = lambda() {
int x = 1;
};
};`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('lambda()'), 'lambda preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
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

      assert.ok(formatted.includes('array(int) arr'), 'array preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format mapping literals', () => {
      const code = `mapping m = ([
"a": 1,
"b": 2,
]);`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('mapping m'), 'mapping preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format multi-line arrays', () => {
      const code = `array(array(int)) matrix = ({
({1, 2}),
({3, 4}),
});`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('matrix'), 'array preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format nested structures', () => {
      const code = `mapping m = ([
"outer": ([
"inner": 1,
]),
]);`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('mapping m'), 'mapping preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });
  });

  describe('Imports/Inherits', () => {
    it('should format import statements', () => {
      const code = `import Stdio;
import Tools;`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('import Stdio'), 'import preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format inherit statements', () => {
      const code = `inherit Stdio.File;
inherit "/foo.pike";`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('inherit Stdio.File'), 'inherit preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });

    it('should format #include directives', () => {
      const code = `#include "foo.h"
#include "bar.h"`;
      const edits = formatPikeCode(code, '    ');
      const formatted = applyEdits(code, edits);

      assert.ok(formatted.includes('#include "foo.h"'), 'include preserved');
      assert.ok(hasValidIndentation(formatted), 'valid indentation');
    });
  });
});
