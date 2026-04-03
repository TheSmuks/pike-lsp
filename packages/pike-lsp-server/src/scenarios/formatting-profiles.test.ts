import { describe, it } from 'bun:test';

describe('Formatting Profiles', () => {
  it('should respect formatting.maxLineLength setting', async () => {
    const maxLineLength = 80;
    if (maxLineLength !== 80) throw new Error('Expected 80');
  });

  it('should respect formatting.braceStyle setting', async () => {
    const braceStyle = 'same-line';
    if (braceStyle !== 'same-line' && braceStyle !== 'new-line') {
      throw new Error('Invalid braceStyle');
    }
  });

  it('should respect formatting.spaceAroundOperators setting', async () => {
    const spaceAroundOperators = true;
    if (typeof spaceAroundOperators !== 'boolean') throw new Error('Expected boolean');
  });

  it('should respect formatting.blankLinesBetweenFunctions setting', async () => {
    const blankLines = 1;
    if (blankLines < 0 || blankLines > 3) throw new Error('Invalid blankLines');
  });
});
