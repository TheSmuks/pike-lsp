/**
 * Scenario tests for: Switch/case formatting correctness
 *
 * Proves that switch/case formatting produces correct indentation.
 */

import { describe, it } from 'bun:test';
import assert from 'node:assert/strict';
import { formatPikeCode } from '../../features/advanced/formatting.js';

/**
 * Apply formatting edits to get the formatted result
 */
function applyEdits(code: string, edits: ReturnType<typeof formatPikeCode>): string {
  const lines = code.split('\n');
  // Sort edits by line in reverse order to apply from bottom to top
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

describe('Scenario: Switch/case formatting', () => {
  it('should correctly indent simple switch/case', () => {
    const code = `switch (x) {
case 1:
break;
default:
break;
}`;
    
    const edits = formatPikeCode(code, '    ');
    const formatted = applyEdits(code, edits);
    
    console.log('=== Switch/case formatting ===');
    console.log('Input:');
    console.log(code);
    console.log('\nFormatted:');
    console.log(formatted);
    console.log('\nEdits:', JSON.stringify(edits, null, 2));
    
    // Expected: case and default at base+1, body at base+2
    const lines = formatted.split('\n');
    
    // Line 1 (case 1:) should have 4 spaces (1 level)
    const caseLine = lines[1];
    const caseIndent = caseLine?.match(/^(\s*)/)?.[1] ?? '';
    console.log('\ncase line:', JSON.stringify(caseLine));
    assert.strictEqual(caseIndent, '    ', `case should be indented 1 level, got ${caseIndent.length} spaces`);
    
    // Line 2 (break;) should have 8 spaces (2 levels)
    const breakLine = lines[2];
    const breakIndent = breakLine?.match(/^(\s*)/)?.[1] ?? '';
    console.log('break line:', JSON.stringify(breakLine));
    assert.strictEqual(breakIndent, '        ', `break should be indented 2 levels, got ${breakIndent.length} spaces`);
    
    // Line 3 (default:) should have 4 spaces
    const defaultLine = lines[3];
    const defaultIndent = defaultLine?.match(/^(\s*)/)?.[1] ?? '';
    console.log('default line:', JSON.stringify(defaultLine));
    assert.strictEqual(defaultIndent, '    ', `default should be indented 1 level, got ${defaultIndent.length} spaces`);
    
    // Line 4 (break;) should have 8 spaces
    const defaultBreakLine = lines[4];
    const defaultBreakIndent = defaultBreakLine?.match(/^(\s*)/)?.[1] ?? '';
    console.log('default break line:', JSON.stringify(defaultBreakLine));
    assert.strictEqual(defaultBreakIndent, '        ', `default break should be indented 2 levels, got ${defaultBreakIndent.length} spaces`);
  });
  
  it('should handle nested switch statements', () => {
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
    
    console.log('\n=== Nested switch formatting ===');
    console.log('Formatted:');
    console.log(formatted);
    
    const lines = formatted.split('\n');
    
    // case 1: should be at 1 level (4 spaces)
    const case1Line = lines[1];
    const case1Indent = case1Line?.match(/^(\s*)/)?.[1] ?? '';
    console.log('case 1:', JSON.stringify(case1Line));
    assert.strictEqual(case1Indent, '    ', `outer case should be at 1 level`);
    
    // inner switch should be at 2 levels (8 spaces)
    const innerSwitch = lines[2];
    const innerSwitchIndent = innerSwitch?.match(/^(\s*)/)?.[1] ?? '';
    console.log('inner switch:', JSON.stringify(innerSwitch));
    assert.strictEqual(innerSwitchIndent, '        ', `inner switch should be at 2 levels`);
    
    // case 2: should be at 3 levels (12 spaces)
    const case2Line = lines[3];
    const case2Indent = case2Line?.match(/^(\s*)/)?.[1] ?? '';
    console.log('case 2:', JSON.stringify(case2Line));
    assert.strictEqual(case2Indent, '            ', `inner case should be at 3 levels`);
    
    // inner break should be at 4 levels (16 spaces)
    const innerBreak = lines[4];
    const innerBreakIndent = innerBreak?.match(/^(\s*)/)?.[1] ?? '';
    console.log('inner break:', JSON.stringify(innerBreak));
    assert.strictEqual(innerBreakIndent, '                ', `inner break should be at 4 levels`);
  });
  
  it('should handle case with statement on same line', () => {
    const code = `switch (x) {
case 1: return 1;
case 2: return 2;
default: return 0;
}`;
    
    const edits = formatPikeCode(code, '    ');
    const formatted = applyEdits(code, edits);
    
    console.log('\n=== Case with statement on same line ===');
    console.log('Formatted:');
    console.log(formatted);
    
    const lines = formatted.split('\n');
    
    // All case lines should be at 1 level
    for (let i = 1; i <= 3; i++) {
      const line = lines[i];
      console.log(`Line ${i}:`, JSON.stringify(line));
      assert.ok(line?.startsWith('    '), `case line ${i} should be at 1 level`);
    }
  });
  
  it('should handle braces inside case blocks', () => {
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
    
    console.log('\n=== Case with braces ===');
    console.log('Formatted:');
    console.log(formatted);
    
    const lines = formatted.split('\n');
    
    // case 1: { should be at 1 level
    const case1Line = lines[1];
    console.log('case 1:', JSON.stringify(case1Line));
    assert.ok(case1Line?.startsWith('    '), `case with brace should be at 1 level`);
    
    // int y = 1; should be at 2 levels
    const declLine = lines[2];
    console.log('declaration:', JSON.stringify(declLine));
    assert.ok(declLine?.startsWith('        '), `statement inside case block should be at 2 levels`);
  });
});
