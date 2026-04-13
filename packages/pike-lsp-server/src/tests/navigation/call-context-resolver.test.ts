/**
 * Tests for call-context-resolver.ts (refactored to use bridge.tokenize).
 * Issue #1469: Replaced hand-rolled character scanning with token-based analysis.
 */

import { describe, it, expect } from 'bun:test';
import {
  resolveCallContextAtOffset,
  collectCallContexts,
  type ResolvedCallContext,
} from '../../features/navigation/call-context-resolver.js';
import type { PikeToken } from '@pike-lsp/pike-bridge';

/** Build a PikeToken for testing. */
function tok(text: string, line: number, character: number): PikeToken {
  return { text, line, character, file: 'test.pike' };
}

/** Create tokens by naive splitting — good enough for these structural tests. */
function naiveTokenize(text: string): PikeToken[] {
  const tokens: PikeToken[] = [];
  const lines = text.split('\n');
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln]!;
    let col = 0;
    while (col < line.length) {
      const ch = line[col];
      if (/\s/.test(ch)) {
        // whitespace token
        let end = col;
        while (end < line.length && /\s/.test(line[end]!)) end++;
        tokens.push(tok(line.slice(col, end), ln + 1, col));
        col = end;
        continue;
      }
      if (ch === '/' && line[col + 1] === '/') {
        // line comment
        tokens.push(tok(line.slice(col), ln + 1, col));
        col = line.length;
        continue;
      }
      if (ch === '"' || ch === "'") {
        // simple string literal (non-Pike-extended)
        const quote = ch;
        let end = col + 1;
        while (end < line.length && line[end] !== quote) {
          if (line[end] === '\\') end++;
          end++;
        }
        end = Math.min(end + 1, line.length);
        tokens.push(tok(line.slice(col, end), ln + 1, col));
        col = end;
        continue;
      }
      if (/[a-zA-Z_]/.test(ch)) {
        let end = col;
        while (end < line.length && /[a-zA-Z0-9_]/.test(line[end]!)) end++;
        tokens.push(tok(line.slice(col, end), ln + 1, col));
        col = end;
        continue;
      }
      if (ch === '-' && line[col + 1] === '>') {
        tokens.push(tok('->', ln + 1, col));
        col += 2;
        continue;
      }
      // single-char operator/punctuation
      tokens.push(tok(ch, ln + 1, col));
      col++;
    }
  }
  return tokens;
}

describe('call-context-resolver (token-based)', () => {
  it('resolves simple function call', () => {
    const text = 'foo(1, 2)';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, 6, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('foo');
    expect(result!.target.isMemberCall).toBe(false);
    expect(result!.activeParameter).toBe(1);
  });

  it('resolves member call with ->', () => {
    const text = 'obj->method(1)';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, 13, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('method');
    expect(result!.target.isMemberCall).toBe(true);
    expect(result!.target.memberOperator).toBe('->');
  });

  it('resolves member call with dot', () => {
    const text = 'obj.method(1)';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, 12, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('method');
    expect(result!.target.isMemberCall).toBe(true);
    expect(result!.target.memberOperator).toBe('.');
  });

  it('skips calls inside comments', () => {
    const text = '// foo(1, 2)\nbar(3)';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, text.indexOf('3') + 1, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('bar');
    expect(result!.activeParameter).toBe(0);
  });

  it('skips calls inside strings', () => {
    const text = '"foo(1, 2)"\nbar(3)';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, text.indexOf('3') + 1, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('bar');
  });

  it('returns null when offset is inside a comment', () => {
    const text = '// foo(1)\nbar(2)';
    const tokens = naiveTokenize(text);
    const commentStart = text.indexOf('f');
    const result = resolveCallContextAtOffset(text, commentStart, tokens);
    expect(result).toBeNull();
  });

  it('returns null when offset is inside a string', () => {
    const text = '"hello"\nbar(2)';
    const tokens = naiveTokenize(text);
    const insideString = text.indexOf('h');
    const result = resolveCallContextAtOffset(text, insideString, tokens);
    expect(result).toBeNull();
  });

  it('collects all call contexts', () => {
    const text = 'foo(1);\nbar(2, 3);';
    const tokens = naiveTokenize(text);
    const calls = collectCallContexts(text, tokens);
    expect(calls).toHaveLength(2);
    expect(calls[0].target.name).toBe('foo');
    expect(calls[0].argumentRanges).toHaveLength(1);
    expect(calls[1].target.name).toBe('bar');
    expect(calls[1].argumentRanges).toHaveLength(2);
  });

  it('handles nested parentheses in arguments', () => {
    const text = 'foo(bar(1), 2)';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, text.indexOf('2') + 1, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('foo');
    expect(result!.activeParameter).toBe(1);
  });

  it('handles empty token list gracefully', () => {
    const text = 'foo(1)';
    const result = resolveCallContextAtOffset(text, 5, []);
    expect(result).toBeNull();
  });

  it('ignores control keywords', () => {
    const text = 'if (x) { foo(1); }';
    const tokens = naiveTokenize(text);
    const result = resolveCallContextAtOffset(text, text.indexOf('1') + 1, tokens);
    expect(result).not.toBeNull();
    expect(result!.target.name).toBe('foo');
  });
});
