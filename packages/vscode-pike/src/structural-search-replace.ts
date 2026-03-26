export interface StructuralMatch {
  start: number;
  end: number;
  groups: Record<string, string>;
}

export interface StructuralReplaceResult {
  text: string;
  matches: StructuralMatch[];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLikelyCodeMatch(text: string, startIndex: number): boolean {
  const lineStart = text.lastIndexOf('\n', startIndex) + 1;
  const lineEnd =
    text.indexOf('\n', startIndex) >= 0 ? text.indexOf('\n', startIndex) : text.length;
  const line = text.slice(lineStart, lineEnd);
  const inLineIndex = startIndex - lineStart;
  const before = line.slice(0, inLineIndex);

  const commentIndex = before.indexOf('//');
  if (commentIndex >= 0) {
    return false;
  }

  const quoteCount = (before.match(/"/g) ?? []).length;
  if (quoteCount % 2 === 1) {
    return false;
  }

  return true;
}

export function compileStructuralPattern(pattern: string): RegExp {
  const parts: string[] = [];
  let index = 0;

  while (index < pattern.length) {
    if (pattern.startsWith('$$', index)) {
      index += 2;
      let name = '';
      while (index < pattern.length && /[A-Za-z0-9_]/.test(pattern[index] ?? '')) {
        name += pattern[index];
        index += 1;
      }
      if (!name) {
        throw new Error('Invalid variadic metavariable in structural pattern');
      }
      parts.push(`(?<${name}>[\\s\\S]*?)`);
      continue;
    }

    if (pattern[index] === '$') {
      index += 1;
      let name = '';
      while (index < pattern.length && /[A-Za-z0-9_]/.test(pattern[index] ?? '')) {
        name += pattern[index];
        index += 1;
      }
      if (!name) {
        throw new Error('Invalid metavariable in structural pattern');
      }
      parts.push(`(?<${name}>[\\s\\S]+?)`);
      continue;
    }

    parts.push(escapeRegex(pattern[index]!));
    index += 1;
  }

  return new RegExp(parts.join(''), 'gm');
}

function renderReplacement(template: string, groups: Record<string, string>): string {
  return template.replace(/\$\$?([A-Za-z0-9_]+)/g, (_match, name) => groups[name] ?? '');
}

export function applyStructuralSearchReplace(
  source: string,
  searchPattern: string,
  replacePattern: string
): StructuralReplaceResult {
  const regex = compileStructuralPattern(searchPattern);
  const matches: StructuralMatch[] = [];
  let updated = source;
  let offset = 0;

  for (const match of source.matchAll(regex)) {
    const raw = match[0];
    if (typeof raw !== 'string' || match.index === undefined) {
      continue;
    }

    if (!isLikelyCodeMatch(source, match.index)) {
      continue;
    }

    const groups = (match.groups ?? {}) as Record<string, string>;
    const replacement = renderReplacement(replacePattern, groups);
    const start = match.index;
    const end = start + raw.length;

    const shiftedStart = start + offset;
    const shiftedEnd = end + offset;

    updated = `${updated.slice(0, shiftedStart)}${replacement}${updated.slice(shiftedEnd)}`;
    offset += replacement.length - raw.length;

    matches.push({ start, end, groups });
  }

  return {
    text: updated,
    matches,
  };
}
