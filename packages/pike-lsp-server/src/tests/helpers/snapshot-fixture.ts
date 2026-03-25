export interface FixtureRange {
  start: number;
  end: number;
  label?: string;
}

export interface SnapshotFixture {
  code: string;
  cursorOffset: number | null;
  ranges: FixtureRange[];
}

export function parseSnapshotFixture(input: string): SnapshotFixture {
  let cursorOffset: number | null = null;
  const ranges: FixtureRange[] = [];
  let code = '';
  let i = 0;

  while (i < input.length) {
    if (input.startsWith('$0', i)) {
      cursorOffset = code.length;
      i += 2;
      continue;
    }

    if (input.startsWith('[|', i)) {
      const start = code.length;
      i += 2;
      while (i < input.length && !input.startsWith('|]', i)) {
        code += input[i]!;
        i += 1;
      }
      if (!input.startsWith('|]', i)) {
        throw new Error('Unterminated [|...|] range marker');
      }
      const end = code.length;
      ranges.push({ start, end });
      i += 2;
      continue;
    }

    if (input.startsWith('{|', i)) {
      i += 2;
      const labelStart = i;
      while (i < input.length && input[i] !== ':') {
        i += 1;
      }
      if (i >= input.length || input[i] !== ':') {
        throw new Error('Invalid {|label:...|} marker: missing label separator');
      }
      const label = input.slice(labelStart, i).trim();
      i += 1;
      const start = code.length;
      while (i < input.length && !input.startsWith('|}', i)) {
        code += input[i]!;
        i += 1;
      }
      if (!input.startsWith('|}', i)) {
        throw new Error('Unterminated {|label:...|} range marker');
      }
      const end = code.length;
      ranges.push({ start, end, label });
      i += 2;
      continue;
    }

    code += input[i]!;
    i += 1;
  }

  return {
    code,
    cursorOffset,
    ranges,
  };
}
