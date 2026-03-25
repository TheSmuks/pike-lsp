import { describe, expect, test } from 'bun:test';
import {
  applyStructuralSearchReplace,
  compileStructuralPattern,
} from '../structural-search-replace';

describe('structural search and replace', () => {
  test('compiles metavariable patterns into regex with named groups', () => {
    const regex = compileStructuralPattern('write_to_log($msg, $level)');
    const source = 'write_to_log(error_message, 3);';
    const match = source.match(regex);

    expect(match).toBeDefined();
  });

  test('replaces metavariables in structural rewrite', () => {
    const source = 'write_to_log(error_message, 3);';
    const result = applyStructuralSearchReplace(
      source,
      'write_to_log($msg, $level)',
      'Logger.log($level, $msg)'
    );

    expect(result.matches.length).toBe(1);
    expect(result.text).toContain('Logger.log(3, error_message)');
  });

  test('skips likely comment and string matches', () => {
    const source = `// write_to_log(fake, 1)\nstring s = "write_to_log(fake, 1)";\nwrite_to_log(real, 2);`;
    const result = applyStructuralSearchReplace(
      source,
      'write_to_log($msg, $level)',
      'Logger.log($level, $msg)'
    );

    expect(result.matches.length).toBe(1);
    expect(result.text).toContain('Logger.log(2, real)');
    expect(result.text).toContain('// write_to_log(fake, 1)');
    expect(result.text).toContain('"write_to_log(fake, 1)"');
  });
});
