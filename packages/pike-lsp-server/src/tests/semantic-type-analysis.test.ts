/**
 * Tests for semantic-type-analysis.ts — Issue #1570
 *
 * Verifies that type mismatch detection uses bridge tokens and
 * introspection data, not source-line regex.
 */

import { describe, it, expect } from 'bun:test';
import { analyzeTypeMismatches } from '../features/diagnostics/semantic-type-analysis.js';
import type { IntrospectionResult, PikeToken } from '@pike-lsp/pike-bridge';

function makeIntrospection(variables: Array<{ name: string; type: string }>): IntrospectionResult {
  return {
    variables: variables.map(v => ({
      name: v.name,
      type: { kind: 'name', name: v.type },
    })),
  } as IntrospectionResult;
}

function token(text: string, line: number, character: number): PikeToken {
  return { text, line, character, file: 0 };
}

describe('analyzeTypeMismatches', () => {
  it('detects string assigned to int variable', () => {
    const intro = makeIntrospection([{ name: 'x', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('x', 1, 0),
      token('=', 1, 2),
      token('"hello"', 1, 4),
      token(';', 1, 12),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('declared as int but assigned string');
    expect(diags[0]!.code).toBe('type-mismatch');
  });

  it('detects int assigned to string variable', () => {
    const intro = makeIntrospection([{ name: 'name', type: 'string' }]);
    const tokens: PikeToken[] = [
      token('name', 1, 0),
      token('=', 1, 5),
      token('42', 1, 7),
      token(';', 1, 9),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('declared as string but assigned int');
  });

  it('allows compatible int assignment to float variable', () => {
    const intro = makeIntrospection([{ name: 'f', type: 'float' }]);
    const tokens: PikeToken[] = [
      token('f', 1, 0),
      token('=', 1, 2),
      token('42', 1, 4),
      token(';', 1, 6),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('allows float assignment to int variable', () => {
    const intro = makeIntrospection([{ name: 'n', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('n', 1, 0),
      token('=', 1, 2),
      token('3.14', 1, 4),
      token(';', 1, 8),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('does not false-positive on == comparison', () => {
    const intro = makeIntrospection([{ name: 'x', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('x', 1, 0),
      token('=', 1, 2),
      token('=', 1, 3), // This is ==, not assignment
      token('5', 1, 5),
      token(';', 1, 6),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('does not false-positive on != comparison', () => {
    const intro = makeIntrospection([{ name: 'x', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('x', 1, 0),
      token('!', 1, 2),
      token('=', 1, 3), // This is !=, not assignment
      token('5', 1, 5),
      token(';', 1, 6),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('skips undeclared variables', () => {
    const intro = makeIntrospection([{ name: 'x', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('undeclared_var', 1, 0),
      token('=', 1, 15),
      token('"bad"', 1, 17),
      token(';', 1, 23),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('respects maxDiagnostics limit', () => {
    const intro = makeIntrospection([
      { name: 'a', type: 'int' },
      { name: 'b', type: 'int' },
      { name: 'c', type: 'int' },
    ]);
    const tokens: PikeToken[] = [
      token('a', 1, 0),
      token('=', 1, 2),
      token('"x"', 1, 4),
      token(';', 1, 8),
      token('b', 2, 0),
      token('=', 2, 2),
      token('"y"', 2, 4),
      token(';', 2, 8),
      token('c', 3, 0),
      token('=', 3, 2),
      token('"z"', 3, 4),
      token(';', 3, 8),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 2);
    expect(diags).toHaveLength(2);
  });

  it('returns empty for empty introspection variables', () => {
    const intro: IntrospectionResult = { variables: [] };
    const tokens: PikeToken[] = [
      token('x', 1, 0),
      token('=', 1, 2),
      token('"test"', 1, 4),
      token(';', 1, 11),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('allows mixed type assignment to any variable', () => {
    const intro = makeIntrospection([{ name: 'm', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('m', 1, 0),
      token('=', 1, 2),
      token('someFunction()', 1, 4), // non-literal → null → no diagnostic
      token(';', 1, 19),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('detects array literal assigned to string variable', () => {
    const intro = makeIntrospection([{ name: 's', type: 'string' }]);
    const tokens: PikeToken[] = [
      token('s', 1, 0),
      token('=', 1, 2),
      token('({1,2,3})', 1, 4),
      token(';', 1, 13),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('declared as string but assigned array');
  });

  it('allows same-type assignment', () => {
    const intro = makeIntrospection([{ name: 'msg', type: 'string' }]);
    const tokens: PikeToken[] = [
      token('msg', 1, 0),
      token('=', 1, 4),
      token('"hello"', 1, 6),
      token(';', 1, 14),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('does not match non-identifier tokens before equals sign', () => {
    const intro = makeIntrospection([{ name: 'x', type: 'int' }]);
    const tokens: PikeToken[] = [
      token('42', 1, 0), // numeric token, not identifier
      token('=', 1, 3),
      token('5', 1, 5),
      token(';', 1, 6),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(0);
  });

  it('handles negative number literals', () => {
    const intro = makeIntrospection([{ name: 's', type: 'string' }]);
    const tokens: PikeToken[] = [
      token('s', 1, 0),
      token('=', 1, 2),
      token('-42', 1, 4),
      token(';', 1, 7),
    ];

    const diags = analyzeTypeMismatches(intro, tokens, 10);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain('declared as string but assigned int');
  });
});
